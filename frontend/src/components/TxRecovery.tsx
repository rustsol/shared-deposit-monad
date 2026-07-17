// On mount (page reload) and on wallet-account change, reconcile restored
// in-flight transactions:
//   - drop entries that belong to a different connected wallet or chain
//     (never attach an old tenant/recipient tx to a new wallet session);
//   - resume receipt polling for entries that match the current wallet/chain
//     so a restored PENDING_ONCHAIN can never sit forever.
// Renders nothing.

import { useEffect, useRef } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { useAuth } from '../app/AuthContext'
import { useTx } from '../app/TxContext'
import { useContractTx } from '../hooks/useContractTx'
import { fetchUnresolvedTransactions, mergeBackendTransactions } from '../lib/txPersistence'
import { isResumable, isStaleForSession, shouldResume } from '../lib/txRecovery'

export function TxRecovery() {
  const { transactions, remove, track } = useTx()
  const { retryReceipt } = useContractTx()
  const { address } = useAccount()
  const { status: authStatus } = useAuth()
  const chainId = useChainId()
  const resumed = useRef<Set<string>>(new Set())
  const backendRestored = useRef(false)

  // The backend is the durable record: after a reload, restore this wallet's
  // unresolved stored transactions that sessionStorage no longer holds.
  useEffect(() => {
    if (authStatus !== 'authenticated' || !address || backendRestored.current) return
    backendRestored.current = true
    void (async () => {
      const stored = await fetchUnresolvedTransactions()
      for (const entry of mergeBackendTransactions(transactions, stored, address)) {
        track(entry)
      }
    })()
    // transactions intentionally read once at restore time, not re-observed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, address, track])

  useEffect(() => {
    const connected = address ?? null
    for (const tx of transactions) {
      if (!isResumable(tx.status) || !tx.hash) continue
      // Stale by wallet or chain: never resurrect under a different session.
      if (isStaleForSession(tx, connected, chainId)) {
        remove(tx.id)
        continue
      }
      if (!shouldResume(tx, connected, chainId) || resumed.current.has(tx.id)) continue
      resumed.current.add(tx.id)
      // Shorter window on recovery: resolve or surface not-found quickly.
      void retryReceipt(tx.id, tx.hash, 30_000)
    }
  }, [transactions, address, chainId, remove, retryReceipt])

  return null
}
