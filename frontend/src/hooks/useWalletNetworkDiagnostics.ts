// Runs the dual-provider Monad Testnet diagnostics: the injected wallet
// provider (EIP-1193, via the active connector) and the application public
// client (our official Monad RPC) are queried INDEPENDENTLY and compared.
// Reads only - never signs, never sends, never touches key material.

import { useCallback, useEffect, useState } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { getConnectorClient, getPublicClient } from 'wagmi/actions'
import type { EIP1193Provider } from 'viem'
import { wagmiConfig } from '../lib/chain'
import { useAuth } from '../app/AuthContext'
import {
  codeHash,
  evaluateHealth,
  safeReadCalldata,
  type NetworkDiagnostics,
  type ProviderReadings,
} from '../lib/diagnostics'

const hexToNumber = (hex: unknown): number | null =>
  typeof hex === 'string' ? Number.parseInt(hex, 16) : null
const hexToBig = (hex: unknown): string | null =>
  typeof hex === 'string' ? BigInt(hex).toString() : null

// Each injected read is independent and best-effort: a wallet that does not
// support (or transiently fails) one optional method - commonly
// eth_getTransactionCount - must not blank out the chain ID, block, or contract
// code that DO succeed. Optional reads staying null is a soft diagnostic, not a
// blocking fault.
async function readInjected(
  provider: EIP1193Provider,
  wallet: `0x${string}`,
  contract: `0x${string}`,
): Promise<ProviderReadings> {
  const req = (method: string, params: unknown[] = []) =>
    provider.request({ method, params } as never)
  const tryReq = async <T>(fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn()
    } catch {
      return null
    }
  }
  const readings: ProviderReadings = {
    chainId: null,
    latestBlock: null,
    balanceWei: null,
    latestNonce: null,
    pendingNonce: null,
    contractCode: null,
    contractCodeHash: null,
    safeReadOk: false,
  }
  readings.chainId = hexToNumber(await tryReq(() => req('eth_chainId')))
  readings.latestBlock = hexToNumber(await tryReq(() => req('eth_blockNumber')))
  readings.balanceWei = hexToBig(await tryReq(() => req('eth_getBalance', [wallet, 'latest'])))
  readings.latestNonce = hexToNumber(
    await tryReq(() => req('eth_getTransactionCount', [wallet, 'latest'])),
  )
  readings.pendingNonce = hexToNumber(
    await tryReq(() => req('eth_getTransactionCount', [wallet, 'pending'])),
  )
  const code = (await tryReq(() => req('eth_getCode', [contract, 'latest']))) as string | null
  if (typeof code === 'string') {
    readings.contractCode = code
    readings.contractCodeHash = codeHash(code)
  }
  const result = (await tryReq(() =>
    req('eth_call', [{ from: wallet, to: contract, data: safeReadCalldata() }, 'latest']),
  )) as string | null
  readings.safeReadOk = typeof result === 'string' && result !== '0x'
  return readings
}

// The active wallet client's own account, for the identity check. Unknown
// (connector doesn't expose it) is treated as "no disagreement", not a fault.
async function readWalletClientAccount(): Promise<string | null> {
  try {
    const client = await getConnectorClient(wagmiConfig)
    return client.account?.address ?? null
  } catch {
    return null
  }
}

async function readPublic(
  wallet: `0x${string}`,
  contract: `0x${string}`,
): Promise<ProviderReadings> {
  const client = getPublicClient(wagmiConfig)
  const readings: ProviderReadings = {
    chainId: null,
    latestBlock: null,
    balanceWei: null,
    latestNonce: null,
    pendingNonce: null,
    contractCode: null,
    contractCodeHash: null,
    safeReadOk: false,
  }
  if (!client) {
    readings.error = 'no application RPC client'
    return readings
  }
  try {
    readings.chainId = client.chain?.id ?? (await client.getChainId())
    readings.latestBlock = Number(await client.getBlockNumber())
    readings.balanceWei = (await client.getBalance({ address: wallet })).toString()
    readings.latestNonce = await client.getTransactionCount({ address: wallet, blockTag: 'latest' })
    readings.pendingNonce = await client.getTransactionCount({
      address: wallet,
      blockTag: 'pending',
    })
    const code = (await client.getCode({ address: contract })) ?? '0x'
    readings.contractCode = code
    readings.contractCodeHash = codeHash(code)
    const result = await client.call({ to: contract, data: safeReadCalldata() })
    readings.safeReadOk = Boolean(result.data && result.data !== '0x')
  } catch (error) {
    readings.error = error instanceof Error ? error.message.split('\n')[0] : String(error)
  }
  return readings
}

export function useWalletNetworkDiagnostics(params: {
  contractAddress?: `0x${string}`
  requiredRecipient?: string | null
  minBalanceWei?: bigint
}) {
  const { address, connector } = useAccount()
  const chainId = useChainId()
  const { wallet: authWallet } = useAuth()
  const [data, setData] = useState<NetworkDiagnostics | null>(null)
  const [loading, setLoading] = useState(false)

  const run = useCallback(async () => {
    if (!address || !params.contractAddress) {
      setData(null)
      return
    }
    setLoading(true)
    try {
      const provider = (await connector?.getProvider()) as EIP1193Provider | undefined
      const [wallet, app, walletClientAccount] = await Promise.all([
        provider
          ? readInjected(provider, address, params.contractAddress)
          : Promise.resolve<ProviderReadings>({
              chainId: null,
              latestBlock: null,
              balanceWei: null,
              latestNonce: null,
              pendingNonce: null,
              contractCode: null,
              contractCodeHash: null,
              safeReadOk: false,
              error: 'no injected wallet provider',
            }),
        readPublic(address, params.contractAddress),
        readWalletClientAccount(),
      ])
      setData(
        evaluateHealth(wallet, app, {
          connectedWallet: address,
          authWallet,
          walletClientAccount,
          requiredRecipient: params.requiredRecipient,
          minBalanceWei: params.minBalanceWei,
        }),
      )
    } finally {
      setLoading(false)
    }
  }, [
    address,
    connector,
    authWallet,
    params.contractAddress,
    params.requiredRecipient,
    params.minBalanceWei,
  ])

  useEffect(() => {
    void run()
    // Re-run when the wallet, chain, or session changes.
  }, [run, chainId])

  return { data, loading, recheck: run }
}
