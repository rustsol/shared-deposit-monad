// Transaction persistence: recording payload shape, best-effort failure
// handling, reload-recovery merge rules, and the stale-cache decision.
// fetch is mocked (test-only); the runtime app uses real fetch.

import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  mergeBackendTransactions,
  recordTransaction,
  reverifyTransaction,
  shouldRefreshCache,
  type StoredTransaction,
} from '../src/lib/txPersistence'

const WALLET = '0x7ab3adf1c8fc4746333e104b6a793f6782d7ba23'
const OTHER = '0x2e35125f5d6552281e663254083bd2b6713977df'
const HASH = ('0x' + 'ab'.repeat(32)) as `0x${string}`

function storedRow(overrides: Partial<StoredTransaction> = {}): StoredTransaction {
  return {
    chain_id: 10143,
    contract_address: '0x5720c3f77c66527b59f9f63cd3631a3019400910',
    tx_hash: HASH,
    wallet_address: WALLET,
    function_name: 'deposit',
    agreement_id: '2',
    claim_id: null,
    value_wei: '500000000000000000',
    status: 'SUBMITTED',
    submitted_at: '2026-07-17T10:00:00Z',
    first_observed_at: null,
    mined_at: null,
    block_number: null,
    block_hash: null,
    receipt_status: null,
    decoded_error: null,
    decoded_events: null,
    explorer_tx_url: `https://testnet.monadscan.com/tx/${HASH}`,
    ...overrides,
  }
}

function mockFetch(status: number, body: unknown) {
  const mock = vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('recordTransaction', () => {
  test('POSTs the wallet-returned hash with full metadata', async () => {
    const mock = mockFetch(201, storedRow())
    const result = await recordTransaction({
      chainId: 10143,
      contractAddress: '0x5720c3f77c66527b59f9f63cd3631a3019400910',
      txHash: HASH,
      functionName: 'deposit',
      agreementId: '2',
      valueWei: '500000000000000000',
    })
    expect(result?.status).toBe('SUBMITTED')
    const [url, init] = mock.mock.calls[0]
    expect(String(url)).toContain('/transactions')
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({
      chain_id: 10143,
      tx_hash: HASH,
      function_name: 'deposit',
      agreement_id: '2',
      value_wei: '500000000000000000',
    })
  })

  test('persistence failure never throws into the transaction flow', async () => {
    mockFetch(500, { detail: 'db down' })
    await expect(
      recordTransaction({
        chainId: 10143,
        contractAddress: '0x5720c3f77c66527b59f9f63cd3631a3019400910',
        txHash: HASH,
        functionName: 'deposit',
        valueWei: '0',
      }),
    ).resolves.toBeNull()
  })

  test('reverify failure is swallowed the same way', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(reverifyTransaction(10143, HASH)).resolves.toBeNull()
  })
})

describe('mergeBackendTransactions', () => {
  test('restores unresolved backend rows as resumable entries', () => {
    const additions = mergeBackendTransactions([], [storedRow()], WALLET)
    expect(additions).toHaveLength(1)
    expect(additions[0]).toMatchObject({
      hash: HASH,
      status: 'PENDING_ONCHAIN',
      functionName: 'deposit',
      agreementId: '2',
      connectedWallet: WALLET,
    })
  })

  test('never duplicates a hash already tracked locally', () => {
    const additions = mergeBackendTransactions([{ hash: HASH }], [storedRow()], WALLET)
    expect(additions).toHaveLength(0)
  })

  test("never attaches another wallet's transactions", () => {
    const additions = mergeBackendTransactions(
      [],
      [storedRow({ wallet_address: OTHER })],
      WALLET,
    )
    expect(additions).toHaveLength(0)
  })

  test('terminal backend rows are not restored', () => {
    for (const status of ['VERIFIED', 'MINED_REVERTED', 'STATE_MISMATCH', 'NOT_FOUND']) {
      expect(mergeBackendTransactions([], [storedRow({ status })], WALLET)).toHaveLength(0)
    }
  })

  test('without a connected wallet nothing is restored', () => {
    expect(mergeBackendTransactions([], [storedRow()], null)).toHaveLength(0)
  })
})

describe('shouldRefreshCache', () => {
  test('refreshes only on a real, known disagreement', () => {
    expect(shouldRefreshCache('ACTIVE', 'FUNDING')).toBe(true)
    expect(shouldRefreshCache('ACTIVE', 'ACTIVE')).toBe(false)
    expect(shouldRefreshCache(null, 'FUNDING')).toBe(false)
    expect(shouldRefreshCache('ACTIVE', null)).toBe(false)
    expect(shouldRefreshCache('NONE', 'FUNDING')).toBe(false)
  })
})
