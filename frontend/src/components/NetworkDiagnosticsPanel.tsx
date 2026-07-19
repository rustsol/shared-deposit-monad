// Visible dual-provider network diagnostics, split into three independent
// sections: IDENTITY (who is connected vs signed in), NETWORK (can the chain be
// transacted on at all), and OPTIONAL DIAGNOSTICS (best-effort injected-provider
// reads that never block). Reads only: Recheck performs reads; Switch/Add use
// wallet_switchEthereumChain / wallet_addEthereumChain. Shows no secrets.

import { useState } from 'react'
import { useAccount } from 'wagmi'
import type { EIP1193Provider } from 'viem'
import { weiToMon, shortAddress } from '../lib/format'
import {
  MONAD_RPC,
  monadAddChainParams,
  monadSwitchChainParams,
  type NetworkDiagnostics,
} from '../lib/diagnostics'

function yn(value: boolean | null): string {
  return value === null ? '-' : value ? 'Yes' : 'No'
}

// Only a genuine chain/contract fault is RPC evidence. A session mismatch or an
// unavailable optional read is NOT.
function hasRpcEvidence(data: NetworkDiagnostics): boolean {
  return data.networkBlockingReasons.length > 0
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
        <p className="muted">
          {loading ? 'Checking network…' : 'Connect a wallet to check the network.'}
        </p>
      </div>
    )
  }

  const appCodeOk = Boolean(data.app.contractCode && data.app.contractCode !== '0x')
  const nonceDisplay = (n: number | null) => (n === null ? 'Unavailable' : String(n))

  return (
    <div className="card">
      <h2>Wallet network</h2>

      {/* IDENTITY ---------------------------------------------------------- */}
      <h3 className="small">Identity</h3>
      <table className="data small">
        <tbody>
          <tr>
            <td>Connected wallet</td>
            <td className="mono">
              {data.connectedWallet ? shortAddress(data.connectedWallet) : '-'}
            </td>
          </tr>
          <tr>
            <td>Signed-in wallet</td>
            <td className="mono">{data.authWallet ? shortAddress(data.authWallet) : '-'}</td>
          </tr>
          <tr>
            <td>Wallet client account</td>
            <td className="mono">
              {data.walletClientAccount ? shortAddress(data.walletClientAccount) : '-'}
            </td>
          </tr>
          <tr>
            <td>Identity match</td>
            <td>
              <span className={`badge ${data.identityMatch ? 'active' : 'reverted'}`}>
                {yn(data.identityMatch)}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      {!data.identityMatch && (
        <div className="notice warn">
          {data.identityReasons.map((r) => (
            <div key={r}>{r}</div>
          ))}
          <p className="small">
            This is an account change, not a network problem. Sign in with the connected wallet to
            continue.
          </p>
        </div>
      )}

      {/* NETWORK ----------------------------------------------------------- */}
      <h3 className="small">Network</h3>
      <table className="data small">
        <tbody>
          <tr>
            <td>Wallet chain ID</td>
            <td>{data.wallet.chainId ?? '-'}</td>
          </tr>
          <tr>
            <td>Application chain ID</td>
            <td>{data.app.chainId ?? '-'}</td>
          </tr>
          <tr>
            <td>Contract via application RPC</td>
            <td>{yn(appCodeOk)}</td>
          </tr>
          <tr>
            <td>Latest application block</td>
            <td className="amount">{data.app.latestBlock ?? '-'}</td>
          </tr>
          <tr>
            <td>Network ready</td>
            <td>
              <span className={`badge ${data.networkReady ? 'active' : 'reverted'}`}>
                {yn(data.networkReady)}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      {!data.networkReady && (
        <div className="notice error">
          <strong>The network is not ready to transact:</strong>
          <ul>
            {data.networkBlockingReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {hasRpcEvidence(data) && (
            <p className="small">
              If switching networks does not fix this, your wallet's saved Monad Testnet entry may
              be using a broken RPC. Re-add it with RPC{' '}
              <span className="mono">{MONAD_RPC}</span>.
            </p>
          )}
        </div>
      )}

      {/* OPTIONAL DIAGNOSTICS --------------------------------------------- */}
      <h3 className="small">Optional diagnostics</h3>
      <p className="small muted">
        These are best-effort reads. An unavailable value here does not block transacting - the
        wallet manages its own nonce and the application RPC is authoritative.
      </p>
      <table className="data small">
        <thead>
          <tr>
            <th></th>
            <th>Wallet provider</th>
            <th>Application RPC</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Latest block</td>
            <td className="amount">{data.wallet.latestBlock ?? '-'}</td>
            <td className="amount">{data.app.latestBlock ?? '-'}</td>
          </tr>
          <tr>
            <td>Nonce (latest)</td>
            <td>{nonceDisplay(data.wallet.latestNonce)}</td>
            <td>{nonceDisplay(data.app.latestNonce)}</td>
          </tr>
          <tr>
            <td>Nonce (pending)</td>
            <td>{nonceDisplay(data.wallet.pendingNonce)}</td>
            <td>{nonceDisplay(data.app.pendingNonce)}</td>
          </tr>
          <tr>
            <td>Balance (MON)</td>
            <td className="amount">
              {data.wallet.balanceWei !== null ? weiToMon(data.wallet.balanceWei) : 'Unavailable'}
            </td>
            <td className="amount">
              {data.app.balanceWei !== null ? weiToMon(data.app.balanceWei) : '-'}
            </td>
          </tr>
          <tr>
            <td>Contract visible</td>
            <td>{yn(Boolean(data.wallet.contractCode && data.wallet.contractCode !== '0x'))}</td>
            <td>{yn(appCodeOk)}</td>
          </tr>
        </tbody>
      </table>

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
