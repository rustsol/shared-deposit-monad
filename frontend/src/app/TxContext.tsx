// Shared transaction lifecycle with the exact conceptual state model, plus
// crash-safe recovery of PUBLIC transaction facts across page reloads.
//
// Every entry reflects a REAL wallet transaction. A returned hash means only
// BROADCAST; VERIFIED requires a successful receipt AND a direct contract read
// reflecting the expected change. Nothing here persists private material.

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export type TxStatus =
  | 'PREPARING'
  | 'WAITING_FOR_WALLET'
  | 'USER_REJECTED'
  | 'BROADCAST'
  | 'PENDING_ONCHAIN'
  | 'MINED_SUCCESS'
  | 'MINED_REVERTED'
  | 'REFRESHING_CONTRACT_STATE'
  | 'VERIFIED'
  | 'TIMEOUT_OR_RPC_ERROR'

export interface TxEntry {
  id: string
  label: string
  functionName: string
  status: TxStatus
  chainId: number
  hash?: `0x${string}`
  contractAddress?: string
  submittedAt?: number
  connectedWallet?: string
  error?: string
}

interface TxState {
  transactions: TxEntry[]
  track: (entry: Omit<TxEntry, 'id'>) => string
  update: (id: string, patch: Partial<TxEntry>) => void
  remove: (id: string) => void
  clear: () => void
}

const TxContext = createContext<TxState | null>(null)

// Only public transaction facts are persisted — never keys, signatures,
// session/CSRF/invitation tokens, or draft content. sessionStorage (not
// localStorage) scopes recovery to the current browser session.
const STORAGE_KEY = 'sd.tx.v1'
const RECOVERABLE: TxStatus[] = ['BROADCAST', 'PENDING_ONCHAIN', 'REFRESHING_CONTRACT_STATE']

function loadPersisted(): TxEntry[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as TxEntry[]
    // Only in-flight transactions with a hash are worth restoring.
    return parsed.filter((e) => e.hash && RECOVERABLE.includes(e.status))
  } catch {
    return []
  }
}

function persist(entries: TxEntry[]): void {
  try {
    const toStore = entries
      .filter((e) => e.hash && RECOVERABLE.includes(e.status))
      .map((e) => ({
        id: e.id,
        label: e.label,
        functionName: e.functionName,
        status: e.status,
        chainId: e.chainId,
        hash: e.hash,
        contractAddress: e.contractAddress,
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
    setTransactions((current) => [{ id, ...entry }, ...current].slice(0, 10))
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

  const clear = useCallback(() => setTransactions([]), [])

  return (
    <TxContext.Provider value={{ transactions, track, update, remove, clear }}>
      {children}
    </TxContext.Provider>
  )
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
    BROADCAST: 'Broadcast',
    PENDING_ONCHAIN: 'Pending onchain',
    MINED_SUCCESS: 'Mined',
    MINED_REVERTED: 'Reverted onchain',
    REFRESHING_CONTRACT_STATE: 'Refreshing contract state…',
    VERIFIED: 'Verified',
    TIMEOUT_OR_RPC_ERROR: 'Timed out — retry status',
  }
  return labels[status]
}

export const TERMINAL_STATUSES: TxStatus[] = [
  'USER_REJECTED',
  'MINED_REVERTED',
  'VERIFIED',
]
