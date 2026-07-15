// Wallet-signature authentication state (EIP-4361). The session cookie is
// HttpOnly; only the wallet address and the in-memory CSRF token live here.
// An account change in the wallet invalidates the authenticated session view.

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useAccount, useChainId, useSignMessage, useSwitchChain } from 'wagmi'
import { api, setCsrfToken } from '../lib/api'
import { monadTestnet } from '../lib/chain'

const WRONG_CHAIN_MESSAGE =
  'Your wallet must be on Monad Testnet (chain 10143) to sign in. This wallet could not ' +
  'switch to Monad Testnet — some wallets (for example Phantom) do not support it. Please ' +
  'use MetaMask or Rabby, which can add and switch to Monad Testnet.'

export type AuthStatus =
  | 'loading'
  | 'anonymous'
  | 'signing'
  | 'verifying'
  | 'authenticated'
  | 'error'

interface MeResponse {
  authenticated: boolean
  wallet_address: string | null
  display_name: string | null
  session_expires_at: string | null
  csrf_token: string | null
}

interface AuthState {
  status: AuthStatus
  wallet: string | null
  error: string | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [wallet, setWallet] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const me = await api<MeResponse>('/auth/me')
      if (me.authenticated && me.wallet_address) {
        setWallet(me.wallet_address)
        setCsrfToken(me.csrf_token)
        setStatus('authenticated')
      } else {
        setWallet(null)
        setCsrfToken(null)
        setStatus('anonymous')
      }
    } catch {
      setWallet(null)
      setStatus('anonymous')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // The authenticated identity must match the connected wallet: treat a
  // wallet account switch as no longer authenticated for UI purposes.
  const effectiveStatus =
    status === 'authenticated' &&
    (!isConnected || (address && wallet && address.toLowerCase() !== wallet))
      ? 'anonymous'
      : status

  const signIn = useCallback(async () => {
    if (!address) throw new Error('connect a wallet first')
    setError(null)
    setStatus('signing')
    try {
      // The sign-in message is EIP-4361 with Chain ID 10143. SIWE-aware wallets
      // refuse to sign unless the wallet is actually on that chain, so switch
      // to Monad Testnet first. Wallets that cannot switch (e.g. Phantom, which
      // does not support Monad) fail here with a clear message instead of a
      // cryptic chain-id error at signing time.
      if (chainId !== monadTestnet.id) {
        try {
          await switchChainAsync({ chainId: monadTestnet.id })
        } catch {
          throw new Error(WRONG_CHAIN_MESSAGE)
        }
      }
      const nonce = await api<{ message: string }>('/auth/nonce', {
        method: 'POST',
        body: { address },
      })
      const signature = await signMessageAsync({ message: nonce.message })
      setStatus('verifying')
      const verified = await api<MeResponse>('/auth/verify', {
        method: 'POST',
        body: { address, message: nonce.message, signature },
      })
      // Confirm the session cookie actually round-trips before reporting
      // success: a login is only real when /auth/me sees the session.
      const confirmed = await api<MeResponse>('/auth/me')
      if (!confirmed.authenticated || !confirmed.wallet_address) {
        throw new Error(
          'the browser did not accept the session cookie — reload the page and sign in again',
        )
      }
      setWallet(verified.wallet_address)
      setCsrfToken(confirmed.csrf_token ?? verified.csrf_token)
      setStatus('authenticated')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'sign-in failed'
      // A user rejecting the signature is a normal decision, not a failure.
      if (/reject|denied/i.test(message)) {
        setError(null)
        setStatus('anonymous')
      } else if (/chain id|does not match|unsupported chain|4361/i.test(message)) {
        // The wallet refused the SIWE signature over a chain mismatch.
        setError(WRONG_CHAIN_MESSAGE)
        setStatus('error')
      } else {
        setError(message)
        setStatus('error')
      }
    }
  }, [address, chainId, switchChainAsync, signMessageAsync])

  const signOut = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' })
    } catch {
      // Session may already be gone; local state clears regardless.
    }
    setWallet(null)
    setCsrfToken(null)
    setStatus('anonymous')
  }, [])

  return (
    <AuthContext.Provider
      value={{ status: effectiveStatus, wallet, error, signIn, signOut, refresh }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
