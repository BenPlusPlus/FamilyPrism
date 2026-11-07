import assert from 'node:assert/strict'
import test from 'node:test'

import { router } from '../../router.ts'
import { routes } from '../../routes.ts'
import { cookieHeaderFrom, formRequest, jsonRequest } from '../../../test/http.ts'
import { closeTestPersistence, installTestPersistence } from '../../../test/persistence.ts'

test.after(async () => {
  await closeTestPersistence()
})

const ADMIN = {
  email: 'console-admin@example.com',
  name: 'Console Admin',
  password: 'password123',
}

async function createFirstAdmin() {
  let response = await router.fetch(
    formRequest(routes.auth.setup.action.href(), ADMIN),
  )

  assert.equal(response.status, 302)
  assert.equal(response.headers.get('location'), routes.admin.index.href())

  return cookieHeaderFrom(response)
}

test('GET /auth/setup renders the first Console admin form', async () => {
  await installTestPersistence()

  let response = await router.fetch(jsonRequest(routes.auth.setup.index.href()))
  let text = await response.text()

  assert.equal(response.status, 200)
  assert.match(text, /Create the admin account/)
})

test('POST /auth/setup creates the first Console admin and opens the rack', async () => {
  await installTestPersistence()

  let cookie = await createFirstAdmin()
  let dashboard = await router.fetch(
    jsonRequest(routes.admin.index.href(), {
      headers: { cookie },
    }),
  )
  let text = await dashboard.text()

  assert.equal(dashboard.status, 200)
  assert.match(text, /No PCs on the rack yet/)
  assert.match(text, /Console Admin/)
})

test('GET /auth/setup redirects to sign in after an admin exists', async () => {
  await installTestPersistence()
  await createFirstAdmin()

  let response = await router.fetch(jsonRequest(routes.auth.setup.index.href()))

  assert.equal(response.status, 302)
  assert.equal(response.headers.get('location'), routes.auth.login.index.href())
})

test('POST /auth/login with a valid Console admin session opens the rack', async () => {
  await installTestPersistence()
  await createFirstAdmin()

  let response = await router.fetch(
    formRequest(routes.auth.login.action.href(), {
      email: ADMIN.email,
      password: ADMIN.password,
    }),
  )

  assert.equal(response.status, 302)
  assert.equal(response.headers.get('location'), routes.admin.index.href())
  assert.match(cookieHeaderFrom(response), /.+/)
})

test('POST /auth/login rejects the wrong password', async () => {
  await installTestPersistence()
  await createFirstAdmin()

  let response = await router.fetch(
    formRequest(routes.auth.login.action.href(), {
      email: ADMIN.email,
      password: 'not-the-password',
    }),
  )
  let text = await response.text()

  assert.equal(response.status, 401)
  assert.match(text, /Couldn't sign you in|Unable to sign in|Invalid/)
})
