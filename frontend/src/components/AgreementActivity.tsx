// Verified application-transaction timeline for one agreement. Data source:
// contract_transactions via the backend — receipt-verified records only,
// never inferred events. Direct contract reads remain authoritative for all
// current state; this list is history.

import { parseUtcSeconds, toTimeline } from '../lib/activity'
import { formatTimestamp, shortAddress, weiToMon } from '../lib/format'
import type { StoredTransaction } from '../lib/txPersistence'

export function AgreementActivity(props: {
  transactions: StoredTransaction[]
  isLoading: boolean
  isError: boolean
  authenticated: boolean
}) {
  const { transactions, isLoading, isError, authenticated } = props
  if (!authenticated) {
    return <p className="muted">Sign in as a participant to see agreement activity.</p>
  }
  if (isLoading) return <p className="muted">Loading stored transactions…</p>
  if (isError) {
    return (
      <p className="muted">
        Activity is unavailable (participants only, and the backend must be reachable).
      </p>
    )
  }
  const rows = toTimeline(transactions)
  return (
    <>
      {rows.length === 0 ? (
        <p className="muted">No application transactions are stored for this agreement yet.</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Action</th>
              <th>Wallet</th>
              <th>Amount</th>
              <th>When</th>
              <th>Block</th>
              <th>Transaction</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.txHash}>
                <td>{row.title}</td>
                <td className="mono">{shortAddress(row.wallet)}</td>
                <td className="amount">
                  {row.amountWei ? `${weiToMon(row.amountWei)} MON` : '—'}
                </td>
                <td>
                  {row.timestamp ? formatTimestamp(parseUtcSeconds(row.timestamp)) : '—'}
                </td>
                <td className="mono">{row.blockNumber ?? '—'}</td>
                <td>
                  <a href={row.explorerTxUrl} target="_blank" rel="noreferrer" className="mono">
                    {shortAddress(row.txHash)} ↗
                  </a>
                </td>
                <td>
                  {row.verified ? (
                    <span className="badge active">verified ✓</span>
                  ) : (
                    <span className="badge">{row.status.toLowerCase().replace(/_/g, ' ')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small">
        This timeline shows transactions made through this application, verified by their
        onchain receipts. Transactions made outside the application update the agreement
        state above through direct contract reads, but they do not appear here automatically.
      </p>
    </>
  )
}
