import type { Database } from 'remix/data-table'

import { db } from './database.ts'
import { householdSettings } from './schema.ts'
import { canonicalTimeZone, DEFAULT_TIME_ZONE } from '../utils/time-zone.ts'

export const HOUSEHOLD_SETTINGS_ID = 'household'

export class InvalidTimeZoneError extends Error {
  constructor() {
    super('Choose a time zone from the list.')
  }
}

export async function getHouseholdSettings(database: Database = db) {
  let row = await database.find(householdSettings, HOUSEHOLD_SETTINGS_ID)
  if (!row) {
    throw new Error('Household settings are missing.')
  }

  return row
}

/** The household's IANA time zone. Falls back to UTC if the runtime no longer knows the stored name. */
export async function getHouseholdTimeZone(database: Database = db) {
  let row = await getHouseholdSettings(database)
  return canonicalTimeZone(row.time_zone) ?? DEFAULT_TIME_ZONE
}

export async function setHouseholdTimeZone(value: unknown, database: Database = db) {
  let timeZone = canonicalTimeZone(value)
  if (!timeZone) {
    throw new InvalidTimeZoneError()
  }

  await database.update(householdSettings, HOUSEHOLD_SETTINGS_ID, { time_zone: timeZone })
  return timeZone
}
