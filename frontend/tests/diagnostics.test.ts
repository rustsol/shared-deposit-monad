// Dual-provider Monad Testnet health + broadcast-propagation logic. These are
// pure evaluators - no wallet, no RPC - so every branch is exercised directly.
//
// Network readiness and identity are INDEPENDENT. Optional injected-provider
// reads (nonce, wallet balance, wallet-side block/code) must never block a
// write, and a session mismatch is an account concern, not a network fault.

import { describe, expect, test } from 'vitest'
import {
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
const OTHER = '0x' + 'a'.repeat(40)
const CONTRACT_CODE = '0x60016002'
const CODE_HASH = 'code-hash-a'

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

describe('evaluateHealth - network readiness requires only genuinely necessary facts', () => {
  test('ready when both chains are 10143, the app RPC has a block, and the contract is visible', () => {
    const d = evaluateHealth(healthyReading(), healthyReading(), baseOpts)
    expect(d.networkReady).toBe(true)
    expect(d.overallHealth).toBe('healthy')
    expect(d.networkBlockingReasons).toHaveLength(0)
  })

  test('wrong WALLET chain blocks the network even if the app RPC is correct', () => {
    const d = evaluateHealth(healthyReading({ chainId: 31337 }), healthyReading(), baseOpts)
    expect(d.networkReady).toBe(false)
    expect(d.networkBlockingReasons.some((r) => /Wallet chain ID is 31337/.test(r))).toBe(true)
  })

  test('wrong APPLICATION chain blocks the network', () => {
    const d = evaluateHealth(healthyReading(), healthyReading({ chainId: 143 }), baseOpts)
    expect(d.networkReady).toBe(false)
    expect(d.networkBlockingReasons.some((r) => /Application RPC chain ID is 143/.test(r))).toBe(true)
  })

  test('missing contract code through the application RPC blocks the network', () => {
    const d = evaluateHealth(
      healthyReading(),
      healthyReading({ contractCode: '0x', contractCodeHash: null }),
      baseOpts,
    )
    expect(d.networkReady).toBe(false)
    expect(d.networkBlockingReasons.some((r) => /not visible through the application RPC/.test(r))).toBe(true)
  })

  test('application RPC returning no block blocks the network', () => {
    const d = evaluateHealth(healthyReading(), healthyReading({ latestBlock: null }), baseOpts)
    expect(d.networkReady).toBe(false)
    expect(d.networkBlockingReasons.some((r) => /did not return a latest block/.test(r))).toBe(true)
  })
})

describe('evaluateHealth - optional injected-provider reads NEVER block', () => {
  test('wallet-provider nonce unavailable does not block a valid write', () => {
    const d = evaluateHealth(
      healthyReading({ latestNonce: null, pendingNonce: null }),
      healthyReading(),
      baseOpts,
    )
    expect(d.networkReady).toBe(true)
    expect(d.networkBlockingReasons).toHaveLength(0)
  })

  test('wallet-provider unable to read contract code does not mark the network unready or blame RPC', () => {
    const d = evaluateHealth(
      healthyReading({ contractCode: '0x', contractCodeHash: null, safeReadOk: false }),
      healthyReading(),
      baseOpts,
    )
    expect(d.networkReady).toBe(true)
    expect(d.networkBlockingReasons).toHaveLength(0)
  })

  test('a stale wallet-provider block does not block', () => {
    const d = evaluateHealth(
      healthyReading({ latestBlock: 1 }),
      healthyReading({ latestBlock: 999_999 }),
      baseOpts,
    )
    expect(d.networkReady).toBe(true)
    expect(d.blockDifference).toBe(999_998)
  })

  test('a wallet-provider balance read failure does not block when the app RPC has the balance', () => {
    const d = evaluateHealth(
      healthyReading({ balanceWei: null }),
      healthyReading({ balanceWei: '5000000000000000000' }),
      { ...baseOpts, minBalanceWei: 1n },
    )
    expect(d.networkReady).toBe(true)
  })

  test('gas gate uses the APPLICATION RPC balance and blocks only when it is too low', () => {
    const d = evaluateHealth(
      healthyReading({ balanceWei: '5000000000000000000' }),
      healthyReading({ balanceWei: '10' }),
      { ...baseOpts, minBalanceWei: 1000n },
    )
    expect(d.networkReady).toBe(false)
    expect(d.networkBlockingReasons.some((r) => /below the estimated gas/.test(r))).toBe(true)
  })
})

describe('evaluateHealth - identity is separate from the network', () => {
  test('session mismatch does NOT make the network unready and is not an RPC failure', () => {
    const d = evaluateHealth(healthyReading(), healthyReading(), {
      connectedWallet: WALLET,
      authWallet: OTHER,
    })
    expect(d.networkReady).toBe(true) // network is fine
    expect(d.identityMatch).toBe(false)
    expect(d.walletMatchesSession).toBe(false)
    expect(d.identityReasons.some((r) => /does not match the signed-in session/.test(r))).toBe(true)
    // The mismatch must NOT appear as a network blocking reason.
    expect(d.networkBlockingReasons.join(' ')).not.toMatch(/session/i)
  })

  test('a wallet-client account that disagrees with the connected wallet fails identity', () => {
    const d = evaluateHealth(healthyReading(), healthyReading(), {
      connectedWallet: WALLET,
      authWallet: WALLET,
      walletClientAccount: OTHER,
    })
    expect(d.identityMatch).toBe(false)
    expect(d.walletClientMatches).toBe(false)
    expect(d.networkReady).toBe(true)
  })

  test('an unknown wallet-client account is not treated as a mismatch', () => {
    const d = evaluateHealth(healthyReading(), healthyReading(), {
      connectedWallet: WALLET,
      authWallet: WALLET,
      walletClientAccount: null,
    })
    expect(d.walletClientMatches).toBe(true)
    expect(d.identityMatch).toBe(true)
  })

  test('matching connected + session + wallet client is a full identity match', () => {
    const d = evaluateHealth(healthyReading(), healthyReading(), {
      connectedWallet: WALLET,
      authWallet: WALLET,
      walletClientAccount: WALLET.toUpperCase(),
    })
    expect(d.identityMatch).toBe(true)
  })

  test('recipient info is exposed without blocking the network', () => {
    const notRecipient = evaluateHealth(healthyReading(), healthyReading(), {
      ...baseOpts,
      requiredRecipient: OTHER,
    })
    expect(notRecipient.connectedIsRecipient).toBe(false)
    expect(notRecipient.networkReady).toBe(true)

    const isRecipient = evaluateHealth(healthyReading(), healthyReading(), {
      ...baseOpts,
      requiredRecipient: WALLET,
    })
    expect(isRecipient.connectedIsRecipient).toBe(true)
  })
})

describe('the exact reported bug: recipient connected, tenant session, provider nonce fails', () => {
  test('network is ready; the only blocker is identity, not RPC and not nonce', () => {
    // Session was signed in as a tenant; the recipient wallet is now connected;
    // the injected provider cannot return eth_getTransactionCount.
    const d = evaluateHealth(
      healthyReading({ latestNonce: null, pendingNonce: null }),
      healthyReading(),
      { connectedWallet: WALLET, authWallet: OTHER },
    )
    expect(d.networkReady).toBe(true) // do NOT blame the RPC
    expect(d.networkBlockingReasons).toHaveLength(0) // nonce is not a blocker
    expect(d.identityMatch).toBe(false) // the real problem
    expect(d.identityReasons).toContain('Connected wallet does not match the signed-in session')
  })
})

describe('classifyPropagation - a returned hash is only a REQUEST', () => {
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
