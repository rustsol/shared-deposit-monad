// Application shell: skip link, header, navigation with current-page state,
// wallet/network/auth status, the persistent transaction drawer, and the
// global error boundary.

import { Component, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAccount, useChainId, useDisconnect, useSwitchChain } from 'wagmi'
import { monadTestnet } from '../lib/chain'
import { shortAddress } from '../lib/format'
import { ErrorState } from '../components/ui'
import { TransactionDrawer } from '../components/TransactionDrawer'
import { TxRecovery } from '../components/TxRecovery'
import { WalletPicker } from '../components/WalletPicker'
import { useAuth } from './AuthContext'

export function WalletStatus() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const [pickerOpen, setPickerOpen] = useState(false)

  if (!isConnected) {
    return (
      <>
        <button className="secondary" onClick={() => setPickerOpen(true)}>
          Connect wallet
        </button>
        {pickerOpen && <WalletPicker onClose={() => setPickerOpen(false)} />}
      </>
    )
  }
  return (
    <>
      {chainId !== monadTestnet.id && (
        <button className="danger" onClick={() => switchChain({ chainId: monadTestnet.id })}>
          Switch to Monad Testnet
        </button>
      )}
      <span className="mono small" title={address}>
        {address ? shortAddress(address) : ''}
      </span>
      <button className="secondary compact" onClick={() => disconnect()}>
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
        <span className="badge tone-success">Signed in</span>
        <button className="secondary compact" onClick={() => void signOut()}>
          Sign out
        </button>
      </>
    )
  }
  return (
    <Link to="/login" className="button-secondary">
      Sign in
    </Link>
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
        <main className="page" id="main">
          <ErrorState title="Something went wrong" retry={() => window.location.reload()}>
            {this.state.error.message}
          </ErrorState>
        </main>
      )
    }
    return this.props.children
  }
}

export default function Shell() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="app-header">
        <Link to="/" className="app-logo">
          <span className="logo-mark" aria-hidden="true">
            SD
          </span>
          Shared Deposit
        </Link>
        <nav className="app-nav" aria-label="Primary">
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/agreements/new">New agreement</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <div className="header-status">
          <span className="badge" title="All agreements live on Monad Testnet (chain 10143)">
            Monad Testnet
          </span>
          <WalletStatus />
          <AuthStatus />
        </div>
      </header>
      <ErrorBoundary>
        <div id="main">
          <Outlet />
        </div>
      </ErrorBoundary>
      <TxRecovery />
      <TransactionDrawer />
    </>
  )
}
