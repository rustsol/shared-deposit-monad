// Application shell renders real structure with no fake data.

import { render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../src/App'

afterEach(() => vi.unstubAllGlobals())

test('renders the shell without any hardcoded agreement, balance, or transaction', async () => {
  // Backend intentionally unreachable: the app must degrade honestly.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
  render(<App />)
  expect(await screen.findByText('Shared Deposit')).toBeDefined()
  expect(screen.getByText(/One deposit\. Clear contributions\./)).toBeDefined()
  // No fabricated content appears anywhere.
  expect(screen.queryByText(/0x[0-9a-fA-F]{40}/)).toBeNull()
  expect(screen.queryByText(/total value/i)).toBeNull()
  expect(await screen.findByText(/Backend unavailable/i)).toBeDefined()
})
