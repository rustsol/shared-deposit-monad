// Visible dual-provider network health panel. Read-only: Recheck performs only
// reads; Switch/Add use wallet_switchEthereumChain / wallet_addEthereumChain.
// Shows no secrets.

import { useState } from 'react'
import { useAccount } from 'wagmi'
import type { EIP1193Provider } from 'viem'
import { weiToMon, shortAddress } from '../lib/format'
import {
  monadAddChainParams,
  monadSwitchChainParams,
  type NetworkDiagnostics,
} from '../lib/diagnostics'

function yn(value: boolean | null): string {
  return value === null ? '—' : value ? 'Yes' : 'No'
}

export function NetworkDiagnosticsPanel({
  data,
  loading,
  recheck,
}: {
  data: NetworkDiagnostics | null
  loading: boolean
  recheck: () => Promise<void>
}) {
  const { connector } = useAccount()
  const [repairError, setRepairError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function provider(): Promise<EIP1193Provider | undefined> {
    return (await connector?.getProvider()) as EIP1193Provider | undefined
  }

  async function switchNetwork() {
    setRepairError(null)
    setBusy(true)
    try {
      const p = await provider()
      if (!p) throw new Error('no wallet provider')
      try {
        await p.request({
          method: 'wallet_switchEthereumChain',
          params: monadSwitchChainParams(),
        } as never)
      } catch {
        // Unknown chain: try adding it (may be a no-op if it already exists).
        await p.request({
          method: 'wallet_addEthereumChain',
          params: monadAddChainParams(),
        } as never)
      }
      await recheck()
    } catch (error) {
      setRepairError(error instanceof Error ? error.message.split('\n')[0] : String(error))
    } finally {
      setBusy(false)
    }
  }

  if (!data) {
    return (
      <div className="card">
        <h2>Wallet network</h2>
        <p className="muted">{loading ? 'Checking network…' : 'Connect a wallet to check the network.'}</p>
      </div>
    )
  }

  const healthy = data.overallHealth === 'healthy'
  return (
    <div className="card">
      <h2>Wallet network</h2>
      <p>
        Transaction network health:{' '}
        <span className={`badge ${healthy ? 'active' : 'reverted'}`}>
          {healthy ? 'Healthy' : 'Unhealthy'}
        </span>
      </p>
      <table className="data small">
        <thead>
          <tr><th></th><th>Wallet provider</th><th>Application RPC</th></tr>
        </thead>
        <tbody>
          <tr><td>Chain ID</td><td>{data.wallet.chainId ?? '—'}</td><td>{data.app.chainId ?? '—'}</td></tr>
          <tr><td>Latest block</td><td className="amount">{data.wallet.latestBlock ?? '—'}</td><td className="amount">{data.app.latestBlock ?? '—'}</td></tr>
          <tr><td>Block difference</td><td colSpan={2} className="amount">{data.blockDifference ?? '—'}</td></tr>
          <tr><td>Contract visible</td><td>{yn(Boolean(data.wallet.contractCode && data.wallet.contractCode !== '0x'))}</td><td>{yn(Boolean(data.app.contractCode && data.app.contractCode !== '0x'))}</td></tr>
          <tr><td>Contract code match</td><td colSpan={2}>{yn(data.contractCodeMatches)}</td></tr>
          <tr><td>Safe read ok</td><td>{yn(data.wallet.safeReadOk)}</td><td>{yn(data.app.safeReadOk)}</td></tr>
          <tr><td>Balance (MON)</td><td className="amount">{data.wallet.balanceWei !== null ? weiToMon(data.wallet.balanceWei) : '—'}</td><td className="amount">{data.app.balanceWei !== null ? weiToMon(data.app.balanceWei) : '—'}</td></tr>
          <tr><td>Latest nonce</td><td className="amount">{data.wallet.latestNonce ?? '—'}</td><td className="amount">{data.app.latestNonce ?? '—'}</td></tr>
          <tr><td>Pending nonce</td><td className="amount">{data.wallet.pendingNonce ?? '—'}</td><td className="amount">{data.app.pendingNonce ?? '—'}</td></tr>
        </tbody>
      </table>
      <p className="small muted">
        Connected wallet: <span className="mono">{data.connectedWallet ? shortAddress(data.connectedWallet) : '—'}</span>
        {' · '}Session match: {yn(data.walletMatchesSession)}
        {data.connectedIsRecipient !== null && <> · Is recipient: {yn(data.connectedIsRecipient)}</>}
      </p>

      {!healthy && (
        <div className="notice error">
          <strong>This wallet cannot safely transact yet:</strong>
          <ul>
            {data.failures.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="small">
            If switching does not fix it, your wallet's saved Monad Testnet network entry is
            using a broken RPC. Remove the custom Monad Testnet network from your wallet and
            add it again with RPC <span className="mono">https://testnet-rpc.monad.xyz</span>.
          </p>
        </div>
      )}

      <p>
        <button className="secondary" disabled={loading || busy} onClick={() => void recheck()}>
          {loading ? 'Rechecking…' : 'Recheck network'}
        </button>{' '}
        <button className="secondary" disabled={busy} onClick={() => void switchNetwork()}>
          Switch to Monad Testnet
        </button>
      </p>
      {repairError && <div className="notice error">{repairError}</div>}
    </div>
  )
}
