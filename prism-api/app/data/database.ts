import { createDatabase } from 'remix/data-table'
import { createPostgresDatabaseAdapter } from 'remix/data-table-postgres'
import { Pool } from 'pg'

import { getEnv } from '../config/env.ts'

let env = getEnv()

export const pool = new Pool({
  connectionString: env.databaseUrl,
})

let adapter = createPostgresDatabaseAdapter(pool)

export const db = createDatabase(adapter, {
  now: () => new Date(),
})

