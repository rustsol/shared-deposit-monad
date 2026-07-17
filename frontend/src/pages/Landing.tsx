// Public landing page: what the product does, in plain language, plus the
// verifiable contract facts. No metrics, no charts — only real information.

import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { ProofRow } from '../components/ui'

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
      <section className="hero">
        <h1>One deposit. Clear contributions. Verifiable settlement.</h1>
        <p className="lead">
          A shared rental deposit for a small group of tenants and one deposit recipient. Every
          contribution is locked in a single onchain escrow — nobody's roommate holds the money,
          and no administrator can touch it.
        </p>
        <div className="button-row">
          <Link className="button-primary" to="/agreements/new">
            Create an agreement
          </Link>
          <Link className="button-secondary" to="/dashboard">
            Open your dashboard
          </Link>
        </div>
      </section>

      <section aria-labelledby="how-heading">
        <h2 id="how-heading">How it works</h2>
        <div className="how-grid">
          <div className="card">
            <div className="step-number" aria-hidden="true">
              1
            </div>
            <h3>Fund together</h3>
            <p className="muted">
              Every tenant locks their exact share in the escrow contract. The deposit activates
              only when everyone has accepted and paid in full.
            </p>
          </div>
          <div className="card">
            <div className="step-number" aria-hidden="true">
              2
            </div>
            <h3>Review claims</h3>
            <p className="muted">
              After the lease, the deposit recipient can claim deductions with evidence. Tenants
              vote, and a strict majority decides.
            </p>
          </div>
          <div className="card">
            <div className="step-number" aria-hidden="true">
              3
            </div>
            <h3>Settle exactly</h3>
            <p className="muted">
              The contract computes and releases exact refunds and approved deductions. Wallet
              addresses, amounts, and votes are public; names and documents stay private.
            </p>
          </div>
        </div>
      </section>

      <section className="card tinted" aria-labelledby="proof-heading">
        <h2 id="proof-heading">Verify it yourself</h2>
        {config.isLoading && <p className="muted">Loading network configuration…</p>}
        {config.isError && (
          <div className="notice error">Backend unavailable — start the API server.</div>
        )}
        {config.data && config.data.deployment_status === 'verified' && (
          <>
            <ProofRow label="Escrow contract" value={config.data.contract_address ?? ''} />
            <p className="muted small">
              Deployed on {config.data.network_name} (chain {config.data.chain_id}), source
              verified.{' '}
              {config.data.explorers?.monadvisionContractUrl && (
                <a
                  href={config.data.explorers.monadvisionContractUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View the verified source ↗
                </a>
              )}
            </p>
          </>
        )}
        {config.data && config.data.deployment_status !== 'verified' && (
          <div className="notice warn">No verified contract deployment is configured yet.</div>
        )}
        <p className="muted small">
          This is a voluntary escrow between wallets on a test network. It is not legal advice
          and not a government deposit-protection scheme.
        </p>
      </section>
    </main>
  )
}
