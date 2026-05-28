import type { Database } from 'remix/data-table'

import { db } from './database.ts'
import { adminUsers } from './schema.ts'

export async function adminExists(database: Database = db) {
  return (await database.count(adminUsers)) > 0
}

export async function isAdminUser(userId: string, database: Database = db) {
  return (await database.find(adminUsers, userId)) !== null
}

export async function bootstrapFirstAdmin(userId: string, database: Database = db) {
  return database.transaction(async (transaction) => {
    if ((await transaction.count(adminUsers)) > 0) {
      return false
    }

    await transaction.create(adminUsers, { user_id: userId })
    return true
  })
}

