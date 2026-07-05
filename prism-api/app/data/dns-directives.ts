import type { Database, TableRow } from 'remix/data-table'

import { connectionRegistry } from '../realtime/registry.ts'
import { db } from './database.ts'
import { clientDnsStates, clients, pendingDnsDirectives } from './schema.ts'
import { generateId } from '../utils/secrets.ts'

export class DnsDirectiveTargetNotFoundError extends Error {
  constructor() {
    super('Client not found.')
  }
}

export type DnsDirectiveKind = 'profile' | 'reset'
export type DnsDirectiveStatus = 'pending' | 'delivered' | 'applied' | 'failed'
export type ClientDnsStateRow = TableRow<typeof clientDnsStates>

export interface DnsDirectiveSnapshot {
  commandId: string
  kind: DnsDirectiveKind
  profileName: string | null
  primaryIp: string | null
  secondaryIp: string | null
}

function toPayload(snapshot: DnsDirectiveSnapshot) {
  return {
    commandId: snapshot.commandId,
    primaryIp: snapshot.primaryIp,
    profileName: snapshot.profileName,
    resetToDhcp: snapshot.kind === 'reset',
    secondaryIp: snapshot.secondaryIp,
    type: 'apply-dns' as const,
  }
}

async function replaceLatestState(
  transaction: Database,
  clientId: string,
  snapshot: DnsDirectiveSnapshot,
  status: DnsDirectiveStatus,
) {
  let now = new Date().toISOString()

  await transaction.deleteMany(clientDnsStates, {
    where: { client_id: clientId },
  })
  await transaction.create(clientDnsStates, {
    client_id: clientId,
    command_id: snapshot.commandId,
    directive_kind: snapshot.kind,
    error: null,
    issued_at: now,
    profile_name: snapshot.profileName,
    primary_ip: snapshot.primaryIp,
    secondary_ip: snapshot.secondaryIp,
    status,
  })
}

async function replacePendingDirective(
  transaction: Database,
  clientId: string,
  snapshot: DnsDirectiveSnapshot,
) {
  await transaction.deleteMany(pendingDnsDirectives, {
    where: { client_id: clientId },
  })
  await transaction.create(pendingDnsDirectives, {
    client_id: clientId,
    command_id: snapshot.commandId,
    directive_kind: snapshot.kind,
    profile_name: snapshot.profileName,
    primary_ip: snapshot.primaryIp,
    secondary_ip: snapshot.secondaryIp,
  })
}

export async function issueDnsDirective(
  input: {
    clientId: string
    kind: DnsDirectiveKind
    profileName?: string | null
    primaryIp?: string | null
    secondaryIp?: string | null
  },
  database: Database = db,
) {
  let snapshot: DnsDirectiveSnapshot = {
    commandId: generateId(),
    kind: input.kind,
    primaryIp: input.kind === 'profile' ? input.primaryIp ?? null : null,
    profileName: input.kind === 'profile' ? input.profileName ?? null : null,
    secondaryIp: input.kind === 'profile' ? input.secondaryIp ?? null : null,
  }

  return database.transaction(async (transaction) => {
    let client = await transaction.find(clients, input.clientId)
    if (!client) {
      throw new DnsDirectiveTargetNotFoundError()
    }

    let delivered = connectionRegistry.sendApplyDnsCommand(input.clientId, toPayload(snapshot))

    await replaceLatestState(
      transaction,
      input.clientId,
      snapshot,
      delivered ? 'delivered' : 'pending',
    )

    if (delivered) {
      await transaction.deleteMany(pendingDnsDirectives, {
        where: { client_id: input.clientId },
      })
    } else {
      await replacePendingDirective(transaction, input.clientId, snapshot)
    }

    return {
      delivered,
      snapshot,
    }
  })
}

export async function flushPendingDnsDirective(clientId: string, database: Database = db) {
  return database.transaction(async (transaction) => {
    let pendingDirective = await transaction.find(pendingDnsDirectives, clientId)
    if (!pendingDirective) {
      return false
    }

    let snapshot: DnsDirectiveSnapshot = {
      commandId: pendingDirective.command_id,
      kind: pendingDirective.directive_kind as DnsDirectiveKind,
      primaryIp: pendingDirective.primary_ip,
      profileName: pendingDirective.profile_name,
      secondaryIp: pendingDirective.secondary_ip,
    }

    if (!connectionRegistry.sendApplyDnsCommand(clientId, toPayload(snapshot))) {
      return false
    }

    await transaction.deleteMany(pendingDnsDirectives, {
      where: { client_id: clientId },
    })
    await transaction.update(clientDnsStates, clientId, {
      status: 'delivered',
    })

    return true
  })
}

export async function recordDnsDirectiveResult(
  input: {
    clientId: string
    commandId: string
    status: Extract<DnsDirectiveStatus, 'applied' | 'failed'>
    error?: string | null
  },
  database: Database = db,
) {
  let state = await database.find(clientDnsStates, input.clientId)
  if (!state || state.command_id !== input.commandId) {
    return null
  }

  await database.update(clientDnsStates, input.clientId, {
    completed_at: new Date().toISOString(),
    error: input.status === 'failed' ? input.error?.trim() || 'DNS directive failed.' : null,
    status: input.status,
  })

  return database.find(clientDnsStates, input.clientId)
}

export async function getLatestDnsState(clientId: string, database: Database = db) {
  return database.find(clientDnsStates, clientId)
}
