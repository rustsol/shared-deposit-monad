// Backend API client. Session identity lives in the HttpOnly cookie
// (credentials: 'include'); mutations carry the session-bound CSRF token in
// a header. The CSRF value is kept only in memory — never in localStorage.

// Same-origin in development (Vite proxies /api to the backend) so the
// HttpOnly SameSite=Lax session cookie is always sent.
const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1'

let csrfToken: string | null = null

export function setCsrfToken(token: string | null): void {
  csrfToken = token
}

export function getCsrfToken(): string | null {
  return csrfToken
}

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
  }
}

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (MUTATING.has(method) && csrfToken) headers['X-CSRF-Token'] = csrfToken

  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'backend unavailable')
  }
  if (response.status === 204) return undefined as T
  const data: unknown = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail =
      typeof data === 'object' && data !== null && 'detail' in data
        ? String((data as { detail: unknown }).detail)
        : `request failed (${response.status})`
    throw new ApiError(response.status, detail)
  }
  return data as T
}
