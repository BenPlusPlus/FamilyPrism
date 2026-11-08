import type { Database } from 'remix/data-table'

import { prismAuth } from './auth.ts'
import { db } from './database.ts'
import { CONSOLE_ROLES, consoleAccounts } from './schema.ts'

export { CONSOLE_ROLES }
export type ConsoleRole = (typeof CONSOLE_ROLES)[number]

export const CONSOLE_ROLE_LABEL: Record<ConsoleRole, string> = {
  admin: 'Admin',
  parent: 'Parent',
}

export function parseConsoleRole(value: unknown): ConsoleRole | null {
  return CONSOLE_ROLES.includes(value as ConsoleRole) ? (value as ConsoleRole) : null
}

export class LastConsoleAdminError extends Error {
  constructor() {
    super('The console needs at least one admin. Make someone else an admin first.')
  }
}

export interface ConsoleAccountView {
  email: string
  name: string
  role: ConsoleRole
  userId: string
}

export async function consoleAccountExists(database: Database = db) {
  return (await database.count(consoleAccounts)) > 0
}

export async function getConsoleRole(
  userId: string,
  database: Database = db,
): Promise<ConsoleRole | null> {
  return (await database.find(consoleAccounts, userId))?.role ?? null
}

export async function bootstrapFirstAdmin(userId: string, database: Database = db) {
  return database.transaction(async (transaction) => {
    if ((await transaction.count(consoleAccounts)) > 0) {
      return false
    }

    await transaction.create(consoleAccounts, { role: 'admin', user_id: userId })
    return true
  })
}

/** Names and emails live with Better Auth; roles live here. */
export async function listConsoleAccounts(database: Database = db): Promise<ConsoleAccountView[]> {
  let rows = await database.findMany(consoleAccounts)
  let auth = await prismAuth.$context
  let accounts = await Promise.all(
    rows.map(async (row) => {
      let user = await auth.internalAdapter.findUserById(row.user_id)
      return user
        ? {
            email: user.email,
            name: user.name,
            role: row.role,
            userId: row.user_id,
          }
        : null
    }),
  )

  return accounts
    .filter((account) => account !== null)
    .sort((left, right) => left.name.localeCompare(right.name))
}

async function assertAnotherAdminRemains(
  transaction: Database,
  userId: string,
) {
  let account = await transaction.find(consoleAccounts, userId)
  if (account?.role !== 'admin') {
    return account
  }

  let admins = await transaction.count(consoleAccounts, { where: { role: 'admin' } })
  if (admins <= 1) {
    throw new LastConsoleAdminError()
  }

  return account
}

export async function setConsoleRole(
  userId: string,
  role: ConsoleRole,
  database: Database = db,
) {
  return database.transaction(async (transaction) => {
    let account =
      role === 'admin'
        ? await transaction.find(consoleAccounts, userId)
        : await assertAnotherAdminRemains(transaction, userId)
    if (!account) {
      return null
    }

    return transaction.update(consoleAccounts, userId, { role })
  })
}

/** Removes console access and the sign-in behind it. Messages they sent stay. */
export async function removeConsoleAccount(userId: string, database: Database = db) {
  let removed = await database.transaction(async (transaction) => {
    let account = await assertAnotherAdminRemains(transaction, userId)
    if (!account) {
      return false
    }

    return transaction.delete(consoleAccounts, userId)
  })

  if (removed) {
    let auth = await prismAuth.$context
    await auth.internalAdapter.deleteUser(userId)
  }

  return removed
}
