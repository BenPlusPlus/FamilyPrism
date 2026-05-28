import { prismAuth } from '../data/auth.ts'

interface BetterAuthInvocationResult<payload> {
  data: payload | null
  errorMessage: string | null
  response: Response
}

function forwardRequestHeaders(request: Request, extraHeaders?: HeadersInit) {
  let headers = new Headers(extraHeaders)

  for (let headerName of [
    'accept',
    'cookie',
    'host',
    'origin',
    'user-agent',
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-proto',
  ]) {
    let value = request.headers.get(headerName)
    if (value && !headers.has(headerName)) {
      headers.set(headerName, value)
    }
  }

  return headers
}

async function readJsonSafely<payload>(response: Response): Promise<payload | null> {
  let contentType = response.headers.get('content-type')
  if (!contentType || !contentType.includes('application/json')) {
    return null
  }

  return (await response.clone().json()) as payload
}

function getErrorMessage(data: unknown, response: Response) {
  if (data && typeof data === 'object') {
    if ('message' in data && typeof data.message === 'string') {
      return data.message
    }

    if (
      'error' in data &&
      data.error &&
      typeof data.error === 'object' &&
      'message' in data.error &&
      typeof data.error.message === 'string'
    ) {
      return data.error.message
    }
  }

  return response.ok ? null : `Authentication request failed with status ${response.status}.`
}

async function invokeBetterAuth<payload>(
  request: Request,
  path: string,
  init: Omit<RequestInit, 'headers'> & { headers?: HeadersInit } = {},
): Promise<BetterAuthInvocationResult<payload>> {
  let headers = forwardRequestHeaders(request, init.headers)
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  let authRequest = new Request(new URL(path, request.url), {
    ...init,
    headers,
  })

  let response = await prismAuth.handler(authRequest)
  let data = await readJsonSafely<payload>(response)

  return {
    data,
    errorMessage: getErrorMessage(data, response),
    response,
  }
}

export function headersWithAuthCookies(authResponse: Response, init?: HeadersInit) {
  let headers = new Headers(init)

  for (let cookie of authResponse.headers.getSetCookie()) {
    headers.append('set-cookie', cookie)
  }

  return headers
}

export function headersWithMergedCookies(authResponse: Response, request: Request, init?: HeadersInit) {
  let headers = headersWithAuthCookies(authResponse, init)

  let existingCookieHeader = request.headers.get('cookie')
  if (existingCookieHeader && !headers.has('cookie')) {
    headers.set('cookie', existingCookieHeader)
  }

  return headers
}

export async function signUpWithEmail(
  request: Request,
  body: {
    email: string
    name: string
    password: string
  },
) {
  return invokeBetterAuth<{
    token: string | null
    user: {
      email: string
      id: string
      name: string
    }
  }>(request, '/api/auth/sign-up/email', {
    body: JSON.stringify(body),
    method: 'POST',
  })
}

export async function signInWithEmail(
  request: Request,
  body: {
    email: string
    password: string
  },
) {
  return invokeBetterAuth<{
    redirect: boolean
    token: string
    url?: string
    user: {
      email: string
      id: string
      name: string
    }
  }>(request, '/api/auth/sign-in/email', {
    body: JSON.stringify(body),
    method: 'POST',
  })
}

export async function signOutFromRequest(request: Request, headers?: HeadersInit) {
  return invokeBetterAuth<{ success?: boolean; status?: boolean }>(request, '/api/auth/sign-out', {
    headers,
    method: 'POST',
  })
}

