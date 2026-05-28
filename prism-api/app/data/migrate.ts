import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { getMigrations } from 'better-auth/db/migration'
import { createMigrationRunner } from 'remix/data-table/migrations'
import { loadMigrations } from 'remix/data-table/migrations/node'

import { prismAuth } from './auth.ts'
import { db } from './database.ts'

let migrationsPromise: Promise<void> | null = null

async function runDatabaseMigrations() {
  let authMigrations = await getMigrations(prismAuth.options)
  await authMigrations.runMigrations()

  let appMigrations = await loadMigrations(path.resolve(process.cwd(), 'db', 'migrations'))
  let runner = createMigrationRunner(db.adapter, appMigrations)
  await runner.up()
}

export function ensureDatabaseReady() {
  migrationsPromise ??= runDatabaseMigrations()
  return migrationsPromise
}

let currentFilePath = fileURLToPath(import.meta.url)
let entryPointPath = process.argv[1] ? path.resolve(process.argv[1]) : null

if (entryPointPath && currentFilePath === entryPointPath) {
  await ensureDatabaseReady()
}

