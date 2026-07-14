// Shared transaction lifecycle state feeding the persistent transaction
// drawer. Every entry reflects a REAL wallet transaction: hashes come from
// the wallet/RPC, never invented, and success is only set after a receipt
// (and backend verification where applicable).

import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'

export type TxStatus =
  | 'preparing'
  | 'waiting-for-wallet'
  | 'user-rejected'
  | 'broadcast'
  | 'pending'
  | 'mined'
  | 'backend-verification'
  | 'verified'
  | 'reverted'
  | 'error'

export interface TxEntry {
  id: string
  label: string
  functionName: string
  status: TxStatus
  hash?: `0x${string}`
  error?: string
}

interface TxState {
  transactions: TxEntry[]
  track: (entry: Omit<TxEntry, 'id'>) => string
  update: (id: string, patch: Partial<TxEntry>) => void
  clear: () => void
}

const TxContext = createContext<TxState | null>(null)

export function TxProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<TxEntry[]>([])

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

  const clear = useCallback(() => setTransactions([]), [])

  return (
    <TxContext.Provider value={{ transactions, track, update, clear }}>
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
    preparing: 'Preparing',
    'waiting-for-wallet': 'Waiting for wallet…',
    'user-rejected': 'Rejected in wallet',
    broadcast: 'Broadcast',
    pending: 'Pending onchain',
    mined: 'Mined',
    'backend-verification': 'Verifying with backend…',
    verified: 'Verified',
    reverted: 'Reverted',
    error: 'Failed',
  }
  return labels[status]
}
