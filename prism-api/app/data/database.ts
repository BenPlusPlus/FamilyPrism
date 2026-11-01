import { createPostgresDatabase } from 'remix/data-table/postgres'
import { Pool } from 'pg'

import { getEnv } from '../config/env.ts'

let env = getEnv()

export const pool = new Pool({
  connectionString: env.databaseUrl,
})

export const db = createPostgresDatabase(pool, {
  now: () => new Date(),
})

