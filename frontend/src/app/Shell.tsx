// Application shell: header, navigation, wallet/network/auth status, the
// persistent transaction drawer, and the global error boundary.

import { Component, type ReactNode } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { monadTestnet, EXPLORER_TX } from '../lib/chain'
import { shortAddress } from '../lib/format'
import { useAuth } from './AuthContext'
import { describeTxStatus, useTx } from './TxContext'

export function WalletStatus() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const injectedConnector = connectors[0]

  if (!isConnected) {
    return (
      <button
        className="secondary"
        disabled={!injectedConnector || isPending}
        onClick={() => injectedConnector && connect({ connector: injectedConnector })}
      >
        {isPending ? 'Connecting…' : 'Connect wallet'}
      </button>
    )
  }
  return (
    <>
      {chainId !== monadTestnet.id && (
        <button className="danger" onClick={() => switchChain({ chainId: monadTestnet.id })}>
          Wrong network — switch to Monad Testnet
        </button>
      )}
      <span className="mono small" title={address}>
        {address ? shortAddress(address) : ''}
      </span>
      <button className="secondary" onClick={() => disconnect()}>
        Disconnect
      </button>
    </>
  )
}

function AuthStatus() {
  const { status, wallet, signOut } = useAuth()
  if (status === 'authenticated' && wallet) {
    return (
      <>
        <span className="badge active">Signed in</span>
        <button className="secondary" onClick={() => void signOut()}>
          Log out
        </button>
      </>
    )
  }
  return <Link to="/login">Sign in</Link>
}

function TxDrawer() {
  const { transactions, clear } = useTx()
  if (transactions.length === 0) return null
  return (
    <aside className="tx-drawer" aria-live="polite" aria-label="Transaction status">
      {transactions.slice(0, 4).map((entry) => (
        <div key={entry.id} className={`tx-entry ${entry.status}`}>
          <strong>{entry.label}</strong>
          <div className="small muted">
            {entry.functionName} · {describeTxStatus(entry.status)}
          </div>
          {entry.hash && (
            <a className="small mono" href={`${EXPLORER_TX}${entry.hash}`} target="_blank" rel="noreferrer">
              {shortAddress(entry.hash)} ↗
            </a>
          )}
          {entry.error && <div className="small field-error">{entry.error}</div>}
        </div>
      ))}
      <button className="secondary small" onClick={clear}>
        Dismiss
      </button>
    </aside>
  )
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <main className="page">
          <div className="notice error">
            <h2>Something went wrong</h2>
            <p>{this.state.error.message}</p>
            <button className="secondary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}

export default function Shell() {
  return (
    <>
      <header className="app-header">
        <Link to="/" className="app-logo">
          Shared Deposit
        </Link>
        <nav className="app-nav" aria-label="Primary">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/agreements/new">New agreement</Link>
        </nav>
        <div className="header-status">
          <span className="badge">Monad Testnet</span>
          <WalletStatus />
          <AuthStatus />
        </div>
      </header>
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
      <TxDrawer />
    </>
  )
}
