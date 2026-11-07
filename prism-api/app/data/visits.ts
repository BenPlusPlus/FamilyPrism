import { createHash } from 'node:crypto'

import { sql, type Database } from 'remix/data-table'

import { db } from './database.ts'
import { clients, visits } from './schema.ts'
import { generateId } from '../utils/secrets.ts'

const VISIT_RETENTION_DAYS = 30
export const HISTORY_PAGE_SIZE = 50

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

function isRetainedVisit(visitedAt: Date, now: Date) {
  if (visitedAt.getTime() > now.getTime()) {
    return false
  }

  let oldest = now.getTime() - VISIT_RETENTION_DAYS * 24 * 60 * 60 * 1000
  return visitedAt.getTime() >= oldest
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

  for (let visit of batch) {
    let visitedAt = parseVisitTime(visit.visitTime)
    if (!visitedAt || !isRetainedVisit(visitedAt, now)) {
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

export async function listHistoryPage(
  requestedPage: number,
  database: Database = db,
): Promise<HistoryList> {
  let total = await database.count(visits)
  let pageCount = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE))
  let page = Number.isInteger(requestedPage)
    ? Math.min(Math.max(1, requestedPage), pageCount)
    : 1
  let offset = (page - 1) * HISTORY_PAGE_SIZE

  let [rows, allClients] = await Promise.all([
    database.findMany(visits, {
      limit: HISTORY_PAGE_SIZE,
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
