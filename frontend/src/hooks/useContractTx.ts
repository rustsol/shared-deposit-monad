// One shared path for every real contract write, driving the conceptual
// transaction-state model. A returned hash is only BROADCAST; a receipt makes
// it MINED_SUCCESS/MINED_REVERTED; VERIFIED requires the caller's direct
// contract-state check to pass. Receipts are polled directly (viem's block
// watcher stalls against Monad's load-balanced RPC), with a bounded timeout
// that surfaces TIMEOUT_OR_RPC_ERROR + Retry instead of hanging forever or
// falsely reporting failure.

import { useCallback } from 'react'
import { useAccount, useChainId, useWriteContract } from 'wagmi'
import { getPublicClient, simulateContract } from 'wagmi/actions'
import { BaseError, ContractFunctionRevertedError, type TransactionReceipt } from 'viem'
import { monadTestnet, wagmiConfig } from '../lib/chain'
import { useTx } from '../app/TxContext'

async function fetchReceiptOnce(hash: `0x${string}`): Promise<TransactionReceipt | null> {
  const client = getPublicClient(wagmiConfig)
  if (!client) throw new Error('no RPC client available')
  if (client.chain?.id !== monadTestnet.id) {
    throw new Error(`RPC client is on the wrong chain (${client.chain?.id})`)
  }
  try {
    return await client.getTransactionReceipt({ hash })
  } catch {
    return null // not found yet, or a stale load-balanced node
  }
}

function friendlyWriteError(message: string): string {
  if (/insufficient funds/i.test(message)) {
    return 'this wallet has no MON to pay gas. Fund it with a little Monad Testnet MON and try again. (Deposit recipients do not deposit funds, but every wallet still needs a little MON for gas.)'
  }
  return message.split('\n')[0]
}

/** Decodes a simulate/preflight revert into a plain reason where possible. */
function decodeRevert(error: unknown): string | null {
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError)
    if (revert instanceof ContractFunctionRevertedError) {
      return revert.data?.errorName ?? revert.reason ?? revert.shortMessage
    }
    if (/insufficient funds/i.test(error.message)) return null // not a revert
    return error.shortMessage
  }
  return null
}

export interface ContractTxRequest {
  label: string
  functionName: string
  address: `0x${string}`
  abi: readonly unknown[]
  args: readonly unknown[]
  value?: bigint
  /** Direct contract-state check; VERIFIED requires it to resolve true. */
  verify?: (hash: `0x${string}`) => Promise<boolean>
}

const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS = 90_000

export function useContractTx() {
  const { writeContractAsync } = useWriteContract()
  const { address: account } = useAccount()
  const chainId = useChainId()
  const { track, update } = useTx()

  const send = useCallback(
    async (request: ContractTxRequest): Promise<`0x${string}` | null> => {
      // Preflight simulation with the exact caller and args. If the call would
      // revert, we surface the decoded reason and NEVER open a transaction
      // state or persist a hash — the wallet is not even asked to sign.
      try {
        await simulateContract(wagmiConfig, {
          account,
          address: request.address,
          abi: request.abi as never,
          functionName: request.functionName as never,
          args: request.args as never,
          value: request.value,
        })
      } catch (error) {
        const revert = decodeRevert(error)
        if (revert) {
          track({
            label: request.label,
            functionName: request.functionName,
            status: 'MINED_REVERTED',
            chainId,
            contractAddress: request.address,
            submittedAt: Date.now(),
            error: `would revert: ${revert} — not submitted`,
          })
          return null
        }
        // Not a revert (e.g. RPC hiccup): fall through and let the wallet try.
      }

      const id = track({
        label: request.label,
        functionName: request.functionName,
        status: 'WAITING_FOR_WALLET',
        chainId,
        contractAddress: request.address,
        connectedWallet: account,
        submittedAt: Date.now(),
      })

      let hash: `0x${string}`
      try {
        hash = await writeContractAsync({
          address: request.address,
          abi: request.abi as never,
          functionName: request.functionName as never,
          args: request.args as never,
          value: request.value,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/reject|denied/i.test(message)) {
          update(id, { status: 'USER_REJECTED' })
        } else {
          // No hash was produced: never show Broadcast/Pending/Mined.
          update(id, { status: 'TIMEOUT_OR_RPC_ERROR', error: friendlyWriteError(message) })
        }
        return null
      }

      update(id, { status: 'BROADCAST', hash })

      // Poll for the receipt directly with a bounded timeout.
      update(id, { status: 'PENDING_ONCHAIN', hash })
      const deadline = Date.now() + POLL_TIMEOUT_MS
      let receipt: TransactionReceipt | null = null
      for (;;) {
        try {
          receipt = await fetchReceiptOnce(hash)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          update(id, { status: 'TIMEOUT_OR_RPC_ERROR', hash, error: message })
          return null
        }
        if (receipt) break
        if (Date.now() > deadline) {
          // Preserve the hash; this is NOT a failure — it may still confirm.
          update(id, {
            status: 'TIMEOUT_OR_RPC_ERROR',
            hash,
            error: 'still pending — check the explorer or retry status',
          })
          return null
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      }

      if (receipt.status !== 'success') {
        update(id, { status: 'MINED_REVERTED', hash, error: 'transaction reverted onchain' })
        return null
      }
      update(id, { status: 'MINED_SUCCESS', hash })

      if (request.verify) {
        update(id, { status: 'REFRESHING_CONTRACT_STATE', hash })
        try {
          const ok = await request.verify(hash)
          if (!ok) {
            // Receipt success but the expected state change is not visible:
            // do NOT claim VERIFIED — surface it as a real problem.
            update(id, {
              status: 'TIMEOUT_OR_RPC_ERROR',
              hash,
              error: 'mined, but the expected contract state change was not observed',
            })
            return null
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          update(id, { status: 'TIMEOUT_OR_RPC_ERROR', hash, error: message })
          return null
        }
      }
      update(id, { status: 'VERIFIED', hash })
      return hash
    },
    [account, chainId, track, update, writeContractAsync],
  )

  /** Resume/retry receipt polling for a recovered or timed-out transaction,
   *  using the exact same real hash. A shorter window keeps recovery snappy;
   *  a still-missing transaction is reported honestly, not left pending. */
  const retryReceipt = useCallback(
    async (id: string, hash: `0x${string}`, windowMs = POLL_TIMEOUT_MS): Promise<void> => {
      update(id, { status: 'PENDING_ONCHAIN', hash })
      const deadline = Date.now() + windowMs
      for (;;) {
        const receipt = await fetchReceiptOnce(hash).catch(() => null)
        if (receipt) {
          update(id, {
            status: receipt.status === 'success' ? 'VERIFIED' : 'MINED_REVERTED',
            hash,
            error: receipt.status === 'success' ? undefined : 'transaction reverted onchain',
          })
          return
        }
        if (Date.now() > deadline) {
          update(id, {
            status: 'TIMEOUT_OR_RPC_ERROR',
            hash,
            error:
              'not found on Monad Testnet. It may have failed to broadcast (for example, the ' +
              'wallet had no MON for gas). Retry to re-check, or dismiss.',
          })
          return
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      }
    },
    [update],
  )

  return { send, retryReceipt }
}
