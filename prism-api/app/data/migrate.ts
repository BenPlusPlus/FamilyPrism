import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { getMigrations } from 'better-auth/db/migration'
import { loadMigrations } from 'remix/data-table/migrations/node'
import type { MigrationDescriptor } from 'remix/data-table/migrations'

import { prismAuth } from './auth.ts'
import { db, pool } from './database.ts'

let migrationsPromise: Promise<void> | null = null

function normalizeSql(sql: string) {
  return sql.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

function sha256(text: string) {
  return createHash('sha256').update(text).digest('hex')
}

function withNormalizedLineEndings(migrations: MigrationDescriptor[]) {
  return migrations.map((migration) => ({
    ...migration,
    up: normalizeSql(migration.up),
    down: migration.down === undefined ? undefined : normalizeSql(migration.down),
  }))
}

function isUndefinedTable(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '42P01'
  )
}

/**
 * Remix journals SHA-256 of raw up.sql. Windows autocrlf checkouts add CR
 * bytes, so a previously applied LF (or CRLF) script looks drifted.
 * Rewrite journal hashes that differ only by CRLF vs LF.
 */
async function repairLineEndingChecksums(migrations: MigrationDescriptor[]) {
  let result

  try {
    result = await pool.query<{ id: string; checksum: string }>(
      'select id, checksum from data_table_migrations',
    )
  } catch (error) {
    if (isUndefinedTable(error)) {
      return
    }

    throw error
  }

  let byId = new Map(migrations.map((migration) => [migration.id, migration]))

  for (let row of result.rows) {
    let migration = byId.get(row.id)

    if (!migration) {
      continue
    }

    let lfChecksum = sha256(migration.up)

    if (row.checksum === lfChecksum) {
      continue
    }

    let crlfChecksum = sha256(migration.up.replaceAll('\n', '\r\n'))

    if (row.checksum === crlfChecksum) {
      await pool.query('update data_table_migrations set checksum = $1 where id = $2', [
        lfChecksum,
        row.id,
      ])
    }
  }
}

async function runDatabaseMigrations() {
  let authMigrations = await getMigrations(prismAuth.options)
  await authMigrations.runMigrations()

  let appMigrations = withNormalizedLineEndings(
    await loadMigrations(path.resolve(process.cwd(), 'db', 'migrations')),
  )
  await repairLineEndingChecksums(appMigrations)
  await db.migrate(appMigrations)
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

