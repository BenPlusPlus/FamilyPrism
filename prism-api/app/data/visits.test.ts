import assert from 'node:assert/strict'
import test from 'node:test'

import { deleteClient, registerClient } from './clients.ts'
import {
  HISTORY_PAGE_SIZE,
  ingestVisits,
  listHistoryPage,
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

  let page = await listHistoryPage(1)
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

test('ingestVisits drops future visit times and visits older than 30 days', async () => {
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
  let page = await listHistoryPage(1)
  assert.equal(page.total, 1)
  assert.equal(page.visits[0]?.url, 'https://kept.example/')
})

test('ingestVisits stores a Visit whose URL is longer than a btree index entry', async () => {
  await installTestPersistence()
  let { client } = await registerPc()
  let url = `https://example.com/search?q=${'a'.repeat(8000)}`

  let result = await ingestVisits(client.id, [visit({ url, title: 'Long' })], NOW)

  assert.equal(result.stored, 1)
  let page = await listHistoryPage(1)
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
  assert.equal((await listHistoryPage(1)).total, 1)
})

test('unregistering a Client deletes its Visits', async () => {
  await installTestPersistence()
  let kitchen = await registerPc()
  let den = await registerPc('Den PC')

  await ingestVisits(kitchen.client.id, [visit({ url: 'https://kitchen.example/' })], NOW)
  await ingestVisits(den.client.id, [visit({ url: 'https://den.example/' })], NOW)

  let deleted = await deleteClient(kitchen.client.id)
  assert.equal(deleted?.name, 'Kitchen PC')

  let page = await listHistoryPage(1)
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

  let first = await listHistoryPage(1)
  let second = await listHistoryPage(2)
  assert.equal(first.total, 51)
  assert.equal(first.page, 1)
  assert.equal(first.pageCount, 2)
  assert.equal(first.visits.length, 50)
  assert.equal(first.visits[0]?.title, 'Visit 50')
  assert.equal(second.visits.length, 1)
  assert.equal(second.visits[0]?.title, 'Visit 0')
})
