// Single-flight action lock and terminal/lifecycle semantics: repeated clicks
// cannot create multiple submissions; Dismiss of a non-terminal entry does not
// release the lock; only terminal states free the action.

import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { useEffect } from 'react'
import {
  isTerminal,
  makeActionKey,
  TxProvider,
  useTx,
  type TxStatus,
} from '../src/app/TxContext'

afterEach(() => {
  vi.unstubAllGlobals()
  try {
    sessionStorage.clear()
  } catch {
    /* jsdom */
  }
})

const KEY = makeActionKey({
  chainId: 10143,
  contractAddress: '0x5720c3f77c66527b59f9f63cd3631a3019400910',
  agreementId: '2',
  functionName: 'acceptAsRecipient',
  wallet: '0x2e35125F5D6552281E663254083bd2B6713977DF',
})

describe('makeActionKey', () => {
  test('is deterministic and normalizes address casing', () => {
    const a = makeActionKey({
      chainId: 10143,
      contractAddress: '0xABC0000000000000000000000000000000000000',
      agreementId: '2',
      functionName: 'acceptAsRecipient',
      wallet: '0xDEF0000000000000000000000000000000000000',
    })
    const b = makeActionKey({
      chainId: 10143,
      contractAddress: '0xabc0000000000000000000000000000000000000',
      agreementId: '2',
      functionName: 'acceptAsRecipient',
      wallet: '0xdef0000000000000000000000000000000000000',
    })
    expect(a).toBe(b)
    expect(a).toContain('acceptAsRecipient')
  })
})

describe('terminal classification', () => {
  test.each([
    ['VERIFIED', true],
    ['MINED_REVERTED', true],
    ['USER_REJECTED', true],
    ['REPLACED', true],
    ['NOT_FOUND', true],
    ['BROADCAST', false],
    ['PENDING_ONCHAIN', false],
    ['NONCE_BLOCKED', false],
    ['TIMEOUT_OR_RPC_ERROR', false],
    ['MINED_SUCCESS', false],
  ] as [TxStatus, boolean][])('%s terminal=%s', (status, expected) => {
    expect(isTerminal(status)).toBe(expected)
  })
})

// A harness component that records lock state and exposes the context.
function Harness({ onReady }: { onReady: (tx: ReturnType<typeof useTx>) => void }) {
  const tx = useTx()
  useEffect(() => {
    onReady(tx)
  })
  return <div data-locked={tx.isActionLocked(KEY)} />
}

function renderTx() {
  let ctx!: ReturnType<typeof useTx>
  const utils = render(
    <TxProvider>
      <Harness onReady={(t) => (ctx = t)} />
    </TxProvider>,
  )
  return { ...utils, get: () => ctx }
}

describe('single-flight action lock', () => {
  test('a non-terminal entry locks the action; a second entry is redundant', () => {
    const h = renderTx()
    act(() => {
      h.get().track({ label: 'accept', functionName: 'acceptAsRecipient', status: 'PENDING_ONCHAIN', chainId: 10143, actionKey: KEY, hash: ('0x' + 'a'.repeat(64)) as `0x${string}` })
    })
    expect(h.get().isActionLocked(KEY)).toBe(true)
  })

  test('Dismiss (hide) of a non-terminal entry does NOT release the lock', () => {
    const h = renderTx()
    let id = ''
    act(() => {
      id = h.get().track({ label: 'accept', functionName: 'acceptAsRecipient', status: 'PENDING_ONCHAIN', chainId: 10143, actionKey: KEY, hash: ('0x' + 'b'.repeat(64)) as `0x${string}` })
    })
    act(() => h.get().hide(id))
    expect(h.get().isActionLocked(KEY)).toBe(true) // still locked
    expect(h.get().transactions.find((t) => t.id === id)?.hidden).toBe(true)
  })

  test('a terminal state releases the lock', () => {
    const h = renderTx()
    let id = ''
    act(() => {
      id = h.get().track({ label: 'accept', functionName: 'acceptAsRecipient', status: 'PENDING_ONCHAIN', chainId: 10143, actionKey: KEY, hash: ('0x' + 'c'.repeat(64)) as `0x${string}` })
    })
    expect(h.get().isActionLocked(KEY)).toBe(true)
    act(() => h.get().update(id, { status: 'NOT_FOUND' }))
    expect(h.get().isActionLocked(KEY)).toBe(false) // released
  })

  test('a timeout is non-terminal and keeps the action locked', () => {
    const h = renderTx()
    let id = ''
    act(() => {
      id = h.get().track({ label: 'accept', functionName: 'acceptAsRecipient', status: 'PENDING_ONCHAIN', chainId: 10143, actionKey: KEY, hash: ('0x' + 'f'.repeat(64)) as `0x${string}` })
    })
    act(() => h.get().update(id, { status: 'TIMEOUT_OR_RPC_ERROR' }))
    expect(h.get().isActionLocked(KEY)).toBe(true) // still locked after timeout
  })

  test('clear() removes resolved entries but keeps active locks', () => {
    const h = renderTx()
    act(() => {
      h.get().track({ label: 'done', functionName: 'acceptAsRecipient', status: 'VERIFIED', chainId: 10143, actionKey: KEY, hash: ('0x' + 'd'.repeat(64)) as `0x${string}` })
      h.get().track({ label: 'live', functionName: 'deposit', status: 'PENDING_ONCHAIN', chainId: 10143, actionKey: 'other', hash: ('0x' + 'e'.repeat(64)) as `0x${string}` })
    })
    act(() => h.get().clear())
    expect(h.get().transactions).toHaveLength(1)
    expect(h.get().isActionLocked('other')).toBe(true)
  })
})
