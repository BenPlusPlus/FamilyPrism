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
  let response = await router.fetch(formRequest(routes.auth.setup.action.href(), ADMIN))
  assert.equal(response.status, 302)
  return cookieHeaderFrom(response)
}

async function registerClient(name: string) {
  let response = await router.fetch(
    jsonRequest(routes.api.clients.register.href(), {
      body: JSON.stringify({
        clientName: name,
        registrationPassword: 'test-registration-password',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }),
  )
  assert.equal(response.status, 200)
  return (await response.json()) as { clientId: string; credential: string }
}

function visitPayload(overrides: Record<string, unknown> = {}) {
  return {
    browser: 'Chrome',
    browserProfile: 'Default',
    title: 'Example',
    url: 'https://example.com/',
    visitTime: new Date(Date.now() - 60_000).toISOString(),
    windowsUser: 'HOUSE\\kid',
    ...overrides,
  }
}

async function postVisits(
  client: { clientId: string; credential: string },
  visits: Record<string, unknown>[],
  extraHeaders: Record<string, string> = {},
) {
  return router.fetch(
    jsonRequest(routes.api.clients.visits.href({ clientId: client.clientId }), {
      body: JSON.stringify({ visits }),
      headers: {
        authorization: `Bearer ${client.credential}`,
        'content-type': 'application/json',
        'x-client-id': client.clientId,
        ...extraHeaders,
      },
      method: 'POST',
    }),
  )
}

async function readHistory(cookie: string, page?: number) {
  let path = routes.admin.history.index.href()
  if (page && page > 1) {
    path = `${path}?page=${page}`
  }

  let response = await router.fetch(
    jsonRequest(path, {
      headers: { cookie },
    }),
  )
  return {
    response,
    text: await response.text(),
  }
}

test('POST /api/clients/:clientId/visits rejects missing credentials', async () => {
  await installTestPersistence()
  let client = await registerClient('Kitchen PC')

  let response = await router.fetch(
    jsonRequest(routes.api.clients.visits.href({ clientId: client.clientId }), {
      body: JSON.stringify({ visits: [visitPayload()] }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }),
  )

  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), {
    message: 'Missing client credentials.',
  })
})

test('authenticated Client can upload Visits listed on History', async () => {
  await installTestPersistence()
  let cookie = await createFirstAdmin()
  let client = await registerClient('Kitchen PC')
  let older = visitPayload({
    title: 'Older page',
    url: 'https://older.example/',
    visitTime: new Date(Date.now() - 120_000).toISOString(),
  })
  let newer = visitPayload({
    title: 'Newer page',
    url: 'https://newer.example/',
    visitTime: new Date(Date.now() - 30_000).toISOString(),
  })

  let uploaded = await postVisits(client, [older, newer])
  assert.equal(uploaded.status, 204)

  let { response, text } = await readHistory(cookie)
  assert.equal(response.status, 200)
  assert.match(text, /History/)
  assert.match(text, /Kitchen PC/)
  assert.match(text, /HOUSE\\kid/)
  assert.match(text, /Chrome · Default/)
  assert.match(text, /Newer page/)
  assert.match(text, /Older page/)
  assert.match(text, /class="visit-url">https:\/\/newer\.example\//)
  assert.doesNotMatch(text, /<a[^>]+href="https:\/\/newer\.example\//)
  assert.ok(text.indexOf('Newer page') < text.indexOf('Older page'))
})

test('History is an empty list when the household has no Visits', async () => {
  await installTestPersistence()
  let cookie = await createFirstAdmin()

  let { response, text } = await readHistory(cookie)
  assert.equal(response.status, 200)
  assert.match(text, /No Visits yet/)
  assert.doesNotMatch(text, /update the Client/)
})

test('History paginates 50 Visits and puts the page in the URL', async () => {
  await installTestPersistence()
  let cookie = await createFirstAdmin()
  let client = await registerClient('Kitchen PC')
  let visits = []
  for (let index = 0; index < 51; index += 1) {
    visits.push(
      visitPayload({
        title: `Visit ${index}`,
        url: `https://example.com/${index}`,
        visitTime: new Date(Date.now() - (51 - index) * 1000).toISOString(),
      }),
    )
  }

  assert.equal((await postVisits(client, visits)).status, 204)

  let first = await readHistory(cookie)
  assert.match(first.text, /Visit 50/)
  assert.doesNotMatch(first.text, /Visit 0</)
  assert.match(first.text, /href="\/admin\/history\?page=2"/)

  let second = await readHistory(cookie, 2)
  assert.equal(second.response.status, 200)
  assert.match(second.text, /Visit 0/)
  assert.doesNotMatch(second.text, /Visit 50/)
  assert.match(second.text, /Page 2 of 2/)
})

test('unregistering a Client removes its Visits from History', async () => {
  await installTestPersistence()
  let cookie = await createFirstAdmin()
  let client = await registerClient('Kitchen PC')
  assert.equal((await postVisits(client, [visitPayload({ url: 'https://gone.example/' })])).status, 204)

  let deleted = await router.fetch(
    formRequest(
      routes.admin.clients.delete.href({ clientId: client.clientId }),
      {},
      { headers: { cookie } },
    ),
  )
  assert.equal(deleted.status, 302)

  let { text } = await readHistory(cookie)
  assert.doesNotMatch(text, /gone\.example/)
  assert.match(text, /No Visits yet/)
})
