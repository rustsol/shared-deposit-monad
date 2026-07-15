// Monad Testnet definition and the wagmi configuration.
//
// Multi-wallet support without RainbowKit (which currently targets wagmi v2):
// wagmi v3's EIP-6963 discovery (on by default) surfaces every installed
// browser-extension wallet — MetaMask, Rabby, Brave, Coinbase extension, etc.
// — each as its own connector. We add an `injected()` fallback plus Coinbase
// Wallet and, when a WalletConnect projectId is configured, WalletConnect for
// mobile wallets. Keys always stay inside the wallet.

import { http, createConfig } from 'wagmi'
import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors'
import type { CreateConnectorFn } from 'wagmi'
import { defineChain } from 'viem'

export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: {
      http: [(import.meta.env.VITE_RPC_URL as string | undefined) ?? 'https://testnet-rpc.monad.xyz'],
    },
  },
  blockExplorers: {
    default: { name: 'MonadVision', url: 'https://testnet.monadvision.com' },
  },
  testnet: true,
})

const WALLETCONNECT_PROJECT_ID = (
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined
)?.trim()

export function buildConnectors(projectId?: string): CreateConnectorFn[] {
  const connectors: CreateConnectorFn[] = [
    // Fallback for browser wallets that do not announce via EIP-6963.
    injected({ shimDisconnect: true }),
    coinbaseWallet({ appName: 'Shared Deposit', preference: { options: 'all' } }),
  ]
  // WalletConnect needs a real projectId (free from cloud.reown.com); only add
  // it when configured so an empty id cannot crash connector initialization.
  if (projectId) {
    connectors.push(
      walletConnect({ projectId, metadata: { name: 'Shared Deposit', description: 'Rental deposit escrow on Monad', url: 'http://localhost:5173', icons: [] } }),
    )
  }
  return connectors
}

export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  // EIP-6963 discovery is enabled by default: discovered wallets appear as
  // additional connectors alongside those below.
  connectors: buildConnectors(WALLETCONNECT_PROJECT_ID),
  pollingInterval: 1500,
  transports: { [monadTestnet.id]: http(undefined, { batch: false }) },
})

export const walletConnectConfigured = Boolean(WALLETCONNECT_PROJECT_ID)

export const EXPLORER_TX = 'https://testnet.monadscan.com/tx/'
export const EXPLORER_ADDRESS = 'https://testnet.monadscan.com/address/'
