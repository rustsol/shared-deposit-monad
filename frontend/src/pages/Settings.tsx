// Settings: real session, wallet, and network facts only - no preferences
// are stored anywhere, and nothing here can touch funds.

import { useAccount, useChainId, useDisconnect } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { monadTestnet } from '../lib/chain'
import { useAuth } from '../app/AuthContext'
import { WalletStatus } from '../app/Shell'
import { PageHeader, ProofRow, WalletAddress } from '../components/ui'

interface PublicConfig {
  network_name: string
  chain_id: number
  contract_address: string | null
  deployment_status: string
  app_version: string
}

const isDev = import.meta.env.DEV

export default function Settings() {
  const { status, wallet, signOut } = useAuth()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { disconnect } = useDisconnect()
  const config = useQuery({
    queryKey: ['public-config'],
    queryFn: () => api<PublicConfig>('/config/public'),
    retry: false,
  })

  return (
    <main className="page narrow">
      <PageHeader
        title="Settings"
        lead="Your session and network at a glance. Nothing here moves funds."
      />

      <section className="card" aria-labelledby="session-heading">
        <h2 id="session-heading">Session</h2>
        <dl className="kv">
          <dt>Signed in</dt>
          <dd>
            {status === 'authenticated' && wallet ? (
              <>
                Yes - <WalletAddress address={wallet} />
              </>
            ) : (
              'No'
            )}
          </dd>
          <dt>Connected wallet</dt>
          <dd>{isConnected && address ? <WalletAddress address={address} /> : 'Not connected'}</dd>
          {isConnected &&
            status === 'authenticated' &&
            wallet &&
            address &&
            wallet.toLowerCase() !== address.toLowerCase() && (
              <>
                <dt>Warning</dt>
                <dd>
                  <span className="badge tone-warning">
                    Connected wallet differs from your session
                  </span>
                </dd>
              </>
            )}
        </dl>
        <div className="button-row">
          <WalletStatus />
          {status === 'authenticated' && (
            <button className="secondary" onClick={() => void signOut()}>
              Sign out
            </button>
          )}
          {isConnected && (
            <button className="secondary" onClick={() => disconnect()}>
              Disconnect wallet
            </button>
          )}
        </div>
      </section>

      <section className="card" aria-labelledby="network-heading">
        <h2 id="network-heading">Network</h2>
        <dl className="kv">
          <dt>Network</dt>
          <dd>
            {config.data?.network_name ?? 'Monad Testnet'} (chain{' '}
            {config.data?.chain_id ?? monadTestnet.id})
          </dd>
          <dt>Wallet network</dt>
          <dd>
            {!isConnected
              ? 'Not connected'
              : chainId === monadTestnet.id
                ? 'Monad Testnet ✓'
                : `Wrong network (chain ${chainId})`}
          </dd>
          <dt>App version</dt>
          <dd>{config.data?.app_version ?? '-'}</dd>
        </dl>
        {config.data?.contract_address && (
          <ProofRow label="Escrow contract" value={config.data.contract_address} />
        )}
        {isDev && (
          <p className="small">
            <a href="/developer/network">Open network diagnostics (development only)</a>
          </p>
        )}
      </section>

      <section className="card tinted" aria-labelledby="privacy-heading">
        <h2 id="privacy-heading">What this app stores</h2>
        <p className="muted small">
          Your session lives in a secure cookie; in-flight transaction recovery data stays in
          this tab only. Private aliases, addresses, and terms are stored on the application
          server and shown only to participants. Wallet addresses, amounts, dates, and votes are
          public on Monad Testnet - that part is permanent.
        </p>
      </section>
    </main>
  )
}
