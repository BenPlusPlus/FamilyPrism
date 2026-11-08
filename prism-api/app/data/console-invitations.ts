import { createHash } from 'node:crypto'

import type { Database, TableRow } from 'remix/data-table'

import { prismAuth } from './auth.ts'
import type { ConsoleRole } from './console-accounts.ts'
import { db } from './database.ts'
import { consoleAccounts, consoleInvitations } from './schema.ts'
import { generateId, generateOpaqueSecret } from '../utils/secrets.ts'

export const CONSOLE_INVITATION_DAYS = 7

export type ConsoleInvitationRow = TableRow<typeof consoleInvitations>

export class ConsoleEmailTakenError extends Error {
  constructor() {
    super('That email already belongs to a console account.')
  }
}

function hashInvitationToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function isExpired(invitation: ConsoleInvitationRow, now: Date) {
  return Date.parse(invitation.expires_at) <= now.getTime()
}

async function emailHasConsoleAccount(email: string, database: Database) {
  let auth = await prismAuth.$context
  let existing = await auth.internalAdapter.findUserByEmail(email)
  return existing ? (await database.find(consoleAccounts, existing.user.id)) !== null : false
}

/**
 * One pending invitation per email: inviting the same email again replaces the
 * old link. Only the token hash is stored, so the link can be shown once.
 */
export async function createConsoleInvitation(
  input: {
    email: string
    invitedByUserId: string
    name: string
    now?: Date
    role: ConsoleRole
  },
  database: Database = db,
) {
  let email = normalizeEmail(input.email)
  if (await emailHasConsoleAccount(email, database)) {
    throw new ConsoleEmailTakenError()
  }

  let now = input.now ?? new Date()
  let token = generateOpaqueSecret(32)
  let invitation = await database.transaction(async (transaction) => {
    await transaction.deleteMany(consoleInvitations, { where: { email } })
    return transaction.create(
      consoleInvitations,
      {
        email,
        expires_at: new Date(
          now.getTime() + CONSOLE_INVITATION_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString(),
        id: generateId(),
        invited_by_user_id: input.invitedByUserId,
        name: input.name.trim(),
        role: input.role,
        token_hash: hashInvitationToken(token),
      },
      { returnRow: true },
    )
  })

  return { invitation, token }
}

export async function findConsoleInvitation(
  token: string,
  now: Date = new Date(),
  database: Database = db,
) {
  let invitation = await database.findOne(consoleInvitations, {
    where: { token_hash: hashInvitationToken(token) },
  })

  return invitation && !isExpired(invitation, now) ? invitation : null
}

export async function listPendingConsoleInvitations(
  now: Date = new Date(),
  database: Database = db,
) {
  let invitations = await database.findMany(consoleInvitations, {
    orderBy: ['expires_at', 'asc'],
  })

  return invitations.filter((invitation) => !isExpired(invitation, now))
}

export async function revokeConsoleInvitation(id: string, database: Database = db) {
  return database.delete(consoleInvitations, id)
}

/**
 * A sign-in with this email but no console account can only be left over from
 * an interrupted removal or invite. It has no access, so it is safe to drop
 * before the invitee creates theirs.
 */
export async function releaseOrphanedSignIn(email: string, database: Database = db) {
  let auth = await prismAuth.$context
  let existing = await auth.internalAdapter.findUserByEmail(normalizeEmail(email))
  if (!existing) {
    return true
  }

  if ((await database.find(consoleAccounts, existing.user.id)) !== null) {
    return false
  }

  await auth.internalAdapter.deleteUser(existing.user.id)
  return true
}

/** Uses the invitation up and grants its role. Null if it was already used or revoked. */
export async function claimConsoleInvitation(
  invitationId: string,
  userId: string,
  now: Date = new Date(),
  database: Database = db,
) {
  return database.transaction(async (transaction) => {
    let invitation = await transaction.find(consoleInvitations, invitationId)
    if (!invitation || isExpired(invitation, now)) {
      return null
    }

    if (!(await transaction.delete(consoleInvitations, invitationId))) {
      return null
    }

    await transaction.create(consoleAccounts, { role: invitation.role, user_id: userId })
    return invitation.role
  })
}
