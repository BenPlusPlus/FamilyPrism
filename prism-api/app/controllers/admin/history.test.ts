import assert from 'node:assert/strict'
import test from 'node:test'

import { listHistoryPage } from '../../data/visits.ts'
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

async function readHistory(
  cookie: string,
  query: { browser?: string; client?: string; page?: number; q?: string; user?: string } = {},
) {
  let params = new URLSearchParams()
  if (query.client) {
    params.set('client', query.client)
  }
  if (query.user) {
    params.set('user', query.user)
  }
  if (query.browser) {
    params.set('browser', query.browser)
  }
  if (query.q) {
    params.set('q', query.q)
  }
  if (query.page && query.page > 1) {
    params.set('page', String(query.page))
  }

  let path = routes.admin.history.index.href()
  let search = params.toString()
  let response = await router.fetch(
    jsonRequest(search ? `${path}?${search}` : path, {
      headers: { cookie },
    }),
  )
  return {
    response,
    text: await response.text(),
  }
}

async function readClientDetail(cookie: string, clientId: string) {
  let response = await router.fetch(
    jsonRequest(routes.admin.clients.detail.href({ clientId }), {
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

  let second = await readHistory(cookie, { page: 2 })
  assert.equal(second.response.status, 200)
  assert.match(second.text, /Visit 0/)
  assert.doesNotMatch(second.text, /Visit 50/)
  assert.match(second.text, /Page 2 of 2/)
})

test('History filters, search, and page live in the URL together', async () => {
  await installTestPersistence()
  let cookie = await createFirstAdmin()
  let kitchen = await registerClient('Kitchen PC')
  let den = await registerClient('Den PC')

  assert.equal(
    (
      await postVisits(kitchen, [
        visitPayload({
          browser: 'Chrome',
          title: 'Kitchen Docs',
          url: 'https://docs.example/kitchen',
          visitTime: new Date(Date.now() - 30_000).toISOString(),
          windowsUser: 'HOUSE\\kid',
        }),
        visitPayload({
          browser: 'Firefox',
          title: 'Kitchen News',
          url: 'https://news.example/kitchen',
          visitTime: new Date(Date.now() - 90_000).toISOString(),
          windowsUser: 'HOUSE\\parent',
        }),
      ])
    ).status,
    204,
  )
  assert.equal(
    (
      await postVisits(den, [
        visitPayload({
          browser: 'Chrome',
          title: 'Den Docs',
          url: 'https://docs.example/den',
          visitTime: new Date(Date.now() - 60_000).toISOString(),
          windowsUser: 'HOUSE\\kid',
        }),
      ])
    ).status,
    204,
  )

  let filtered = await readHistory(cookie, { client: kitchen.clientId, q: 'docs' })
  assert.equal(filtered.response.status, 200)
  assert.match(filtered.text, /Kitchen Docs/)
  assert.doesNotMatch(filtered.text, /Kitchen News/)
  assert.doesNotMatch(filtered.text, /Den Docs/)
  assert.match(filtered.text, new RegExp(`name="client"[\\s\\S]*value="${kitchen.clientId}"[\\s\\S]*selected`))
  assert.match(filtered.text, /name="q"[^>]*value="docs"/)
  assert.match(filtered.text, /<option value="Firefox">/)
  assert.match(filtered.text, /<option value="HOUSE\\kid">/)
  assert.match(filtered.text, />Den PC</)

  let byUser = await readHistory(cookie, { user: 'HOUSE\\parent' })
  assert.match(byUser.text, /Kitchen News/)
  assert.doesNotMatch(byUser.text, /Kitchen Docs/)
  assert.doesNotMatch(byUser.text, /Den Docs/)

  let none = await readHistory(cookie, { browser: 'Firefox', q: 'docs' })
  assert.match(none.text, /No Visits match/)
  assert.doesNotMatch(none.text, /Kitchen Docs/)
})

test('History pagination keeps filters in the next page URL', async () => {
  await installTestPersistence()
  let cookie = await createFirstAdmin()
  let kitchen = await registerClient('Kitchen PC')
  let visits = []
  for (let index = 0; index < 51; index += 1) {
    visits.push(
      visitPayload({
        title: `Kitchen ${index}`,
        url: `https://kitchen.example/${index}`,
        visitTime: new Date(Date.now() - (51 - index) * 1000).toISOString(),
      }),
    )
  }

  assert.equal((await postVisits(kitchen, visits)).status, 204)

  let first = await readHistory(cookie, { client: kitchen.clientId, q: 'kitchen.example' })
  assert.match(first.text, /Kitchen 50/)
  assert.doesNotMatch(first.text, /Kitchen 0</)
  assert.match(
    first.text,
    new RegExp(`/admin/history\\?client=${kitchen.clientId}&amp;q=kitchen\\.example&amp;page=2`),
  )

  let second = await readHistory(cookie, {
    client: kitchen.clientId,
    page: 2,
    q: 'kitchen.example',
  })
  assert.match(second.text, /Kitchen 0/)
  assert.doesNotMatch(second.text, /Kitchen 50/)
  assert.match(second.text, /Page 2 of 2/)
})

test('Client detail shows the latest 20 Visits and links to filtered History', async () => {
  await installTestPersistence()
  let cookie = await createFirstAdmin()
  let kitchen = await registerClient('Kitchen PC')
  let den = await registerClient('Den PC')
  let visits = []
  for (let index = 0; index < 21; index += 1) {
    visits.push(
      visitPayload({
        title: `Kitchen ${index}`,
        url: `https://kitchen.example/${index}`,
        visitTime: new Date(Date.now() - (21 - index) * 1000).toISOString(),
      }),
    )
  }

  assert.equal((await postVisits(kitchen, visits)).status, 204)
  assert.equal(
    (await postVisits(den, [visitPayload({ title: 'Den page', url: 'https://den.example/' })])).status,
    204,
  )

  let { response, text } = await readClientDetail(cookie, kitchen.clientId)
  assert.equal(response.status, 200)
  assert.match(text, /Kitchen 20/)
  assert.match(text, /Kitchen 1/)
  assert.doesNotMatch(text, /Kitchen 0</)
  assert.doesNotMatch(text, /Den page/)
  assert.match(text, new RegExp(`/admin/history\\?client=${kitchen.clientId}`))
  assert.match(text, /View in History/)
})

test('History row Delete removes that Visit and stays on the filtered list', async () => {
  await installTestPersistence()
  let cookie = await createFirstAdmin()
  let kitchen = await registerClient('Kitchen PC')
  let den = await registerClient('Den PC')

  assert.equal(
    (
      await postVisits(kitchen, [
        visitPayload({ title: 'Kitchen Docs', url: 'https://docs.example/kitchen' }),
        visitPayload({
          title: 'Kitchen News',
          url: 'https://news.example/kitchen',
          visitTime: new Date(Date.now() - 90_000).toISOString(),
        }),
      ])
    ).status,
    204,
  )
  assert.equal(
    (await postVisits(den, [visitPayload({ title: 'Den Docs', url: 'https://docs.example/den' })])).status,
    204,
  )

  let listed = await listHistoryPage(1, new Date(), { clientId: kitchen.clientId, search: 'docs' })
  let kitchenDocs = listed.visits.find((row) => row.title === 'Kitchen Docs')
  assert.ok(kitchenDocs)

  let history = await readHistory(cookie, { client: kitchen.clientId, q: 'docs' })
  assert.match(
    history.text,
    new RegExp(`action="/admin/history/${kitchenDocs.id}/delete"`),
  )

  let deleted = await router.fetch(
    formRequest(
      routes.admin.history.delete.href({ visitId: kitchenDocs.id }),
      { returnTo: `/admin/history?client=${kitchen.clientId}&q=docs` },
      { headers: { cookie } },
    ),
  )
  assert.equal(deleted.status, 302)
  let deletedLocation = deleted.headers.get('location') ?? ''
  assert.match(deletedLocation, /\/admin\/history\?/)
  assert.match(deletedLocation, new RegExp(`client=${kitchen.clientId}`))
  assert.match(deletedLocation, /q=docs/)
  assert.match(deletedLocation, /notice=Visit/)

  let after = await readHistory(cookie, { client: kitchen.clientId, q: 'docs' })
  assert.doesNotMatch(after.text, /Kitchen Docs/)
  assert.doesNotMatch(after.text, /Kitchen News/)
  assert.match(after.text, /No Visits match/)

  let remaining = await readHistory(cookie)
  assert.match(remaining.text, /Kitchen News/)
  assert.match(remaining.text, /Den Docs/)
})

test('Client danger zone can clear that Client\'s Visits without touching others', async () => {
  await installTestPersistence()
  let cookie = await createFirstAdmin()
  let kitchen = await registerClient('Kitchen PC')
  let den = await registerClient('Den PC')

  assert.equal(
    (await postVisits(kitchen, [visitPayload({ title: 'Kitchen page', url: 'https://kitchen.example/' })])).status,
    204,
  )
  assert.equal(
    (await postVisits(den, [visitPayload({ title: 'Den page', url: 'https://den.example/' })])).status,
    204,
  )

  let detail = await readClientDetail(cookie, kitchen.clientId)
  assert.match(detail.text, /Clear History for Kitchen PC/)
  assert.match(
    detail.text,
    new RegExp(`action="/admin/clients/${kitchen.clientId}/history/clear"`),
  )
  assert.match(detail.text, /New Visits still appear/)

  let cleared = await router.fetch(
    formRequest(routes.admin.clients.clearHistory.href({ clientId: kitchen.clientId }), {}, { headers: { cookie } }),
  )
  assert.equal(cleared.status, 302)
  let clearedLocation = cleared.headers.get('location') ?? ''
  assert.match(clearedLocation, new RegExp(`/admin/clients/${kitchen.clientId}`))
  assert.match(clearedLocation, /notice=Cleared/)

  let kitchenAfter = await readClientDetail(cookie, kitchen.clientId)
  assert.doesNotMatch(kitchenAfter.text, /kitchen\.example/)
  assert.match(kitchenAfter.text, /No Visits yet/)

  let history = await readHistory(cookie)
  assert.doesNotMatch(history.text, /kitchen\.example/)
  assert.match(history.text, /Den page/)

  assert.equal(
    (
      await postVisits(kitchen, [
        visitPayload({ title: 'Kitchen again', url: 'https://kitchen-again.example/' }),
      ])
    ).status,
    204,
  )
  let collected = await readHistory(cookie)
  assert.match(collected.text, /Kitchen again/)
  assert.match(collected.text, /Den page/)
})

test('Client detail History collection is on by default and off keeps existing Visits listed', async () => {
  await installTestPersistence()
  let cookie = await createFirstAdmin()
  let kitchen = await registerClient('Kitchen PC')

  assert.equal(
    (await postVisits(kitchen, [visitPayload({ title: 'Kitchen page', url: 'https://kitchen.example/' })])).status,
    204,
  )

  let before = await readClientDetail(cookie, kitchen.clientId)
  assert.equal(before.response.status, 200)
  assert.match(before.text, /History collection/)
  assert.match(before.text, /Turn off/)
  assert.match(before.text, /name="enabled"[^>]*value="off"/)
  assert.doesNotMatch(before.text, /class="stamp off"/)
  assert.doesNotMatch(before.text, /update required/i)

  let toggled = await router.fetch(
    formRequest(
      routes.admin.clients.historyCollection.href({ clientId: kitchen.clientId }),
      { enabled: 'off' },
      { headers: { cookie } },
    ),
  )
  assert.equal(toggled.status, 302)
  assert.match(toggled.headers.get('location') ?? '', /notice=History\+collection\+is\+off/)

  assert.equal(
    (
      await postVisits(kitchen, [
        visitPayload({
          title: 'After off',
          url: 'https://after-off.example/',
          visitTime: new Date(Date.now() - 10_000).toISOString(),
        }),
      ])
    ).status,
    204,
  )

  let detail = await readClientDetail(cookie, kitchen.clientId)
  assert.match(detail.text, /class="stamp off"/)
  assert.match(detail.text, /Turn on/)
  assert.match(detail.text, /kitchen\.example/)
  assert.doesNotMatch(detail.text, /after-off\.example/)
  assert.doesNotMatch(detail.text, /update required/i)

  let history = await readHistory(cookie, { client: kitchen.clientId })
  assert.match(history.text, /kitchen\.example/)
  assert.doesNotMatch(history.text, /after-off\.example/)
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
