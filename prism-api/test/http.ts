import { routes } from '../app/routes.ts'

export const TEST_ORIGIN = 'http://localhost:44100'

export function appUrl(path: string) {
  return new URL(path, TEST_ORIGIN)
}

export function cookieHeaderFrom(response: Response) {
  return response.headers
    .getSetCookie()
    .map((header) => header.split(';', 1)[0])
    .filter(Boolean)
    .join('; ')
}

export function formRequest(path: string, fields: Record<string, string>, init: RequestInit = {}) {
  let body = new FormData()
  for (let [name, value] of Object.entries(fields)) {
    body.set(name, value)
  }

  return jsonRequest(path, {
    ...init,
    body,
    method: init.method ?? 'POST',
  })
}

export function jsonRequest(path: string, init: RequestInit = {}) {
  let headers = new Headers(init.headers)
  if (!headers.has('origin')) {
    headers.set('origin', TEST_ORIGIN)
  }

  return new Request(appUrl(path), {
    ...init,
    headers,
  })
}

export { routes }
