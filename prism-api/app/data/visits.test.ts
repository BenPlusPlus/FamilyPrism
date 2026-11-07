import assert from 'node:assert/strict'
import test from 'node:test'

import { deleteClient, registerClient } from './clients.ts'
import {
  clearClientVisits,
  CLIENT_HISTORY_LIMIT,
  deleteVisit,
  getVisitRetentionDays,
  HISTORY_PAGE_SIZE,
  ingestVisits,
  InvalidVisitRetentionError,
  listHistoryFilterOptions,
  listHistoryPage,
  setVisitRetentionDays,
  type VisitIngestInput,
} from './visits.ts'
import { closeTestPersistence, installTestPersistence } from '../../test/persistence.ts'

test.after(async () => {
  await closeTestPersistence()
})

const NOW = new Date('2026-11-06T12:00:00.000Z')

function visit(overrides: Partial<VisitIngestInput> = {}): VisitIngestInput {
  return {
    browser: 'Chrome',
    browserProfile: 'Default',
    title: 'Example',
    url: 'https://example.com/',
    visitTime: '2026-11-06T11:00:00.000Z',
    windowsUser: 'HOUSE\\kid',
    ...overrides,
  }
}

async function registerPc(name = 'Kitchen PC') {
  return registerClient(name)
}

test('ingestVisits stores a retained Visit and lists it newest first', async () => {
  await installTestPersistence()
  let kitchen = await registerPc()
  let den = await registerPc('Den PC')

  await ingestVisits(
    kitchen.client.id,
    [
      visit({ title: 'Older', visitTime: '2026-11-05T10:00:00.000Z', url: 'https://older.example/' }),
      visit({ title: 'Newer', visitTime: '2026-11-06T11:30:00.000Z', url: 'https://newer.example/' }),
    ],
    NOW,
  )
  await ingestVisits(
    den.client.id,
    [visit({ title: 'Den', visitTime: '2026-11-06T11:15:00.000Z', url: 'https://den.example/' })],
    NOW,
  )

  let page = await listHistoryPage(1, NOW)
  assert.equal(page.total, 3)
  assert.deepEqual(
    page.visits.map((row) => row.title),
    ['Newer', 'Den', 'Older'],
  )
  assert.equal(page.visits[0]?.clientName, 'Kitchen PC')
  assert.equal(page.visits[0]?.windowsUser, 'HOUSE\\kid')
  assert.equal(page.visits[0]?.browser, 'Chrome')
  assert.equal(page.visits[0]?.browserProfile, 'Default')
  assert.equal(page.visits[0]?.url, 'https://newer.example/')
})

test('visit retention defaults to 30 days and accepts 1 through 365', async () => {
  await installTestPersistence()

  assert.equal(await getVisitRetentionDays(), 30)

  await setVisitRetentionDays(1)
  assert.equal(await getVisitRetentionDays(), 1)
  await setVisitRetentionDays(365)
  assert.equal(await getVisitRetentionDays(), 365)
  await setVisitRetentionDays('7')
  assert.equal(await getVisitRetentionDays(), 7)

  await assert.rejects(() => setVisitRetentionDays(0), InvalidVisitRetentionError)
  await assert.rejects(() => setVisitRetentionDays(366), InvalidVisitRetentionError)
  await assert.rejects(() => setVisitRetentionDays(-1), InvalidVisitRetentionError)
  await assert.rejects(() => setVisitRetentionDays(1.5), InvalidVisitRetentionError)
  await assert.rejects(() => setVisitRetentionDays(''), InvalidVisitRetentionError)
  await assert.rejects(() => setVisitRetentionDays('30days'), InvalidVisitRetentionError)
  assert.equal(await getVisitRetentionDays(), 7)
})

test('ingestVisits drops future visit times and visits older than household retention', async () => {
  await installTestPersistence()
  let { client } = await registerPc()

  let result = await ingestVisits(
    client.id,
    [
      visit({ url: 'https://kept.example/', visitTime: '2026-10-07T12:00:00.000Z' }),
      visit({ url: 'https://old.example/', visitTime: '2026-10-07T11:59:59.000Z' }),
      visit({ url: 'https://future.example/', visitTime: '2026-11-06T12:00:00.001Z' }),
    ],
    NOW,
  )

  assert.equal(result.stored, 1)
  let page = await listHistoryPage(1, NOW)
  assert.equal(page.total, 1)
  assert.equal(page.visits[0]?.url, 'https://kept.example/')
})

test('ingestVisits uses the current household retention instead of 30 days', async () => {
  await installTestPersistence()
  let { client } = await registerPc()
  await setVisitRetentionDays(7)

  let result = await ingestVisits(
    client.id,
    [
      visit({ url: 'https://kept.example/', visitTime: '2026-10-30T12:00:00.000Z' }),
      visit({ url: 'https://old.example/', visitTime: '2026-10-30T11:59:59.000Z' }),
    ],
    NOW,
  )

  assert.equal(result.stored, 1)
  let page = await listHistoryPage(1, NOW)
  assert.equal(page.total, 1)
  assert.equal(page.visits[0]?.url, 'https://kept.example/')
})

test('shortening visit retention deletes visits now outside the window', async () => {
  await installTestPersistence()
  let { client } = await registerPc()

  await ingestVisits(
    client.id,
    [
      visit({ url: 'https://recent.example/', visitTime: '2026-11-05T12:00:00.000Z' }),
      visit({ url: 'https://older.example/', visitTime: '2026-10-27T12:00:00.000Z' }),
    ],
    NOW,
  )

  assert.equal((await listHistoryPage(1, NOW)).total, 2)
  await setVisitRetentionDays(7, NOW)

  let page = await listHistoryPage(1, NOW)
  assert.equal(page.total, 1)
  assert.equal(page.visits[0]?.url, 'https://recent.example/')
})

test('listHistoryPage deletes stored visits older than retention', async () => {
  await installTestPersistence()
  let { client } = await registerPc()

  await ingestVisits(
    client.id,
    [visit({ url: 'https://aging.example/', visitTime: '2026-10-08T12:00:00.000Z' })],
    NOW,
  )

  assert.equal((await listHistoryPage(1, NOW)).total, 1)

  let later = new Date('2026-11-08T12:00:00.000Z')
  let page = await listHistoryPage(1, later)
  assert.equal(page.total, 0)
})

test('ingestVisits stores a Visit whose URL is longer than a btree index entry', async () => {
  await installTestPersistence()
  let { client } = await registerPc()
  let url = `https://example.com/search?q=${'a'.repeat(8000)}`

  let result = await ingestVisits(client.id, [visit({ url, title: 'Long' })], NOW)

  assert.equal(result.stored, 1)
  let page = await listHistoryPage(1, NOW)
  assert.equal(page.visits[0]?.url, url)
})

test('ingestVisits stores a duplicate Visit once in a batch and across uploads', async () => {
  await installTestPersistence()
  let { client } = await registerPc()
  let duplicate = visit()

  let first = await ingestVisits(client.id, [duplicate, duplicate], NOW)
  let second = await ingestVisits(client.id, [duplicate], NOW)

  assert.equal(first.stored, 1)
  assert.equal(second.stored, 0)
  assert.equal((await listHistoryPage(1, NOW)).total, 1)
})

test('deleteVisit removes only that Visit', async () => {
  await installTestPersistence()
  let kitchen = await registerPc()

  await ingestVisits(
    kitchen.client.id,
    [
      visit({ title: 'Keep', url: 'https://keep.example/' }),
      visit({ title: 'Drop', url: 'https://drop.example/', visitTime: '2026-11-06T11:30:00.000Z' }),
    ],
    NOW,
  )

  let before = await listHistoryPage(1, NOW)
  let dropped = before.visits.find((row) => row.title === 'Drop')
  assert.ok(dropped)
  assert.equal((await deleteVisit(dropped.id))?.url, 'https://drop.example/')
  assert.equal(await deleteVisit(dropped.id), null)

  let after = await listHistoryPage(1, NOW)
  assert.equal(after.total, 1)
  assert.equal(after.visits[0]?.title, 'Keep')
})

test('clearClientVisits removes only that Client\'s Visits', async () => {
  await installTestPersistence()
  let kitchen = await registerPc()
  let den = await registerPc('Den PC')

  await ingestVisits(kitchen.client.id, [visit({ url: 'https://kitchen.example/' })], NOW)
  await ingestVisits(den.client.id, [visit({ url: 'https://den.example/' })], NOW)

  await clearClientVisits(kitchen.client.id)

  let page = await listHistoryPage(1, NOW)
  assert.equal(page.total, 1)
  assert.equal(page.visits[0]?.clientName, 'Den PC')
  assert.equal(page.visits[0]?.url, 'https://den.example/')

  await ingestVisits(kitchen.client.id, [visit({ url: 'https://kitchen-again.example/' })], NOW)
  let after = await listHistoryPage(1, NOW)
  assert.equal(after.total, 2)
  assert.ok(after.visits.some((row) => row.url === 'https://kitchen-again.example/'))
})

test('unregistering a Client deletes its Visits', async () => {
  await installTestPersistence()
  let kitchen = await registerPc()
  let den = await registerPc('Den PC')

  await ingestVisits(kitchen.client.id, [visit({ url: 'https://kitchen.example/' })], NOW)
  await ingestVisits(den.client.id, [visit({ url: 'https://den.example/' })], NOW)

  let deleted = await deleteClient(kitchen.client.id)
  assert.equal(deleted?.name, 'Kitchen PC')

  let page = await listHistoryPage(1, NOW)
  assert.equal(page.total, 1)
  assert.equal(page.visits[0]?.clientName, 'Den PC')
  assert.equal(page.visits[0]?.url, 'https://den.example/')
})

test('listHistoryPage returns 50 Visits per page', async () => {
  await installTestPersistence()
  let { client } = await registerPc()
  let batch: VisitIngestInput[] = []
  for (let index = 0; index < HISTORY_PAGE_SIZE + 1; index += 1) {
    let second = String(index).padStart(2, '0')
    batch.push(
      visit({
        title: `Visit ${index}`,
        url: `https://example.com/${index}`,
        visitTime: `2026-11-06T11:00:${second}.000Z`,
      }),
    )
  }

  await ingestVisits(client.id, batch, NOW)

  let first = await listHistoryPage(1, NOW)
  let second = await listHistoryPage(2, NOW)
  assert.equal(first.total, 51)
  assert.equal(first.page, 1)
  assert.equal(first.pageCount, 2)
  assert.equal(first.visits.length, 50)
  assert.equal(first.visits[0]?.title, 'Visit 50')
  assert.equal(second.visits.length, 1)
  assert.equal(second.visits[0]?.title, 'Visit 0')
})

test('listHistoryPage filters by Client, Windows user, browser, and search together', async () => {
  await installTestPersistence()
  let kitchen = await registerPc()
  let den = await registerPc('Den PC')

  await ingestVisits(
    kitchen.client.id,
    [
      visit({
        browser: 'Chrome',
        title: 'Kitchen Docs',
        url: 'https://docs.example/kitchen',
        visitTime: '2026-11-06T11:30:00.000Z',
        windowsUser: 'HOUSE\\kid',
      }),
      visit({
        browser: 'Firefox',
        title: 'Kitchen News',
        url: 'https://news.example/kitchen',
        visitTime: '2026-11-06T11:20:00.000Z',
        windowsUser: 'HOUSE\\parent',
      }),
    ],
    NOW,
  )
  await ingestVisits(
    den.client.id,
    [
      visit({
        browser: 'Chrome',
        title: 'Den Docs',
        url: 'https://docs.example/den',
        visitTime: '2026-11-06T11:25:00.000Z',
        windowsUser: 'HOUSE\\kid',
      }),
    ],
    NOW,
  )

  let byClient = await listHistoryPage(1, NOW, { clientId: kitchen.client.id })
  assert.deepEqual(
    byClient.visits.map((row) => row.title),
    ['Kitchen Docs', 'Kitchen News'],
  )

  let byUser = await listHistoryPage(1, NOW, { windowsUser: 'HOUSE\\parent' })
  assert.deepEqual(
    byUser.visits.map((row) => row.title),
    ['Kitchen News'],
  )

  let byBrowser = await listHistoryPage(1, NOW, { browser: 'Firefox' })
  assert.deepEqual(
    byBrowser.visits.map((row) => row.title),
    ['Kitchen News'],
  )

  let byTitle = await listHistoryPage(1, NOW, { search: 'DOCS' })
  assert.deepEqual(
    byTitle.visits.map((row) => row.title),
    ['Kitchen Docs', 'Den Docs'],
  )

  let byUrl = await listHistoryPage(1, NOW, { search: 'news.example' })
  assert.deepEqual(
    byUrl.visits.map((row) => row.title),
    ['Kitchen News'],
  )

  let combined = await listHistoryPage(1, NOW, {
    clientId: kitchen.client.id,
    search: 'docs',
    windowsUser: 'HOUSE\\kid',
  })
  assert.deepEqual(
    combined.visits.map((row) => row.title),
    ['Kitchen Docs'],
  )
  assert.equal(combined.total, 1)
})

test('listHistoryPage search treats % and _ as literal substring characters', async () => {
  await installTestPersistence()
  let { client } = await registerPc()

  await ingestVisits(
    client.id,
    [
      visit({
        title: 'Encoded',
        url: 'https://example.com/a%20b',
        visitTime: '2026-11-06T11:30:00.000Z',
      }),
      visit({
        title: 'Twenty',
        url: 'https://example.com/a20b',
        visitTime: '2026-11-06T11:20:00.000Z',
      }),
      visit({
        title: 'Underscore',
        url: 'https://example.com/a_b',
        visitTime: '2026-11-06T11:10:00.000Z',
      }),
      visit({
        title: 'AxB',
        url: 'https://example.com/axb',
        visitTime: '2026-11-06T11:00:00.000Z',
      }),
    ],
    NOW,
  )

  let encoded = await listHistoryPage(1, NOW, { search: '%20' })
  assert.deepEqual(
    encoded.visits.map((row) => row.title),
    ['Encoded'],
  )

  let underscore = await listHistoryPage(1, NOW, { search: 'a_b' })
  assert.deepEqual(
    underscore.visits.map((row) => row.title),
    ['Underscore'],
  )
})

test('listHistoryFilterOptions lists household Clients and stored Visit users and browsers', async () => {
  await installTestPersistence()
  let kitchen = await registerPc()
  await registerPc('Den PC')

  await ingestVisits(
    kitchen.client.id,
    [
      visit({ browser: 'Edge', windowsUser: 'HOUSE\\kid' }),
      visit({
        browser: 'Chrome',
        url: 'https://other.example/',
        visitTime: '2026-11-06T11:01:00.000Z',
        windowsUser: 'HOUSE\\parent',
      }),
    ],
    NOW,
  )

  let options = await listHistoryFilterOptions(NOW)
  assert.deepEqual(
    options.clients.map((client) => client.name),
    ['Den PC', 'Kitchen PC'],
  )
  assert.deepEqual(options.windowsUsers, ['HOUSE\\kid', 'HOUSE\\parent'])
  assert.deepEqual(options.browsers, ['Chrome', 'Edge'])
})

test('listHistoryPage can return the latest 20 Visits for a Client', async () => {
  await installTestPersistence()
  let kitchen = await registerPc()
  let den = await registerPc('Den PC')
  let batch: VisitIngestInput[] = []
  for (let index = 0; index < CLIENT_HISTORY_LIMIT + 1; index += 1) {
    let second = String(index).padStart(2, '0')
    batch.push(
      visit({
        title: `Visit ${index}`,
        url: `https://example.com/${index}`,
        visitTime: `2026-11-06T11:00:${second}.000Z`,
      }),
    )
  }

  await ingestVisits(kitchen.client.id, batch, NOW)
  await ingestVisits(
    den.client.id,
    [visit({ title: 'Den', url: 'https://den.example/', visitTime: '2026-11-06T11:59:00.000Z' })],
    NOW,
  )

  let page = await listHistoryPage(1, NOW, {
    clientId: kitchen.client.id,
    pageSize: CLIENT_HISTORY_LIMIT,
  })
  assert.equal(page.total, 21)
  assert.equal(page.visits.length, 20)
  assert.equal(page.visits[0]?.title, 'Visit 20')
  assert.equal(page.visits[19]?.title, 'Visit 1')
  assert.equal(
    page.visits.some((row) => row.title === 'Den' || row.title === 'Visit 0'),
    false,
  )
})
