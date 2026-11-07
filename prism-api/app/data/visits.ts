import { createHash } from 'node:crypto'

import { sql, type Database, type SingleTableWhere } from 'remix/data-table'
import { and, ilike, lt, or } from 'remix/data-table/operators'

import { db } from './database.ts'
import { clients, householdSettings, visits } from './schema.ts'
import { generateId } from '../utils/secrets.ts'

const HOUSEHOLD_SETTINGS_ID = 'household'

export const MIN_VISIT_RETENTION_DAYS = 1
export const MAX_VISIT_RETENTION_DAYS = 365
export const HISTORY_PAGE_SIZE = 50
export const CLIENT_HISTORY_LIMIT = 20

export class InvalidVisitRetentionError extends Error {
  constructor() {
    super('Visit retention must be a whole number from 1 to 365 days.')
  }
}

export const VISIT_BROWSERS = ['Chrome', 'Edge', 'Firefox'] as const
export type VisitBrowser = (typeof VISIT_BROWSERS)[number]

export type VisitIngestInput = {
  browser: VisitBrowser
  browserProfile: string
  title: string
  url: string
  visitTime: string
  windowsUser: string
}

export type HistoryVisit = {
  browser: VisitBrowser
  browserProfile: string
  clientName: string
  id: string
  title: string
  url: string
  visitedAt: string
  windowsUser: string
}

export type HistoryList = {
  page: number
  pageCount: number
  total: number
  visits: HistoryVisit[]
}

function parseVisitTime(value: string) {
  let visitedAt = new Date(value)
  return Number.isNaN(visitedAt.getTime()) ? null : visitedAt
}

function parseVisitRetentionDays(value: unknown) {
  let raw =
    typeof value === 'string'
      ? value.trim()
      : typeof value === 'number' && Number.isInteger(value)
        ? String(value)
        : ''
  if (!/^[0-9]+$/.test(raw)) {
    throw new InvalidVisitRetentionError()
  }

  let days = Number.parseInt(raw, 10)
  if (days < MIN_VISIT_RETENTION_DAYS || days > MAX_VISIT_RETENTION_DAYS) {
    throw new InvalidVisitRetentionError()
  }

  return days
}

function visitRetentionCutoff(now: Date, retentionDays: number) {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000)
}

function isRetainedVisit(visitedAt: Date, now: Date, retentionDays: number) {
  if (visitedAt.getTime() > now.getTime()) {
    return false
  }

  return visitedAt.getTime() >= visitRetentionCutoff(now, retentionDays).getTime()
}

export async function getVisitRetentionDays(database: Database = db) {
  let row = await database.find(householdSettings, HOUSEHOLD_SETTINGS_ID)
  if (!row) {
    throw new Error('Household settings are missing.')
  }

  return row.visit_retention_days
}

async function purgeExpiredVisits(
  now: Date,
  retentionDays: number,
  database: Database,
) {
  await database.deleteMany(visits, {
    where: lt('visited_at', visitRetentionCutoff(now, retentionDays).toISOString()),
  })
}

export async function setVisitRetentionDays(
  value: unknown,
  now: Date = new Date(),
  database: Database = db,
) {
  let visitRetentionDays = parseVisitRetentionDays(value)

  await database.transaction(async (transaction) => {
    await transaction.update(householdSettings, HOUSEHOLD_SETTINGS_ID, {
      visit_retention_days: visitRetentionDays,
    })
    await purgeExpiredVisits(now, visitRetentionDays, transaction)
  })

  return visitRetentionDays
}

function hashUrl(url: string) {
  return createHash('sha256').update(url).digest('hex')
}

function duplicateKey(input: {
  browser: string
  browserProfile: string
  clientId: string
  url: string
  visitedAt: string
  windowsUser: string
}) {
  return [
    input.clientId,
    input.windowsUser,
    input.browser,
    input.browserProfile,
    input.visitedAt,
    input.url,
  ].join('\0')
}

export async function ingestVisits(
  clientId: string,
  batch: VisitIngestInput[],
  now: Date = new Date(),
  database: Database = db,
) {
  let uniqueByKey = new Map<
    string,
    {
      browser: VisitBrowser
      browserProfile: string
      title: string
      url: string
      visitedAt: string
      windowsUser: string
    }
  >()

  let retentionDays = await getVisitRetentionDays(database)

  for (let visit of batch) {
    let visitedAt = parseVisitTime(visit.visitTime)
    if (!visitedAt || !isRetainedVisit(visitedAt, now, retentionDays)) {
      continue
    }

    let row = {
      browser: visit.browser,
      browserProfile: visit.browserProfile,
      title: visit.title,
      url: visit.url,
      visitedAt: visitedAt.toISOString(),
      windowsUser: visit.windowsUser,
    }
    uniqueByKey.set(
      duplicateKey({
        browser: row.browser,
        browserProfile: row.browserProfile,
        clientId,
        url: row.url,
        visitedAt: row.visitedAt,
        windowsUser: row.windowsUser,
      }),
      row,
    )
  }

  await purgeExpiredVisits(now, retentionDays, database)

  if (uniqueByKey.size === 0) {
    return { stored: 0 }
  }

  return database.transaction(async (transaction) => {
    let stored = 0

    for (let visit of uniqueByKey.values()) {
      let result = await transaction.exec(sql`
        insert into visits (
          id, client_id, windows_user, browser, browser_profile, url, url_hash, title, visited_at
        ) values (
          ${generateId()},
          ${clientId},
          ${visit.windowsUser},
          ${visit.browser},
          ${visit.browserProfile},
          ${visit.url},
          ${hashUrl(visit.url)},
          ${visit.title},
          ${visit.visitedAt}
        )
        on conflict (client_id, windows_user, browser, browser_profile, visited_at, url_hash)
        do nothing
      `)
      stored += result.affectedRows ?? 0
    }

    return { stored }
  })
}

function visitWhere(filter: {
  browser?: string
  clientId?: string
  search?: string
  windowsUser?: string
}): SingleTableWhere<typeof visits> | undefined {
  let clauses: SingleTableWhere<typeof visits>[] = []
  if (filter.clientId) {
    clauses.push({ client_id: filter.clientId })
  }
  if (filter.windowsUser) {
    clauses.push({ windows_user: filter.windowsUser })
  }
  if (filter.browser) {
    clauses.push({ browser: filter.browser })
  }
  if (filter.search) {
    let pattern = `%${filter.search}%`
    clauses.push(or(ilike('url', pattern), ilike('title', pattern)))
  }
  if (clauses.length === 0) {
    return undefined
  }
  if (clauses.length === 1) {
    return clauses[0]
  }
  return and(...clauses)
}

export async function listHistoryFilterOptions(
  now: Date = new Date(),
  database: Database = db,
) {
  await purgeExpiredVisits(now, await getVisitRetentionDays(database), database)

  let [householdClients, userRows, browserRows] = await Promise.all([
    database.findMany(clients, { orderBy: ['name', 'asc'] }),
    database.query(visits).select('windows_user').distinct().orderBy('windows_user', 'asc').all(),
    database.query(visits).select('browser').distinct().all(),
  ])

  let seenBrowsers = new Set(browserRows.map((row) => row.browser))

  return {
    browsers: VISIT_BROWSERS.filter((browser) => seenBrowsers.has(browser)),
    clients: householdClients.map((client) => ({ id: client.id, name: client.name })),
    windowsUsers: userRows.map((row) => row.windows_user),
  }
}

export async function listHistoryPage(
  requestedPage: number,
  now: Date = new Date(),
  options: {
    browser?: string
    clientId?: string
    database?: Database
    pageSize?: number
    search?: string
    windowsUser?: string
  } = {},
): Promise<HistoryList> {
  let database = options.database ?? db
  let pageSize = HISTORY_PAGE_SIZE
  if (typeof options.pageSize === 'number' && Number.isInteger(options.pageSize) && options.pageSize > 0) {
    pageSize = options.pageSize
  }

  await purgeExpiredVisits(now, await getVisitRetentionDays(database), database)

  let where = visitWhere(options)
  let total = await database.count(visits, where ? { where } : {})
  let pageCount = Math.max(1, Math.ceil(total / pageSize))
  let page = Number.isInteger(requestedPage)
    ? Math.min(Math.max(1, requestedPage), pageCount)
    : 1
  let offset = (page - 1) * pageSize

  let [rows, allClients] = await Promise.all([
    database.findMany(visits, {
      ...(where ? { where } : {}),
      limit: pageSize,
      offset,
      orderBy: [
        ['visited_at', 'desc'],
        ['id', 'desc'],
      ],
    }),
    database.findMany(clients),
  ])

  let namesById = new Map(allClients.map((client) => [client.id, client.name]))

  return {
    page,
    pageCount,
    total,
    visits: rows.map((row) => ({
      browser: row.browser as VisitBrowser,
      browserProfile: row.browser_profile,
      clientName: namesById.get(row.client_id) ?? row.client_id,
      id: row.id,
      title: row.title,
      url: row.url,
      visitedAt: row.visited_at,
      windowsUser: row.windows_user,
    })),
  }
}
