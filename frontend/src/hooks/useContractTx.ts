// One shared path for every real contract write, driving the conceptual
// transaction-state model. A returned hash is only BROADCAST; a receipt makes
// it MINED_SUCCESS/MINED_REVERTED; VERIFIED requires the caller's direct
// contract-state check to pass. Receipts are polled directly (viem's block
// watcher stalls against Monad's load-balanced RPC), with a bounded timeout
// that surfaces TIMEOUT_OR_RPC_ERROR + Retry instead of hanging forever or
// falsely reporting failure.

import { useCallback } from 'react'
import { useChainId, useWriteContract } from 'wagmi'
import { getPublicClient } from 'wagmi/actions'
import type { TransactionReceipt } from 'viem'
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
  const chainId = useChainId()
  const { track, update } = useTx()

  const send = useCallback(
    async (request: ContractTxRequest): Promise<`0x${string}` | null> => {
      const id = track({
        label: request.label,
        functionName: request.functionName,
        status: 'WAITING_FOR_WALLET',
        chainId,
        contractAddress: request.address,
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
          update(id, { status: 'TIMEOUT_OR_RPC_ERROR', error: message.split('\n')[0] })
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
    [chainId, track, update, writeContractAsync],
  )

  /** Retry receipt verification for a recovered/timed-out transaction. */
  const retryReceipt = useCallback(
    async (id: string, hash: `0x${string}`): Promise<void> => {
      update(id, { status: 'PENDING_ONCHAIN', hash })
      const deadline = Date.now() + POLL_TIMEOUT_MS
      for (;;) {
        const receipt = await fetchReceiptOnce(hash).catch(() => null)
        if (receipt) {
          update(id, {
            status: receipt.status === 'success' ? 'VERIFIED' : 'MINED_REVERTED',
            hash,
          })
          return
        }
        if (Date.now() > deadline) {
          update(id, { status: 'TIMEOUT_OR_RPC_ERROR', hash, error: 'still pending' })
          return
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      }
    },
    [update],
  )

  return { send, retryReceipt }
}
