// One shared path for every real contract write, driving the conceptual
// transaction-state model with a single-flight action lock and honest
// reconciliation.
//
// A returned hash is only BROADCAST. Receipt success + a direct contract-state
// check makes it VERIFIED. A transaction that never becomes observable is
// classified NOT_FOUND (terminal) rather than left pending forever. A pending
// transaction whose nonce sits ahead of the sender's latest nonce is
// NONCE_BLOCKED. Every write is preceded by a simulate() preflight, so a call
// that would revert never opens a transaction state or prompts the wallet.

import { useCallback } from 'react'
import { useAccount, useChainId, useWriteContract } from 'wagmi'
import { getConnectorClient, getPublicClient, simulateContract } from 'wagmi/actions'
import { BaseError, ContractFunctionRevertedError, type EIP1193Provider, type TransactionReceipt } from 'viem'
import { monadTestnet, wagmiConfig } from '../lib/chain'
import { classifyPropagation } from '../lib/diagnostics'
import { useTx } from '../app/TxContext'

// Is the transaction observable through a given provider yet?
async function appSeesTx(hash: `0x${string}`): Promise<boolean> {
  const client = getPublicClient(wagmiConfig)
  if (!client) return false
  try {
    await client.getTransaction({ hash })
    return true
  } catch {
    return false
  }
}

async function walletSeesTx(hash: `0x${string}`): Promise<boolean> {
  try {
    const client = await getConnectorClient(wagmiConfig)
    const provider = client.transport as unknown as EIP1193Provider
    const tx = await provider.request({
      method: 'eth_getTransactionByHash',
      params: [hash],
    } as never)
    return tx != null
  } catch {
    return false
  }
}

const PROPAGATION_WINDOW_MS = 15_000
const PROPAGATION_EXTENDED_MS = 30_000

/** Confirms the wallet actually broadcast the transaction to Monad Testnet by
 *  checking BOTH the official RPC and the injected wallet provider. Returns
 *  when the official RPC sees it (proceed to receipt polling) or a terminal
 *  propagation outcome is reached. */
async function confirmPropagation(hash: `0x${string}`): Promise<
  'APP_CONFIRMED' | 'BROADCAST_FAILED_NOT_PROPAGATED' | 'WALLET_RPC_DIVERGED'
> {
  const start = Date.now()
  for (;;) {
    const [appSeen, walletSeen] = await Promise.all([appSeesTx(hash), walletSeesTx(hash)])
    const decision = classifyPropagation({
      walletSeen,
      appSeen,
      elapsedMs: Date.now() - start,
      windowMs: PROPAGATION_WINDOW_MS,
      extendedMs: PROPAGATION_EXTENDED_MS,
    })
    if (decision === 'APP_CONFIRMED') return 'APP_CONFIRMED'
    if (decision === 'BROADCAST_FAILED_NOT_PROPAGATED') return 'BROADCAST_FAILED_NOT_PROPAGATED'
    if (decision === 'WALLET_RPC_DIVERGED') return 'WALLET_RPC_DIVERGED'
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
}

type Classification =
  | { kind: 'mined_success'; receipt: TransactionReceipt }
  | { kind: 'mined_reverted'; receipt: TransactionReceipt }
  | { kind: 'nonce_blocked'; nonce: number; latest: number }
  | { kind: 'pending' }
  | { kind: 'not_found' }

async function inspectOnce(hash: `0x${string}`): Promise<Classification> {
  const client = getPublicClient(wagmiConfig)
  if (!client) throw new Error('no RPC client available')
  if (client.chain?.id !== monadTestnet.id) {
    throw new Error(`RPC client is on the wrong chain (${client.chain?.id})`)
  }
  // Receipt is authoritative when present.
  let receipt: TransactionReceipt | null = null
  try {
    receipt = await client.getTransactionReceipt({ hash })
  } catch {
    receipt = null
  }
  if (receipt) {
    return receipt.status === 'success'
      ? { kind: 'mined_success', receipt }
      : { kind: 'mined_reverted', receipt }
  }
  // No receipt yet: is the transaction even in the mempool?
  try {
    const tx = await client.getTransaction({ hash })
    const latest = await client.getTransactionCount({ address: tx.from, blockTag: 'latest' })
    if (Number(tx.nonce) > latest) {
      return { kind: 'nonce_blocked', nonce: Number(tx.nonce), latest }
    }
    return { kind: 'pending' }
  } catch {
    // getTransaction throws when the node has never seen the hash.
    return { kind: 'not_found' }
  }
}

const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS = 60_000
const RECOVERY_WINDOW_MS = 25_000

/** Polls until a definitive classification or the window elapses. A hash never
 *  observed across the whole window is NOT_FOUND; one seen pending but not
 *  mined is a timeout (still genuinely pending). */
async function pollClassify(hash: `0x${string}`, windowMs: number): Promise<Classification> {
  const deadline = Date.now() + windowMs
  let everSeen = false
  for (;;) {
    let current: Classification | null = null
    try {
      current = await inspectOnce(hash)
    } catch {
      current = null // transient RPC error: treat as propagation delay, keep polling
    }
    if (
      current &&
      (current.kind === 'mined_success' ||
        current.kind === 'mined_reverted' ||
        current.kind === 'nonce_blocked')
    ) {
      return current
    }
    if (current && current.kind === 'pending') everSeen = true
    if (Date.now() > deadline) {
      if (everSeen) return { kind: 'pending' } // genuinely pending → timeout
      return current && current.kind === 'not_found' ? { kind: 'not_found' } : { kind: 'pending' }
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
}

function friendlyWriteError(message: string): string {
  if (/insufficient funds/i.test(message)) {
    return 'this wallet has no MON to pay gas. Fund it with a little Monad Testnet MON and try again. (Deposit recipients do not deposit funds, but every wallet still needs a little MON for gas.)'
  }
  if (/does not match|chain id|wrong chain/i.test(message)) {
    return 'the wallet is not on Monad Testnet (chain 10143). Switch networks and try again.'
  }
  return message.split('\n')[0]
}

function decodeRevert(error: unknown): string | null {
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError)
    if (revert instanceof ContractFunctionRevertedError) {
      return revert.data?.errorName ?? revert.reason ?? revert.shortMessage
    }
    if (/insufficient funds/i.test(error.message)) return null
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
  /** Single-flight key; while an entry with this key is non-terminal, the
   *  action is locked and further sends are refused. */
  actionKey?: string
  agreementId?: string
  /** Direct contract-state check; VERIFIED requires it to resolve true. */
  verify?: (hash: `0x${string}`) => Promise<boolean>
}

export function useContractTx() {
  const { writeContractAsync } = useWriteContract()
  const { address: account } = useAccount()
  const chainId = useChainId()
  const { track, update, isActionLocked } = useTx()

  const applyClassification = useCallback(
    async (
      id: string,
      hash: `0x${string}`,
      result: Classification,
      verify?: (hash: `0x${string}`) => Promise<boolean>,
    ): Promise<boolean> => {
      switch (result.kind) {
        case 'mined_reverted':
          update(id, { status: 'MINED_REVERTED', hash, error: 'transaction reverted onchain' })
          return false
        case 'nonce_blocked':
          update(id, {
            status: 'NONCE_BLOCKED',
            hash,
            error: `waiting behind an earlier wallet transaction (this nonce ${result.nonce}, wallet at ${result.latest}). Resolve or cancel the earlier transaction in your wallet.`,
          })
          return false
        case 'not_found':
          update(id, {
            status: 'NOT_FOUND',
            hash,
            error:
              'the wallet returned a hash but the network never received the transaction. This usually means the wallet is on a broken Monad RPC — set it to https://testnet-rpc.monad.xyz, then try again.',
          })
          return false
        case 'pending':
          update(id, {
            status: 'TIMEOUT_OR_RPC_ERROR',
            hash,
            error: 'still pending — retry status to re-check, or view on the explorer.',
          })
          return false
        case 'mined_success': {
          update(id, { status: 'MINED_SUCCESS', hash })
          if (verify) {
            update(id, { status: 'REFRESHING_CONTRACT_STATE', hash })
            try {
              if (!(await verify(hash))) {
                update(id, {
                  status: 'TIMEOUT_OR_RPC_ERROR',
                  hash,
                  error: 'mined, but the expected contract state change was not observed',
                })
                return false
              }
            } catch (error) {
              update(id, {
                status: 'TIMEOUT_OR_RPC_ERROR',
                hash,
                error: error instanceof Error ? error.message : String(error),
              })
              return false
            }
          }
          update(id, { status: 'VERIFIED', hash })
          return true
        }
      }
    },
    [update],
  )

  const send = useCallback(
    async (request: ContractTxRequest): Promise<`0x${string}` | null> => {
      // Single-flight: refuse if an unresolved action already exists.
      if (request.actionKey && isActionLocked(request.actionKey)) return null

      // Preflight simulation with the exact caller/args. A would-revert is shown
      // and NEVER opens a transaction state or prompts the wallet.
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
            agreementId: request.agreementId,
            submittedAt: Date.now(),
            error: `would revert: ${revert} — not submitted`,
          })
          return null
        }
        // Not a decodable revert (e.g. transient RPC): let the wallet try.
      }

      const id = track({
        label: request.label,
        functionName: request.functionName,
        status: 'WAITING_FOR_WALLET',
        chainId,
        contractAddress: request.address,
        agreementId: request.agreementId,
        actionKey: request.actionKey,
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
          update(id, { status: 'TIMEOUT_OR_RPC_ERROR', error: friendlyWriteError(message) })
        }
        return null
      }

      // A returned hash is only a REQUEST. Prove propagation through both the
      // official RPC and the injected wallet provider before showing pending.
      update(id, { status: 'BROADCAST_REQUESTED', hash })
      const propagation = await confirmPropagation(hash)
      if (propagation === 'BROADCAST_FAILED_NOT_PROPAGATED') {
        update(id, {
          status: 'BROADCAST_FAILED_NOT_PROPAGATED',
          hash,
          error:
            'your wallet returned a transaction hash, but the transaction was not broadcast to ' +
            'Monad Testnet (neither the official RPC nor the wallet provider can see it). Your ' +
            "wallet's saved Monad Testnet RPC is broken — recheck the network panel and switch " +
            'to Monad Testnet, or remove and re-add the network with https://testnet-rpc.monad.xyz.',
        })
        return null
      }
      if (propagation === 'WALLET_RPC_DIVERGED') {
        update(id, {
          status: 'WALLET_RPC_DIVERGED',
          hash,
          error:
            'the wallet broadcast to a different node than the official Monad RPC, which cannot ' +
            'see the transaction. Retry status to re-check, or fix the wallet network.',
        })
        return null
      }
      // APP_CONFIRMED: the official RPC sees it → normal receipt polling.
      update(id, { status: 'PENDING_ONCHAIN', hash })
      const result = await pollClassify(hash, POLL_TIMEOUT_MS)
      const ok = await applyClassification(id, hash, result, request.verify)
      return ok ? hash : null
    },
    [account, chainId, isActionLocked, track, update, writeContractAsync, applyClassification],
  )

  /** Re-check an existing hash (recovery/retry). Never calls writeContract. */
  const retryReceipt = useCallback(
    async (id: string, hash: `0x${string}`, windowMs = RECOVERY_WINDOW_MS): Promise<void> => {
      update(id, { status: 'PENDING_ONCHAIN', hash })
      const result = await pollClassify(hash, windowMs)
      await applyClassification(id, hash, result)
    },
    [update, applyClassification],
  )

  return { send, retryReceipt }
}
