// Local-development-only dual-provider network diagnostics view. Renders a Not
// Found page outside development. Copy diagnostics contains only safe public
// facts (no keys, signatures, cookies, CSRF, or invitation tokens).

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { NetworkDiagnosticsPanel } from '../components/NetworkDiagnosticsPanel'
import { useWalletNetworkDiagnostics } from '../hooks/useWalletNetworkDiagnostics'

interface PublicConfig {
  environment: string
  chain_id: number
  rpc_url: string
  contract_address: string | null
  deployment_status: string
}

const isDev = import.meta.env.DEV

export default function DeveloperNetwork() {
  const config = useQuery({
    queryKey: ['public-config'],
    queryFn: () => api<PublicConfig>('/config/public'),
    retry: false,
  })
  const contractAddress = config.data?.contract_address as `0x${string}` | undefined
  const { data, loading, recheck } = useWalletNetworkDiagnostics({ contractAddress })
  const [copied, setCopied] = useState(false)

  if (!isDev) {
    return (
      <main className="page">
        <h1>Page not found</h1>
      </main>
    )
  }

  function copyDiagnostics() {
    if (!data) return
    const safe = {
      environment: config.data?.environment,
      chainId: config.data?.chain_id,
      rpcUrl: config.data?.rpc_url,
      contractAddress: config.data?.contract_address,
      overallHealth: data.overallHealth,
      failures: data.failures,
      blockDifference: data.blockDifference,
      wallet: { ...data.wallet, contractCode: undefined },
      app: { ...data.app, contractCode: undefined },
      connectedWallet: data.connectedWallet,
      walletMatchesSession: data.walletMatchesSession,
    }
    void navigator.clipboard.writeText(JSON.stringify(safe, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <main className="page">
      <h1>Network diagnostics</h1>
      <p className="muted small">
        Development-only view of the dual-provider health checks. Nothing here is required for
        normal use.
      </p>
      <div className="card small">
        <dl className="kv">
          <dt>Environment</dt><dd>{config.data?.environment ?? '-'}</dd>
          <dt>Configured chain</dt><dd>{config.data?.chain_id ?? '-'}</dd>
          <dt>Application RPC</dt><dd className="mono">{config.data?.rpc_url ?? '-'}</dd>
          <dt>Contract</dt><dd className="mono">{config.data?.contract_address ?? '-'}</dd>
          <dt>Deployment</dt><dd>{config.data?.deployment_status ?? '-'}</dd>
        </dl>
      </div>
      <NetworkDiagnosticsPanel data={data} loading={loading} recheck={recheck} />
      <p>
        <button className="secondary" disabled={!data} onClick={copyDiagnostics}>
          {copied ? 'Copied' : 'Copy diagnostics'}
        </button>
      </p>
    </main>
  )
}
