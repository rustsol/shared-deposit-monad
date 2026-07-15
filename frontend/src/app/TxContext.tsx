// Shared transaction lifecycle with the exact conceptual state model, a
// single-flight action lock, and crash-safe recovery of PUBLIC transaction
// facts across page reloads.
//
// Every entry reflects a REAL wallet transaction. A returned hash means only
// BROADCAST; VERIFIED requires a successful receipt AND a direct contract read
// reflecting the expected change. Nothing here persists private material.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type TxStatus =
  | 'PREPARING'
  | 'WAITING_FOR_WALLET'
  | 'USER_REJECTED'
  | 'BROADCAST_REQUESTED'
  | 'BROADCAST'
  | 'PENDING_ONCHAIN'
  | 'NONCE_BLOCKED'
  | 'MINED_SUCCESS'
  | 'MINED_REVERTED'
  | 'REFRESHING_CONTRACT_STATE'
  | 'VERIFIED'
  | 'REPLACED'
  | 'NOT_FOUND'
  | 'BROADCAST_FAILED_NOT_PROPAGATED'
  | 'WALLET_RPC_DIVERGED'
  | 'APPLICATION_RPC_DELAYED'
  | 'TIMEOUT_OR_RPC_ERROR'

export interface TxEntry {
  id: string
  label: string
  functionName: string
  status: TxStatus
  chainId: number
  hash?: `0x${string}`
  contractAddress?: string
  agreementId?: string
  actionKey?: string
  submittedAt?: number
  connectedWallet?: string
  error?: string
  hidden?: boolean
}

interface TxState {
  transactions: TxEntry[]
  track: (entry: Omit<TxEntry, 'id'>) => string
  update: (id: string, patch: Partial<TxEntry>) => void
  /** Terminal-only full removal. */
  remove: (id: string) => void
  /** Hide from the drawer WITHOUT releasing the action lock. */
  hide: (id: string) => void
  clear: () => void
  /** True when an unresolved (non-terminal) entry exists for this action key. */
  isActionLocked: (actionKey: string) => boolean
}

const TxContext = createContext<TxState | null>(null)

// Terminal states release the single-flight lock; everything else holds it.
export const TERMINAL_STATUSES: TxStatus[] = [
  'USER_REJECTED',
  'MINED_REVERTED',
  'VERIFIED',
  'REPLACED',
  'NOT_FOUND',
  'BROADCAST_FAILED_NOT_PROPAGATED',
]

export function isTerminal(status: TxStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

/** Deterministic single-flight key: chain:contract:agreementId:function:wallet */
export function makeActionKey(params: {
  chainId: number
  contractAddress: string
  agreementId: string
  functionName: string
  wallet: string
}): string {
  return [
    params.chainId,
    params.contractAddress.toLowerCase(),
    params.agreementId,
    params.functionName,
    params.wallet.toLowerCase(),
  ].join(':')
}

// Only public transaction facts are persisted — never keys, signatures,
// session/CSRF/invitation tokens, or draft content. sessionStorage (not
// localStorage) scopes recovery to the current browser session.
const STORAGE_KEY = 'sd.tx.v2'
// Any non-terminal entry with a hash is worth restoring (it still holds a lock).
function persistable(entry: TxEntry): boolean {
  return Boolean(entry.hash) && !isTerminal(entry.status)
}

function loadPersisted(): TxEntry[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return (JSON.parse(raw) as TxEntry[]).filter(persistable)
  } catch {
    return []
  }
}

function persist(entries: TxEntry[]): void {
  try {
    const toStore = entries.filter(persistable).map((e) => ({
      id: e.id,
      label: e.label,
      functionName: e.functionName,
      status: e.status,
      chainId: e.chainId,
      hash: e.hash,
      contractAddress: e.contractAddress,
      agreementId: e.agreementId,
      actionKey: e.actionKey,
      submittedAt: e.submittedAt,
      connectedWallet: e.connectedWallet,
    }))
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toStore))
  } catch {
    // Storage unavailable (private mode / quota) — recovery is best-effort.
  }
}

export function TxProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<TxEntry[]>(() => loadPersisted())

  useEffect(() => {
    persist(transactions)
  }, [transactions])

  const track = useCallback((entry: Omit<TxEntry, 'id'>) => {
    const id = crypto.randomUUID()
    setTransactions((current) => [{ id, ...entry }, ...current].slice(0, 12))
    return id
  }, [])

  const update = useCallback((id: string, patch: Partial<TxEntry>) => {
    setTransactions((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    )
  }, [])

  const remove = useCallback((id: string) => {
    setTransactions((current) => current.filter((entry) => entry.id !== id))
  }, [])

  const hide = useCallback((id: string) => {
    // Hiding never releases the lock: a non-terminal entry stays non-terminal.
    setTransactions((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, hidden: true } : entry)),
    )
  }, [])

  const clear = useCallback(() => {
    // Clear only removes terminal (resolved) entries; active locks are kept.
    setTransactions((current) => current.filter((entry) => !isTerminal(entry.status)))
  }, [])

  const isActionLocked = useCallback(
    (actionKey: string) =>
      transactions.some((e) => e.actionKey === actionKey && !isTerminal(e.status)),
    [transactions],
  )

  const value = useMemo(
    () => ({ transactions, track, update, remove, hide, clear, isActionLocked }),
    [transactions, track, update, remove, hide, clear, isActionLocked],
  )

  return <TxContext.Provider value={value}>{children}</TxContext.Provider>
}

export function useTx(): TxState {
  const value = useContext(TxContext)
  if (!value) throw new Error('useTx must be used inside TxProvider')
  return value
}

export function describeTxStatus(status: TxStatus): string {
  const labels: Record<TxStatus, string> = {
    PREPARING: 'Preparing',
    WAITING_FOR_WALLET: 'Waiting for wallet…',
    USER_REJECTED: 'Rejected in wallet',
    BROADCAST_REQUESTED: 'Broadcast requested — confirming propagation…',
    BROADCAST: 'Broadcast',
    PENDING_ONCHAIN: 'Pending onchain',
    NONCE_BLOCKED: 'Waiting behind an earlier wallet transaction',
    MINED_SUCCESS: 'Mined',
    MINED_REVERTED: 'Reverted onchain',
    REFRESHING_CONTRACT_STATE: 'Refreshing contract state…',
    VERIFIED: 'Verified',
    REPLACED: 'Replaced by a newer transaction',
    NOT_FOUND: 'Not found on Monad Testnet',
    BROADCAST_FAILED_NOT_PROPAGATED: 'Not broadcast to Monad Testnet',
    WALLET_RPC_DIVERGED: 'Wallet RPC diverged from the network',
    APPLICATION_RPC_DELAYED: 'Confirming on the official RPC…',
    TIMEOUT_OR_RPC_ERROR: 'Timed out — retry status',
  }
  return labels[status]
}
