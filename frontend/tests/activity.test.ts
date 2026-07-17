// Activity timeline presentation: verified-only labelling, plain-language
// titles refined by receipt events, amounts, ordering, and UTC parsing.

import { describe, expect, test } from 'vitest'
import { activityAmountWei, activityTitle, parseUtcSeconds, toTimeline } from '../src/lib/activity'
import type { StoredTransaction } from '../src/lib/txPersistence'

function tx(overrides: Partial<StoredTransaction>): StoredTransaction {
  return {
    chain_id: 10143,
    contract_address: '0x5720c3f77c66527b59f9f63cd3631a3019400910',
    tx_hash: '0x' + 'aa'.repeat(32),
    wallet_address: '0x7ab3adf1c8fc4746333e104b6a793f6782d7ba23',
    function_name: 'deposit',
    agreement_id: '2',
    claim_id: null,
    value_wei: '0',
    status: 'VERIFIED',
    submitted_at: '2026-07-15T08:19:58',
    first_observed_at: null,
    mined_at: '2026-07-15T08:19:58',
    block_number: 45074554,
    block_hash: null,
    receipt_status: 1,
    decoded_error: null,
    decoded_events: null,
    explorer_tx_url: 'https://testnet.monadscan.com/tx/0x' + 'aa'.repeat(32),
    ...overrides,
  }
}

describe('activityTitle', () => {
  test('uses plain language for every known function', () => {
    expect(activityTitle(tx({ function_name: 'createAgreement' }))).toBe('Agreement created')
    expect(activityTitle(tx({ function_name: 'acceptAsTenant' }))).toBe(
      'Tenant accepted the terms',
    )
    expect(activityTitle(tx({ function_name: 'deposit' }))).toBe('Contribution deposited')
  })

  test('recipient acceptance that activated the agreement says so', () => {
    const row = tx({
      function_name: 'acceptAsRecipient',
      decoded_events: [
        { event_name: 'RecipientAccepted', log_index: 9, payload: {} },
        { event_name: 'AgreementActivated', log_index: 10, payload: { totalFunded: '1500000000000000000' } },
      ],
    })
    expect(activityTitle(row)).toContain('agreement activated')
  })

  test('unknown functions fall back to the raw name, never invented text', () => {
    expect(activityTitle(tx({ function_name: 'somethingNew' }))).toBe('somethingNew')
  })
})

describe('activityAmountWei', () => {
  test('prefers the transaction value', () => {
    expect(activityAmountWei(tx({ value_wei: '500000000000000000' }))).toBe(
      '500000000000000000',
    )
  })
  test('falls back to a decoded event amount', () => {
    const row = tx({
      decoded_events: [
        { event_name: 'DepositAdded', log_index: 1, payload: { amount: '250000000000000000' } },
      ],
    })
    expect(activityAmountWei(row)).toBe('250000000000000000')
  })
  test('no amount yields null, never a fabricated zero', () => {
    expect(activityAmountWei(tx({}))).toBeNull()
  })
})

describe('toTimeline', () => {
  test('orders mined transactions by block and keeps unmined last', () => {
    const rows = toTimeline([
      tx({ tx_hash: '0x' + 'cc'.repeat(32), block_number: 45090417 }),
      tx({ tx_hash: '0x' + 'dd'.repeat(32), block_number: null, mined_at: null, status: 'SUBMITTED', receipt_status: null }),
      tx({ tx_hash: '0x' + 'bb'.repeat(32), block_number: 45074511 }),
    ])
    expect(rows.map((r) => r.blockNumber)).toEqual([45074511, 45090417, null])
    expect(rows[2].verified).toBe(false)
    expect(rows[2].status).toBe('SUBMITTED')
  })
})

describe('parseUtcSeconds', () => {
  test('treats naive backend timestamps as UTC', () => {
    expect(parseUtcSeconds('2026-07-15T08:19:58')).toBe(
      Math.floor(Date.parse('2026-07-15T08:19:58Z') / 1000),
    )
    expect(parseUtcSeconds('2026-07-15T08:19:58Z')).toBe(
      Math.floor(Date.parse('2026-07-15T08:19:58Z') / 1000),
    )
  })
})
