// Dual-provider Monad Testnet health + broadcast-propagation logic. These are
// pure evaluators — no wallet, no RPC — so every branch is exercised directly.

import { describe, expect, test } from 'vitest'
import {
  BLOCK_TOLERANCE,
  MONAD_CHAIN_HEX,
  MONAD_CHAIN_ID,
  MONAD_RPC,
  classifyPropagation,
  evaluateHealth,
  monadAddChainParams,
  monadSwitchChainParams,
  type ProviderReadings,
} from '../src/lib/diagnostics'

const WALLET = '0x2e35125f000000000000000000000000000077df'
const CONTRACT_CODE = '0x60016002'
const CODE_HASH = 'code-hash-a'

// A fully-healthy reading for one provider; override per test.
function healthyReading(overrides: Partial<ProviderReadings> = {}): ProviderReadings {
  return {
    chainId: MONAD_CHAIN_ID,
    latestBlock: 1000,
    balanceWei: '5000000000000000000', // 5 MON
    latestNonce: 0,
    pendingNonce: 0,
    contractCode: CONTRACT_CODE,
    contractCodeHash: CODE_HASH,
    safeReadOk: true,
    ...overrides,
  }
}

const baseOpts = { connectedWallet: WALLET, authWallet: WALLET }

describe('evaluateHealth — both providers must be genuinely on Monad Testnet', () => {
  test('healthy when both providers agree on chain, block, code, and reads', () => {
    const d = evaluateHealth(healthyReading(), healthyReading(), baseOpts)
    expect(d.overallHealth).toBe('healthy')
    expect(d.failures).toHaveLength(0)
  })

  test('unhealthy when the WALLET provider reports the wrong chain even if the app RPC is correct', () => {
    const d = evaluateHealth(
      healthyReading({ chainId: 31337 }),
      healthyReading(),
      baseOpts,
    )
    expect(d.overallHealth).toBe('unhealthy')
    expect(d.failures.some((f) => /Wallet provider chain ID is 31337/.test(f))).toBe(true)
  })

  test('unhealthy when the wallet provider block is stale beyond tolerance', () => {
    const d = evaluateHealth(
      healthyReading({ latestBlock: 1000 - (BLOCK_TOLERANCE + 5) }),
      healthyReading({ latestBlock: 1000 }),
      baseOpts,
    )
    expect(d.overallHealth).toBe('unhealthy')
    expect(d.failures.some((f) => /stale/.test(f))).toBe(true)
  })

  test('a stale-but-within-tolerance block stays healthy', () => {
    const d = evaluateHealth(
      healthyReading({ latestBlock: 1000 - (BLOCK_TOLERANCE - 1) }),
      healthyReading({ latestBlock: 1000 }),
      baseOpts,
    )
    expect(d.overallHealth).toBe('healthy')
  })

  test('unhealthy when contract code is invisible through the wallet provider', () => {
    const d = evaluateHealth(
      healthyReading({ contractCode: '0x', contractCodeHash: null }),
      healthyReading(),
      baseOpts,
    )
    expect(d.overallHealth).toBe('unhealthy')
    expect(d.failures.some((f) => /Contract code not visible through the wallet/.test(f))).toBe(true)
  })

  test('unhealthy when the two providers see different contract code', () => {
    const d = evaluateHealth(
      healthyReading({ contractCodeHash: 'code-hash-b' }),
      healthyReading({ contractCodeHash: 'code-hash-a' }),
      baseOpts,
    )
    expect(d.overallHealth).toBe('unhealthy')
    expect(d.failures.some((f) => /differs between/.test(f))).toBe(true)
  })

  test('unhealthy when the safe contract read fails through the wallet provider', () => {
    const d = evaluateHealth(
      healthyReading({ safeReadOk: false }),
      healthyReading(),
      baseOpts,
    )
    expect(d.overallHealth).toBe('unhealthy')
    expect(d.failures.some((f) => /Safe contract read failed through the wallet/.test(f))).toBe(true)
  })

  test('unhealthy when the connected wallet does not match the signed-in session', () => {
    const d = evaluateHealth(healthyReading(), healthyReading(), {
      connectedWallet: WALLET,
      authWallet: '0x' + 'a'.repeat(40),
    })
    expect(d.overallHealth).toBe('unhealthy')
    expect(d.walletMatchesSession).toBe(false)
  })

  test('optional recipient gate: unhealthy when connected wallet is not the required recipient', () => {
    const d = evaluateHealth(healthyReading(), healthyReading(), {
      ...baseOpts,
      requiredRecipient: '0x' + 'f'.repeat(40),
    })
    expect(d.connectedIsRecipient).toBe(false)
    expect(d.overallHealth).toBe('unhealthy')
  })

  test('optional recipient gate: healthy when connected wallet IS the required recipient', () => {
    const d = evaluateHealth(healthyReading(), healthyReading(), {
      ...baseOpts,
      requiredRecipient: WALLET,
    })
    expect(d.connectedIsRecipient).toBe(true)
    expect(d.overallHealth).toBe('healthy')
  })

  test('MON balance alone does NOT enable a write when the wallet provider is unhealthy', () => {
    // The wallet reports a real 5 MON balance and chain 10143, but its RPC is
    // stale/broken so it cannot see the contract code. This is exactly the bug:
    // funds present, but the wallet is not truly talking to Monad Testnet.
    const d = evaluateHealth(
      healthyReading({ contractCode: '0x', contractCodeHash: null, safeReadOk: false }),
      healthyReading(),
      { ...baseOpts, minBalanceWei: 1n },
    )
    expect(d.wallet.balanceWei).toBe('5000000000000000000')
    expect(d.overallHealth).toBe('unhealthy')
  })

  test('minimum-balance gate flags an underfunded wallet on both providers', () => {
    const d = evaluateHealth(
      healthyReading({ balanceWei: '10' }),
      healthyReading({ balanceWei: '10' }),
      { ...baseOpts, minBalanceWei: 1000n },
    )
    expect(d.overallHealth).toBe('unhealthy')
    expect(d.failures.some((f) => /Wallet-provider balance is insufficient/.test(f))).toBe(true)
    expect(d.failures.some((f) => /Application-RPC balance is insufficient/.test(f))).toBe(true)
  })
})

describe('classifyPropagation — a returned hash is only a REQUEST', () => {
  const windowMs = 15_000
  const extendedMs = 30_000

  test('official RPC seeing the tx is authoritative → APP_CONFIRMED', () => {
    expect(
      classifyPropagation({ walletSeen: false, appSeen: true, elapsedMs: 1, windowMs, extendedMs }),
    ).toBe('APP_CONFIRMED')
  })

  test('neither provider sees it inside the window → keep polling', () => {
    expect(
      classifyPropagation({ walletSeen: false, appSeen: false, elapsedMs: 5_000, windowMs, extendedMs }),
    ).toBe('KEEP_POLLING')
  })

  test('neither provider sees it after the window → BROADCAST_FAILED_NOT_PROPAGATED', () => {
    expect(
      classifyPropagation({ walletSeen: false, appSeen: false, elapsedMs: 15_000, windowMs, extendedMs }),
    ).toBe('BROADCAST_FAILED_NOT_PROPAGATED')
  })

  test('only the wallet sees it, still within the extended window → APPLICATION_RPC_DELAYED', () => {
    expect(
      classifyPropagation({ walletSeen: true, appSeen: false, elapsedMs: 10_000, windowMs, extendedMs }),
    ).toBe('APPLICATION_RPC_DELAYED')
  })

  test('only the wallet sees it past the extended window → WALLET_RPC_DIVERGED', () => {
    expect(
      classifyPropagation({ walletSeen: true, appSeen: false, elapsedMs: 30_000, windowMs, extendedMs }),
    ).toBe('WALLET_RPC_DIVERGED')
  })
})

describe('wallet network repair parameters use the real Monad Testnet values', () => {
  test('switch-chain targets 0x279f (10143)', () => {
    expect(monadSwitchChainParams()).toEqual([{ chainId: MONAD_CHAIN_HEX }])
    expect(Number.parseInt(MONAD_CHAIN_HEX, 16)).toBe(MONAD_CHAIN_ID)
  })

  test('add-chain carries the official RPC, symbol, and decimals', () => {
    const [params] = monadAddChainParams()
    expect(params.chainId).toBe(MONAD_CHAIN_HEX)
    expect(params.rpcUrls).toEqual([MONAD_RPC])
    expect(params.nativeCurrency).toEqual({ name: 'MON', symbol: 'MON', decimals: 18 })
  })
})
