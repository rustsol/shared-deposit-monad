// Application shell: header, navigation, wallet/network/auth status, the
// persistent transaction drawer, and the global error boundary.

import { Component, useState, type ReactNode } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { useAccount, useChainId, useDisconnect, useSwitchChain } from 'wagmi'
import { monadTestnet, EXPLORER_TX } from '../lib/chain'
import { shortAddress } from '../lib/format'
import { TxRecovery } from '../components/TxRecovery'
import { WalletPicker } from '../components/WalletPicker'
import { useContractTx } from '../hooks/useContractTx'
import { useAuth } from './AuthContext'
import { describeTxStatus, isTerminal, useTx } from './TxContext'

const RESOLVING_STATUSES = ['BROADCAST', 'PENDING_ONCHAIN', 'REFRESHING_CONTRACT_STATE']

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

const STATUS_CLASS: Record<string, string> = {
  VERIFIED: 'verified',
  MINED_REVERTED: 'reverted',
  MINED_SUCCESS: 'pending',
  BROADCAST: 'broadcast',
  PENDING_ONCHAIN: 'pending',
  NONCE_BLOCKED: 'reverted',
  REFRESHING_CONTRACT_STATE: 'pending',
  WAITING_FOR_WALLET: 'waiting-for-wallet',
  TIMEOUT_OR_RPC_ERROR: 'reverted',
  USER_REJECTED: 'reverted',
  REPLACED: 'reverted',
  NOT_FOUND: 'reverted',
  PREPARING: 'pending',
}

function TxDrawer() {
  const { transactions, remove, hide, clear } = useTx()
  const { retryReceipt } = useContractTx()
  const visible = transactions.filter((entry) => !entry.hidden)
  if (visible.length === 0) return null
  return (
    <aside className="tx-drawer" aria-live="polite" aria-label="Transaction status">
      {visible.slice(0, 4).map((entry) => {
        const terminal = isTerminal(entry.status)
        return (
          <div key={entry.id} className={`tx-entry ${STATUS_CLASS[entry.status] ?? ''}`}>
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
            {/* Retry only re-queries the existing hash — never writeContract. */}
            {entry.hash && (entry.status === 'TIMEOUT_OR_RPC_ERROR' || RESOLVING_STATUSES.includes(entry.status)) && (
              <button
                className="secondary small"
                onClick={() => void retryReceipt(entry.id, entry.hash as `0x${string}`)}
              >
                Retry status
              </button>
            )}{' '}
            {/* Terminal entries are removed; non-terminal ones are only HIDDEN
                so the single-flight action lock is never released by Dismiss. */}
            <button
              className="secondary small"
              onClick={() => (terminal ? remove(entry.id) : hide(entry.id))}
            >
              Dismiss
            </button>
          </div>
        )
      })}
      <button className="secondary small" onClick={clear}>
        Clear resolved
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
      <TxRecovery />
      <TxDrawer />
    </>
  )
}
