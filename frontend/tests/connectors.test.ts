// Multi-wallet connector configuration. Browser wallets (via EIP-6963 + the
// injected fallback) and Coinbase always work; WalletConnect is added only
// when a projectId is configured so an empty id cannot crash init.

import { describe, expect, test } from 'vitest'
import { buildConnectors, monadTestnet } from '../src/lib/chain'

describe('wallet connectors', () => {
  test('without a WalletConnect projectId: injected + coinbase only', () => {
    const connectors = buildConnectors(undefined)
    expect(connectors.length).toBe(2)
  })

  test('with a WalletConnect projectId: adds WalletConnect', () => {
    const connectors = buildConnectors('test-project-id')
    expect(connectors.length).toBe(3)
  })

  test('Monad Testnet chain is configured correctly', () => {
    expect(monadTestnet.id).toBe(10143)
    expect(monadTestnet.nativeCurrency.symbol).toBe('MON')
    expect(monadTestnet.nativeCurrency.decimals).toBe(18)
  })
})
