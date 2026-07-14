import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from '../src/App.tsx'

test('renders the scaffold placeholder without fake application data', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Shared Deposit' })).toBeDefined()
  expect(screen.getByText(/not implemented yet/i)).toBeDefined()
})
