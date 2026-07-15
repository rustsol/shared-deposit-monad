// Wallet picker: lists every connector wagmi exposes — all EIP-6963 browser
// wallets (MetaMask, Rabby, Brave, Coinbase extension, …) plus Coinbase Wallet
// and, when configured, WalletConnect. The user chooses which wallet to
// connect. No private key ever leaves the wallet.

import { useMemo, useState } from 'react'
import { useConnect } from 'wagmi'
import type { Connector } from 'wagmi'
import { walletConnectConfigured } from '../lib/chain'

function dedupeConnectors(connectors: readonly Connector[]): Connector[] {
  // EIP-6963 discovery plus an explicit injected() fallback can surface the
  // same wallet twice; prefer the named (discovered) entry over generic ones.
  const byName = new Map<string, Connector>()
  for (const connector of connectors) {
    const key = connector.name.toLowerCase()
    const existing = byName.get(key)
    if (!existing || existing.id === 'injected') byName.set(key, connector)
  }
  return [...byName.values()]
}

export function WalletPicker({ onClose }: { onClose: () => void }) {
  const { connect, connectors, isPending, error } = useConnect()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const options = useMemo(() => dedupeConnectors(connectors), [connectors])

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Choose a wallet"
      onClick={onClose}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Connect a wallet</h2>
          <button className="secondary small" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="muted small">
          Choose any installed wallet. Your keys never leave the wallet — signing in
          later is a signature, not a transaction.
        </p>
        <div className="wallet-list">
          {options.map((connector) => (
            <button
              key={connector.uid}
              className="wallet-option"
              disabled={isPending}
              onClick={() => {
                setPendingId(connector.uid)
                connect(
                  { connector },
                  {
                    onSuccess: onClose,
                    onSettled: () => setPendingId(null),
                  },
                )
              }}
            >
              {connector.icon && (
                <img src={connector.icon} alt="" width={24} height={24} aria-hidden="true" />
              )}
              <span>{connector.name}</span>
              {pendingId === connector.uid && <span className="muted small">connecting…</span>}
            </button>
          ))}
        </div>
        {options.length === 0 && (
          <div className="notice warn">
            No wallet detected. Install a browser wallet such as MetaMask or Rabby, then
            reopen this dialog.
          </div>
        )}
        {!walletConnectConfigured && (
          <p className="muted small">
            Tip: to add mobile wallets via WalletConnect, set VITE_WALLETCONNECT_PROJECT_ID
            in frontend/.env (a free id from cloud.reown.com).
          </p>
        )}
        {error && <div className="notice error">{error.message}</div>}
      </div>
    </div>
  )
}
