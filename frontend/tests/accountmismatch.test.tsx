// Account-change handling: when a session exists for a different wallet, the UI
// must present a productive re-authentication path — never participant actions,
// never an RPC accusation.

import { act, cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

const signInAsConnected = vi.fn().mockResolvedValue(undefined)
const disconnect = vi.fn()

let authState: {
  status: string
  error: string | null
  signInAsConnected: typeof signInAsConnected
}

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>()
  return { ...actual, useDisconnect: () => ({ disconnect }) }
})

vi.mock('../src/app/AuthContext', () => ({
  useAuth: () => authState,
}))

import { AccountMismatchCard } from '../src/components/AgreementActions'

const SESSION = '0x1111111111111111111111111111111111111111'
const CONNECTED = '0x2e35125F5D6552281E663254083bd2B6713977DF'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AccountMismatchCard', () => {
  test('shows the re-auth prompt and never any participant action', () => {
    authState = { status: 'authenticated', error: null, signInAsConnected }
    render(<AccountMismatchCard sessionWallet={SESSION} connectedWallet={CONNECTED} />)

    expect(screen.getByText('Connected wallet changed')).toBeDefined()
    expect(screen.getByRole('button', { name: /Sign in as connected wallet/i })).toBeDefined()
    // No tenant/recipient/deposit controls leak into the mismatch state.
    expect(screen.queryByText(/Accept as tenant/i)).toBeNull()
    expect(screen.queryByText(/Accept as deposit recipient/i)).toBeNull()
    expect(screen.queryByText(/^Deposit$/i)).toBeNull()
    // No RPC accusation.
    expect(screen.queryByText(/broken RPC/i)).toBeNull()
    expect(screen.queryByText(/cannot safely transact/i)).toBeNull()
  })

  test('the primary button runs the EIP-4361 re-auth flow for the connected wallet', async () => {
    authState = { status: 'authenticated', error: null, signInAsConnected }
    render(<AccountMismatchCard sessionWallet={SESSION} connectedWallet={CONNECTED} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Sign in as connected wallet/i }))
    })
    expect(signInAsConnected).toHaveBeenCalledTimes(1)
  })

  test('the secondary button disconnects so the previous wallet can be reconnected', () => {
    authState = { status: 'authenticated', error: null, signInAsConnected }
    render(<AccountMismatchCard sessionWallet={SESSION} connectedWallet={CONNECTED} />)
    fireEvent.click(screen.getByRole('button', { name: /Reconnect previous wallet/i }))
    expect(disconnect).toHaveBeenCalledTimes(1)
  })

  test('a signing status disables the buttons', () => {
    authState = { status: 'signing', error: null, signInAsConnected }
    render(<AccountMismatchCard sessionWallet={SESSION} connectedWallet={CONNECTED} />)
    const btn = screen.getByRole('button', { name: /Signing in…/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })
})
