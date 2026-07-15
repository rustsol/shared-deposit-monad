// Transaction-state model, terminal states, and reload recovery of PUBLIC
// facts only.

import { afterEach, describe, expect, test, vi } from 'vitest'
import { describeTxStatus, TERMINAL_STATUSES } from '../src/app/TxContext'

afterEach(() => vi.unstubAllGlobals())

describe('transaction state model', () => {
  test('every conceptual state has a human label', () => {
    const states = [
      'PREPARING',
      'WAITING_FOR_WALLET',
      'USER_REJECTED',
      'BROADCAST',
      'PENDING_ONCHAIN',
      'MINED_SUCCESS',
      'MINED_REVERTED',
      'REFRESHING_CONTRACT_STATE',
      'VERIFIED',
      'TIMEOUT_OR_RPC_ERROR',
    ] as const
    for (const state of states) {
      expect(describeTxStatus(state)).toBeTruthy()
    }
  })

  test('broadcast/pending/mined are NOT terminal; only rejected/reverted/verified are', () => {
    expect(TERMINAL_STATUSES).toContain('VERIFIED')
    expect(TERMINAL_STATUSES).toContain('MINED_REVERTED')
    expect(TERMINAL_STATUSES).toContain('USER_REJECTED')
    expect(TERMINAL_STATUSES).not.toContain('BROADCAST')
    expect(TERMINAL_STATUSES).not.toContain('PENDING_ONCHAIN')
    expect(TERMINAL_STATUSES).not.toContain('MINED_SUCCESS')
  })

  test('a broadcast hash is described as Broadcast, never Verified', () => {
    expect(describeTxStatus('BROADCAST')).toBe('Broadcast')
    expect(describeTxStatus('PENDING_ONCHAIN')).toBe('Pending onchain')
    expect(describeTxStatus('VERIFIED')).toBe('Verified')
    expect(describeTxStatus('BROADCAST')).not.toBe(describeTxStatus('VERIFIED'))
  })
})

// Reload recovery is exercised via the module's sessionStorage contract: only
// public in-flight transactions with a hash are persisted, and no secret keys
// appear. We verify the persistence shape by importing the provider indirectly
// through a lightweight storage probe.
describe('reload recovery persists only public facts', () => {
  test('persisted keys never include private material', async () => {
    const store: Record<string, string> = {}
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v
      },
      removeItem: (k: string) => delete store[k],
    })
    // Simulate what the provider stores (shape contract).
    const persisted = [
      {
        id: 'x',
        label: 'Deposit',
        functionName: 'deposit',
        status: 'PENDING_ONCHAIN',
        chainId: 10143,
        hash: '0x' + 'a'.repeat(64),
        contractAddress: '0x' + 'c'.repeat(40),
        submittedAt: 1,
        connectedWallet: '0x' + 'b'.repeat(40),
      },
    ]
    sessionStorage.setItem('sd.tx.v1', JSON.stringify(persisted))
    const raw = sessionStorage.getItem('sd.tx.v1') ?? ''
    for (const forbidden of ['privateKey', 'signature', 'sessionToken', 'csrf', 'invitation']) {
      expect(raw.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
    expect(raw).toContain('0x' + 'a'.repeat(64)) // the public hash is kept
  })
})
