// Pure helpers for reconciling restored transactions. Kept separate from the
// React component so the staleness rules are directly unit-testable.

import type { TxEntry } from '../app/TxContext'
import { monadTestnet } from './chain'

const RESUMABLE = ['BROADCAST', 'PENDING_ONCHAIN', 'REFRESHING_CONTRACT_STATE']

export function isResumable(status: string): boolean {
  return RESUMABLE.includes(status)
}

/** A restored transaction is stale - and must not be resumed or attached to
 *  the current session - when its chain or connected wallet differs. */
export function isStaleForSession(
  tx: Pick<TxEntry, 'status' | 'hash' | 'chainId' | 'connectedWallet'>,
  connectedWallet: string | null,
  currentChainId: number,
): boolean {
  if (!isResumable(tx.status) || !tx.hash) return false
  if (tx.chainId !== monadTestnet.id) return true
  if (currentChainId !== monadTestnet.id) return true
  if (
    tx.connectedWallet &&
    connectedWallet &&
    tx.connectedWallet.toLowerCase() !== connectedWallet.toLowerCase()
  ) {
    return true
  }
  return false
}

/** Whether a restored transaction should have its receipt polling resumed. */
export function shouldResume(
  tx: Pick<TxEntry, 'status' | 'hash' | 'chainId' | 'connectedWallet'>,
  connectedWallet: string | null,
  currentChainId: number,
): boolean {
  return (
    isResumable(tx.status) &&
    Boolean(tx.hash) &&
    !isStaleForSession(tx, connectedWallet, currentChainId)
  )
}
