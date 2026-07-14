// API client behavior: cookie credentials, CSRF only on mutations, and safe
// errors. fetch is mocked here (test-only); the runtime app uses real fetch.

import { afterEach, describe, expect, test, vi } from 'vitest'
import { api, ApiError, setCsrfToken } from '../src/lib/api'

function mockFetch(status: number, body: unknown) {
  const mock = vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => {
  vi.unstubAllGlobals()
  setCsrfToken(null)
})

describe('api client', () => {
  test('sends credentials and CSRF header on mutations', async () => {
    const mock = mockFetch(200, {})
    setCsrfToken('csrf-value')
    await api('/auth/logout', { method: 'POST', body: {} })
    const [, init] = mock.mock.calls[0]
    expect(init.credentials).toBe('include')
    expect(init.headers['X-CSRF-Token']).toBe('csrf-value')
  })

  test('never sends the CSRF header on GET requests', async () => {
    const mock = mockFetch(200, {})
    setCsrfToken('csrf-value')
    await api('/auth/me')
    const [, init] = mock.mock.calls[0]
    expect(init.headers['X-CSRF-Token']).toBeUndefined()
  })

  test('throws ApiError with backend detail on failure', async () => {
    mockFetch(403, { detail: 'invalid CSRF token' })
    await expect(api('/auth/logout', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 403,
      message: 'invalid CSRF token',
    })
  })

  test('maps network failure to backend unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    await expect(api('/health')).rejects.toBeInstanceOf(ApiError)
  })
})
