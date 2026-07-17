// The single shared transaction drawer. Every stage is shown in plain
// language via describeTxStatus — a wallet confirmation is never presented
// as a blockchain confirmation (BROADCAST_REQUESTED vs PENDING_ONCHAIN vs
// MINED vs VERIFIED are distinct, honest stages). Retry only re-queries the
// existing hash; Dismiss never releases a single-flight action lock.

import { EXPLORER_TX } from '../lib/chain'
import { shortAddress } from '../lib/format'
import { useContractTx } from '../hooks/useContractTx'
import { describeTxStatus, isTerminal, useTx } from '../app/TxContext'

const RESOLVING_STATUSES = [
  'BROADCAST_REQUESTED',
  'BROADCAST',
  'PENDING_ONCHAIN',
  'APPLICATION_RPC_DELAYED',
  'WALLET_RPC_DIVERGED',
  'REFRESHING_CONTRACT_STATE',
]

const STATUS_CLASS: Record<string, string> = {
  VERIFIED: 'verified',
  MINED_REVERTED: 'reverted',
  MINED_SUCCESS: 'pending',
  BROADCAST_REQUESTED: 'broadcast',
  BROADCAST: 'broadcast',
  PENDING_ONCHAIN: 'pending',
  NONCE_BLOCKED: 'reverted',
  APPLICATION_RPC_DELAYED: 'pending',
  REFRESHING_CONTRACT_STATE: 'pending',
  WAITING_FOR_WALLET: 'waiting-for-wallet',
  TIMEOUT_OR_RPC_ERROR: 'reverted',
  USER_REJECTED: 'reverted',
  REPLACED: 'reverted',
  NOT_FOUND: 'reverted',
  BROADCAST_FAILED_NOT_PROPAGATED: 'reverted',
  WALLET_RPC_DIVERGED: 'reverted',
  PREPARING: 'pending',
}

export function TransactionDrawer() {
  const { transactions, remove, hide, clear } = useTx()
  const { retryReceipt } = useContractTx()
  const visible = transactions.filter((entry) => !entry.hidden)
  if (visible.length === 0) return null
  return (
    <aside className="tx-drawer" aria-live="polite" aria-label="Transaction status">
      {visible.slice(0, 4).map((entry) => {
        const terminal = isTerminal(entry.status)
        return (
          <div key={entry.id} className={`tx-entry ${STATUS_CLASS[entry.status] ?? ''}`}>
            <strong>{entry.label}</strong>
            <div className="small muted">{describeTxStatus(entry.status)}</div>
            {entry.hash && (
              <a
                className="small mono"
                href={`${EXPLORER_TX}${entry.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                {shortAddress(entry.hash)} ↗
              </a>
            )}
            {entry.error && <div className="small field-error">{entry.error}</div>}
            <div className="tx-actions">
              {/* Retry only re-queries the existing hash — never writeContract. */}
              {entry.hash &&
                (entry.status === 'TIMEOUT_OR_RPC_ERROR' ||
                  RESOLVING_STATUSES.includes(entry.status)) && (
                  <button
                    className="secondary compact"
                    onClick={() => void retryReceipt(entry.id, entry.hash as `0x${string}`)}
                  >
                    Check again
                  </button>
                )}
              {/* Terminal entries are removed; non-terminal ones are only
                  HIDDEN so the single-flight lock is never released here. */}
              <button
                className="secondary compact"
                onClick={() => (terminal ? remove(entry.id) : hide(entry.id))}
              >
                Dismiss
              </button>
            </div>
          </div>
        )
      })}
      <button className="secondary compact" onClick={clear}>
        Clear finished
      </button>
    </aside>
  )
}
