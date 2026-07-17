// Wallet sign-in: connect, then sign a message. The copy is explicit that a
// sign-in signature is not a blockchain transaction.

import { useNavigate } from 'react-router-dom'
import { useAccount, useChainId } from 'wagmi'
import { monadTestnet } from '../lib/chain'
import { useAuth } from '../app/AuthContext'
import { WalletStatus } from '../app/Shell'
import { PageHeader, WalletAddress } from '../components/ui'

export default function Login() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { status, error, signIn, wallet } = useAuth()
  const navigate = useNavigate()

  if (status === 'authenticated' && wallet) {
    return (
      <main className="page narrow">
        <PageHeader title="You're signed in" />
        <div className="notice success">
          Signed in as <WalletAddress address={wallet} />
        </div>
        <button className="primary" onClick={() => navigate('/dashboard')}>
          Go to your dashboard
        </button>
      </main>
    )
  }

  return (
    <main className="page narrow">
      <PageHeader
        title="Sign in with your wallet"
        lead="Two quick steps: connect your wallet, then sign a message to prove it's yours."
      />
      <div className="card">
        <h2>1. Connect your wallet</h2>
        <p className="muted small">MetaMask, Rabby, or any browser wallet.</p>
        <WalletStatus />
        {isConnected && chainId !== monadTestnet.id && (
          <div className="notice warn">Switch to Monad Testnet (chain 10143) to continue.</div>
        )}
      </div>
      <div className="card">
        <h2>2. Sign the sign-in message</h2>
        <p className="muted small">
          Signing proves you own the wallet. It is <strong>not a blockchain transaction</strong>:
          it moves no funds, costs no gas, and grants no contract permission.
        </p>
        <button
          className="primary"
          disabled={
            !isConnected ||
            chainId !== monadTestnet.id ||
            status === 'signing' ||
            status === 'verifying'
          }
          onClick={() => void signIn()}
        >
          {status === 'signing'
            ? 'Waiting for your signature…'
            : status === 'verifying'
              ? 'Verifying…'
              : 'Sign in'}
        </button>
        {error && <div className="notice error">{error}</div>}
      </div>
    </main>
  )
}
