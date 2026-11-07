import assert from 'node:assert/strict'
import test from 'node:test'

import { router } from './router.ts'
import { routes } from './routes.ts'
import { jsonRequest } from '../test/http.ts'
import { closeTestPersistence, installTestPersistence } from '../test/persistence.ts'

test.after(async () => {
  await closeTestPersistence()
})

async function readText(path: string, init?: RequestInit) {
  let response = await router.fetch(jsonRequest(path, init))
  return {
    response,
    text: await response.text(),
  }
}

test('GET / renders the public home page', async () => {
  await installTestPersistence()

  let { response, text } = await readText(routes.home.href())

  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /text\/html/)
  assert.match(text, /The household's PCs, on one rack/)
  assert.match(text, /Set up the admin account/)
})

test('GET /auth/login renders the sign-in form', async () => {
  await installTestPersistence()

  let { response, text } = await readText(routes.auth.login.index.href())

  assert.equal(response.status, 200)
  assert.match(text, /Sign in/)
  assert.match(text, /action="\/auth\/login"/)
})

test('GET /admin without a session redirects to sign in', async () => {
  await installTestPersistence()

  let response = await router.fetch(jsonRequest(routes.admin.index.href()))

  assert.equal(response.status, 302)
  assert.equal(response.headers.get('location'), routes.auth.login.index.href())
})

test('GET /ws requires an HTTP upgrade', async () => {
  await installTestPersistence()

  let response = await router.fetch(jsonRequest(routes.websocket.href()))

  assert.equal(response.status, 426)
})

test('POST /api/clients/register rejects the wrong registration password', async () => {
  await installTestPersistence()

  let response = await router.fetch(
    jsonRequest(routes.api.clients.register.href(), {
      body: JSON.stringify({
        clientName: 'Kitchen PC',
        registrationPassword: 'wrong-password',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }),
  )

  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), {
    message: 'Invalid registration password.',
  })
})

test('POST /api/clients/register issues a Client credential', async () => {
  await installTestPersistence()

  let response = await router.fetch(
    jsonRequest(routes.api.clients.register.href(), {
      body: JSON.stringify({
        clientName: 'Kitchen PC',
        registrationPassword: 'test-registration-password',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }),
  )

  assert.equal(response.status, 200)
  let body = (await response.json()) as {
    clientId: string
    clientName: string
    credential: string
    websocketPath: string
  }
  assert.equal(body.clientName, 'Kitchen PC')
  assert.equal(body.websocketPath, '/ws')
  assert.match(body.clientId, /.+/)
  assert.match(body.credential, /^pc_/)
})

test('GET /api/clients/:clientId/update rejects missing credentials', async () => {
  await installTestPersistence()

  let response = await router.fetch(
    jsonRequest(routes.api.clients.update.href({ clientId: 'client-1' })),
  )

  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), {
    message: 'Missing client credentials.',
  })
})

test('POST /api/auth/sign-up/email is not a public route', async () => {
  await installTestPersistence()

  let response = await router.fetch(
    jsonRequest(routes.api.auth.href({ path: 'sign-up/email' }), {
      body: JSON.stringify({
        email: 'intruder@example.com',
        name: 'Intruder',
        password: 'password123',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }),
  )

  assert.equal(response.status, 404)
})
