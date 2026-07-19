// Plain-language presentation of STORED, receipt-verified application
// transactions (pure; unit-tested). Every timeline row corresponds to one
// contract_transactions record - nothing is inferred, and rows without a
// successful receipt are labelled with their honest status instead of being
// dressed up as activity.

import type { StoredTransaction } from './txPersistence'

export interface ActivityRow {
  title: string
  wallet: string
  amountWei: string | null
  txHash: string
  blockNumber: number | null
  timestamp: string | null
  receiptStatus: number | null
  status: string
  verified: boolean
  explorerTxUrl: string
}

const FUNCTION_TITLES: Record<string, string> = {
  createAgreement: 'Agreement created',
  acceptAsTenant: 'Tenant accepted the terms',
  acceptAsRecipient: 'Recipient accepted the terms',
  deposit: 'Contribution deposited',
  withdrawFundingBeforeActivation: 'Pre-activation contribution withdrawn',
  cancelExpiredFunding: 'Expired funding cancelled',
  withdrawCancelledFunding: 'Cancelled-funding refund withdrawn',
  submitClaim: 'Claim submitted',
  voteClaim: 'Vote cast on a claim',
  withdrawPendingClaim: 'Claim withdrawn',
  finalizePendingClaim: 'Pending claim finalized',
  finalizeAgreement: 'Agreement finalized',
  withdrawTenantRefund: 'Tenant refund withdrawn',
  withdrawRecipientPayout: 'Recipient payout withdrawn',
}

function eventNames(tx: StoredTransaction): string[] {
  return (tx.decoded_events ?? []).map((event) => event.event_name)
}

/** Plain-language title, refined by the receipt's own decoded events. */
export function activityTitle(tx: StoredTransaction): string {
  const base = FUNCTION_TITLES[tx.function_name] ?? tx.function_name
  const events = eventNames(tx)
  if (tx.function_name === 'acceptAsRecipient' && events.includes('AgreementActivated')) {
    return 'Recipient accepted - deposit fully funded, agreement activated'
  }
  if (tx.function_name === 'deposit' && events.includes('AgreementActivated')) {
    return 'Contribution deposited - deposit fully funded, agreement activated'
  }
  return base
}

/** The MON-relevant amount of a stored transaction, if any. */
export function activityAmountWei(tx: StoredTransaction): string | null {
  if (tx.value_wei !== '0') return tx.value_wei
  for (const event of tx.decoded_events ?? []) {
    const amount = event.payload['amount'] ?? event.payload['totalRequired']
    if (typeof amount === 'string' && amount !== '0') return amount
  }
  return null
}

export function toActivityRow(tx: StoredTransaction): ActivityRow {
  return {
    title: activityTitle(tx),
    wallet: tx.wallet_address,
    amountWei: activityAmountWei(tx),
    txHash: tx.tx_hash,
    blockNumber: tx.block_number,
    timestamp: tx.mined_at ?? tx.submitted_at,
    receiptStatus: tx.receipt_status,
    status: tx.status,
    verified: tx.status === 'VERIFIED',
    explorerTxUrl: tx.explorer_tx_url,
  }
}

/** Backend timestamps are naive UTC; parse them as UTC, not local time. */
export function parseUtcSeconds(timestamp: string): number {
  const normalized = /Z|[+-]\d{2}:\d{2}$/.test(timestamp) ? timestamp : `${timestamp}Z`
  return Math.floor(Date.parse(normalized) / 1000)
}

/** Timeline order: mined transactions by block, then still-unmined ones by
 *  submission time - never interleaved ahead of confirmed history. */
export function toTimeline(transactions: StoredTransaction[]): ActivityRow[] {
  const rows = transactions.map(toActivityRow)
  return rows.sort((a, b) => {
    if (a.blockNumber !== null && b.blockNumber !== null) return a.blockNumber - b.blockNumber
    if (a.blockNumber !== null) return -1
    if (b.blockNumber !== null) return 1
    return (a.timestamp ?? '').localeCompare(b.timestamp ?? '')
  })
}
