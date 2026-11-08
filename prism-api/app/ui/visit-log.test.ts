import assert from 'node:assert/strict'
import test from 'node:test'

import type { HistoryVisit } from '../data/visits.ts'
import { groupVisitsByDay } from './visit-log.tsx'

function visitAt(visitedAt: string, title = visitedAt): HistoryVisit {
  return {
    browser: 'Chrome',
    browserProfile: 'Default',
    clientId: 'client-1',
    clientName: 'Kitchen PC',
    id: visitedAt,
    title,
    url: 'https://example.com/',
    visitedAt,
    windowsUser: 'HOUSE\\kid',
  }
}

function summarize(days: ReturnType<typeof groupVisitsByDay>) {
  return days.map((day) => ({
    date: day.date,
    key: day.key,
    name: day.name,
    titles: day.visits.map((visit) => visit.title),
  }))
}

// 5:16 PM on Sat Nov 7 in Denver is already 12:16 AM on Sun Nov 8 in UTC.
const DENVER_EVENING = new Date('2026-11-08T00:16:00.000Z')
const VISITS = [
  visitAt('2026-11-07T21:00:00.000Z', 'Sat 2 PM Denver'),
  visitAt('2026-11-07T05:00:00.000Z', 'Fri 10 PM Denver'),
  visitAt('2026-11-04T18:00:00.000Z', 'Wed 11 AM Denver'),
]

test('groupVisitsByDay keeps this evening under Today in the household zone after UTC midnight', () => {
  assert.deepEqual(summarize(groupVisitsByDay(VISITS, DENVER_EVENING, 'America/Denver')), [
    { date: 'Nov 7', key: '2026-11-07', name: 'Today', titles: ['Sat 2 PM Denver'] },
    { date: 'Nov 6', key: '2026-11-06', name: 'Yesterday', titles: ['Fri 10 PM Denver'] },
    { date: 'Nov 4', key: '2026-11-04', name: 'Wednesday', titles: ['Wed 11 AM Denver'] },
  ])
})

test('groupVisitsByDay splits the same Visits on UTC days when the household zone is UTC', () => {
  assert.deepEqual(summarize(groupVisitsByDay(VISITS, DENVER_EVENING, 'UTC')), [
    {
      date: 'Nov 7',
      key: '2026-11-07',
      name: 'Yesterday',
      titles: ['Sat 2 PM Denver', 'Fri 10 PM Denver'],
    },
    { date: 'Nov 4', key: '2026-11-04', name: 'Wednesday', titles: ['Wed 11 AM Denver'] },
  ])
})

test('groupVisitsByDay finds Yesterday across a daylight saving change', () => {
  // US clocks fell back at 2 AM on Sun Nov 1, 2026, so that day had 25 hours in Denver.
  let morningAfter = new Date('2026-11-02T07:30:00.000Z') // 12:30 AM Mon Nov 2 MST
  let days = groupVisitsByDay(
    [
      visitAt('2026-11-02T07:10:00.000Z'), // 12:10 AM Mon Nov 2 MST
      visitAt('2026-11-02T06:50:00.000Z'), // 11:50 PM Sun Nov 1 MST
      visitAt('2026-11-01T06:30:00.000Z'), // 12:30 AM Sun Nov 1 MDT
      visitAt('2026-11-01T05:50:00.000Z'), // 11:50 PM Sat Oct 31 MDT
    ],
    morningAfter,
    'America/Denver',
  )

  assert.deepEqual(
    days.map((day) => [day.key, day.name, day.visits.length]),
    [
      ['2026-11-02', 'Today', 1],
      ['2026-11-01', 'Yesterday', 2],
      ['2026-10-31', 'Saturday', 1],
    ],
  )
})

test('groupVisitsByDay adds the year once the household zone has reached a new year', () => {
  // Still Dec 31 in UTC, but Jan 1 in Auckland.
  let newYearInAuckland = new Date('2026-12-31T12:00:00.000Z')
  let days = groupVisitsByDay(
    [visitAt('2026-12-31T11:30:00.000Z'), visitAt('2026-12-30T09:00:00.000Z')],
    newYearInAuckland,
    'Pacific/Auckland',
  )

  assert.deepEqual(
    days.map((day) => [day.name, day.date]),
    [
      ['Today', 'Jan 1'],
      ['Wednesday', 'Dec 30, 2026'],
    ],
  )
})
