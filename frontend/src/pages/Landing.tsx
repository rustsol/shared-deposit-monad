import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

interface PublicConfig {
  deployment_status: string
  contract_address: string | null
  chain_id: number
  network_name: string
  explorers: { monadvisionContractUrl?: string } | null
}

export default function Landing() {
  const config = useQuery({
    queryKey: ['public-config'],
    queryFn: () => api<PublicConfig>('/config/public'),
    retry: false,
  })

  return (
    <main className="page">
      <h1>One deposit. Clear contributions. Verifiable settlement.</h1>
      <p className="muted">
        A voluntary security-deposit escrow for a small group of tenants and one deposit
        recipient — funded, voted, and settled on Monad Testnet. Wallet addresses, amounts,
        dates, and votes are public onchain; names and documents stay private.
      </p>
      <div className="card">
        <h2>How it works</h2>
        <ol>
          <li>
            <strong>Fund</strong> — every tenant locks their exact share in the escrow contract.
            Nobody's roommate holds the money.
          </li>
          <li>
            <strong>Review claims</strong> — after the lease, the deposit recipient submits
            evidence-backed deductions and tenants vote under a strict-majority rule.
          </li>
          <li>
            <strong>Settle</strong> — the contract calculates and releases exact refunds and
            approved deductions. No administrator can touch the funds.
          </li>
        </ol>
        <p>
          <Link to="/agreements/new">
            <button className="primary">Create agreement</button>
          </Link>{' '}
          <Link to="/dashboard">
            <button className="secondary">Open dashboard</button>
          </Link>
        </p>
      </div>
      <div className="card small">
        {config.isLoading && <p className="muted">Loading network configuration…</p>}
        {config.isError && (
          <div className="notice error">Backend unavailable — start the API server.</div>
        )}
        {config.data && config.data.deployment_status === 'verified' && (
          <p className="muted">
            Escrow contract{' '}
            <a
              href={config.data.explorers?.monadvisionContractUrl ?? '#'}
              target="_blank"
              rel="noreferrer"
              className="mono"
            >
              {config.data.contract_address}
            </a>{' '}
            on {config.data.network_name} (chain {config.data.chain_id}), source verified.
          </p>
        )}
        {config.data && config.data.deployment_status !== 'verified' && (
          <div className="notice warn">
            No verified contract deployment is configured yet.
          </div>
        )}
        <p className="muted">
          This is a voluntary escrow between wallets. It is not legal advice and not a
          government deposit-protection scheme.
        </p>
      </div>
    </main>
  )
}
