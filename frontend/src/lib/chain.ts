// Monad Testnet definition and the wagmi configuration. Only injected
// EIP-1193 wallets (MetaMask, Rabby, …) are supported; keys stay in the
// wallet extension, always.

import { http, createConfig } from 'wagmi'
import { injected } from 'wagmi/connectors'
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

export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [injected()],
  transports: { [monadTestnet.id]: http() },
})

export const EXPLORER_TX = 'https://testnet.monadscan.com/tx/'
export const EXPLORER_ADDRESS = 'https://testnet.monadscan.com/address/'
