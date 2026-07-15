// Restored-transaction reconciliation: stale entries (wrong wallet/chain) are
// never resumed or attached to a new session; matching in-flight entries are
// resumed so a restored PENDING_ONCHAIN can never sit forever.

import { describe, expect, test } from 'vitest'
import { isResumable, isStaleForSession, shouldResume } from '../src/lib/txRecovery'
import type { TxEntry } from '../src/app/TxContext'

const HASH = ('0x' + 'b2'.repeat(32)) as `0x${string}`
const WALLET_A = '0x' + 'aa'.repeat(20)
const WALLET_B = '0x' + 'bb'.repeat(20)

function entry(overrides: Partial<TxEntry> = {}): TxEntry {
  return {
    id: 'x',
    label: 'Accept as deposit recipient',
    functionName: 'acceptAsRecipient',
    status: 'PENDING_ONCHAIN',
    chainId: 10143,
    hash: HASH,
    connectedWallet: WALLET_A,
    ...overrides,
  }
}

describe('restored transaction reconciliation', () => {
  test('resumable statuses are exactly the in-flight ones', () => {
    expect(isResumable('BROADCAST')).toBe(true)
    expect(isResumable('PENDING_ONCHAIN')).toBe(true)
    expect(isResumable('REFRESHING_CONTRACT_STATE')).toBe(true)
    expect(isResumable('VERIFIED')).toBe(false)
    expect(isResumable('MINED_REVERTED')).toBe(false)
    expect(isResumable('USER_REJECTED')).toBe(false)
  })

  test('a matching pending transaction is resumed (never left forever)', () => {
    expect(shouldResume(entry(), WALLET_A, 10143)).toBe(true)
    expect(isStaleForSession(entry(), WALLET_A, 10143)).toBe(false)
  })

  test('a transaction from another wallet is stale and not resumed', () => {
    // e.g. a recipient tx restored while a tenant wallet is now connected.
    expect(isStaleForSession(entry({ connectedWallet: WALLET_A }), WALLET_B, 10143)).toBe(true)
    expect(shouldResume(entry({ connectedWallet: WALLET_A }), WALLET_B, 10143)).toBe(false)
  })

  test('a transaction from another chain is stale', () => {
    expect(isStaleForSession(entry({ chainId: 1 }), WALLET_A, 10143)).toBe(true)
  })

  test('when the wallet is on the wrong chain nothing is resumed', () => {
    expect(isStaleForSession(entry(), WALLET_A, 1)).toBe(true)
    expect(shouldResume(entry(), WALLET_A, 1)).toBe(false)
  })

  test('terminal entries are neither resumable nor stale-tracked', () => {
    expect(shouldResume(entry({ status: 'VERIFIED' }), WALLET_A, 10143)).toBe(false)
    expect(isStaleForSession(entry({ status: 'VERIFIED' }), WALLET_B, 10143)).toBe(false)
  })

  test('address comparison is case-insensitive', () => {
    expect(
      isStaleForSession(entry({ connectedWallet: WALLET_A.toUpperCase() }), WALLET_A, 10143),
    ).toBe(false)
  })
})
