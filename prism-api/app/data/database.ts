import type { Database } from 'remix/data-table'
import { createPostgresDatabase } from 'remix/data-table/postgres'
import { Pool } from 'pg'

import { getEnv } from '../config/env.ts'

const isTest = process.env.NODE_ENV === 'test'

export const pool = isTest
  ? (undefined as unknown as Pool)
  : new Pool({
      connectionString: getEnv().databaseUrl,
    })

export let db: Database = isTest
  ? (undefined as unknown as Database)
  : createPostgresDatabase(pool, {
      now: () => new Date(),
    })

export function replaceDatabase(database: Database) {
  db = database
}

