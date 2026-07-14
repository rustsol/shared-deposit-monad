import { useNavigate } from 'react-router-dom'
import { useAccount, useChainId } from 'wagmi'
import { monadTestnet } from '../lib/chain'
import { useAuth } from '../app/AuthContext'
import { WalletStatus } from '../app/Shell'

export default function Login() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { status, error, signIn, wallet } = useAuth()
  const navigate = useNavigate()

  if (status === 'authenticated' && wallet) {
    return (
      <main className="page">
        <h1>Signed in</h1>
        <div className="notice success">
          Authenticated as <span className="mono">{wallet}</span>
        </div>
        <button className="primary" onClick={() => navigate('/dashboard')}>
          Go to dashboard
        </button>
      </main>
    )
  }

  return (
    <main className="page">
      <h1>Sign in with your wallet</h1>
      <div className="card">
        <h3>1. Connect your wallet</h3>
        <p className="muted small">MetaMask, Rabby, or any injected wallet.</p>
        <WalletStatus />
        {isConnected && chainId !== monadTestnet.id && (
          <div className="notice warn">Switch to Monad Testnet (chain 10143) to continue.</div>
        )}
      </div>
      <div className="card">
        <h3>2. Sign the sign-in message</h3>
        <p className="muted small">
          Signing proves you own the wallet. It is <strong>not a blockchain transaction</strong>:
          it moves no funds, costs no gas, and grants no contract permission.
        </p>
        <button
          className="primary"
          disabled={!isConnected || chainId !== monadTestnet.id || status === 'signing' || status === 'verifying'}
          onClick={() => void signIn()}
        >
          {status === 'signing'
            ? 'Waiting for signature…'
            : status === 'verifying'
              ? 'Verifying…'
              : 'Sign in'}
        </button>
        {error && <div className="notice error">{error}</div>}
      </div>
    </main>
  )
}
