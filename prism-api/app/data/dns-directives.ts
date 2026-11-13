import type { Database, TableRow } from 'remix/data-table'

import { connectionRegistry } from '../realtime/registry.ts'
import { db } from './database.ts'
import {
  addOverlayMinutes,
  captureStandingSnapshot,
  isDnsOverlayActive,
  overlayDeadlineIso,
  standingColumns,
  type DnsOverlayPresetMinutes,
  type DnsStandingSnapshot,
} from './dns-overlay.ts'
import { clientDnsStates, clients, pendingDnsDirectives } from './schema.ts'
import { generateId } from '../utils/secrets.ts'

export class DnsDirectiveTargetNotFoundError extends Error {
  constructor() {
    super('Client not found.')
  }
}

export class DnsOverlayNotActiveError extends Error {
  constructor() {
    super('This PC has no time limit running.')
  }
}

/** 'block' is the built-in No internet profile. */
export type DnsDirectiveKind = 'profile' | 'reset' | 'block'
export type DnsDirectiveStatus = 'pending' | 'delivered' | 'applied' | 'failed'
export type ClientDnsStateRow = TableRow<typeof clientDnsStates>

export interface DnsDirectiveSnapshot {
  commandId: string
  expiresAt: string | null
  kind: DnsDirectiveKind
  profileName: string | null
  primaryIp: string | null
  restoreCommandId: string | null
  secondaryIp: string | null
  standing: DnsStandingSnapshot | null
}

function standingPayload(standing: DnsStandingSnapshot | null) {
  if (!standing) {
    return null
  }

  return {
    blockInternet: standing.kind === 'block',
    primaryIp: standing.primaryIp,
    profileName: standing.profileName,
    resetToDhcp: standing.kind === 'reset',
    secondaryIp: standing.secondaryIp,
  }
}

function toPayload(snapshot: DnsDirectiveSnapshot) {
  let payload = {
    blockInternet: snapshot.kind === 'block',
    commandId: snapshot.commandId,
    primaryIp: snapshot.primaryIp,
    profileName: snapshot.profileName,
    resetToDhcp: snapshot.kind === 'reset',
    secondaryIp: snapshot.secondaryIp,
    type: 'apply-dns' as const,
  }

  if (!snapshot.expiresAt) {
    return payload
  }

  return {
    ...payload,
    expiresAt: snapshot.expiresAt,
    restoreCommandId: snapshot.restoreCommandId,
    standing: standingPayload(snapshot.standing),
  }
}

function snapshotFromState(state: ClientDnsStateRow): DnsDirectiveSnapshot {
  return {
    commandId: state.command_id,
    expiresAt: state.expires_at,
    kind: state.directive_kind as DnsDirectiveKind,
    primaryIp: state.primary_ip,
    profileName: state.profile_name,
    restoreCommandId: state.restore_command_id,
    secondaryIp: state.secondary_ip,
    standing: captureStandingSnapshot(state),
  }
}

function snapshotFromPending(
  pending: TableRow<typeof pendingDnsDirectives>,
): DnsDirectiveSnapshot {
  return {
    commandId: pending.command_id,
    expiresAt: pending.expires_at,
    kind: pending.directive_kind as DnsDirectiveKind,
    primaryIp: pending.primary_ip,
    profileName: pending.profile_name,
    restoreCommandId: pending.restore_command_id,
    secondaryIp: pending.secondary_ip,
    standing: captureStandingSnapshot(
      pendingStandingFields(pending, pending.standing_issued_at ?? new Date().toISOString()),
    ),
  }
}

async function replaceLatestState(
  transaction: Database,
  clientId: string,
  snapshot: DnsDirectiveSnapshot,
  status: DnsDirectiveStatus,
  issuedAt?: string,
) {
  let now = issuedAt ?? new Date().toISOString()

  await transaction.deleteMany(clientDnsStates, {
    where: { client_id: clientId },
  })
  await transaction.create(clientDnsStates, {
    client_id: clientId,
    command_id: snapshot.commandId,
    directive_kind: snapshot.kind,
    error: null,
    expires_at: snapshot.expiresAt,
    issued_at: now,
    profile_name: snapshot.profileName,
    primary_ip: snapshot.primaryIp,
    restore_command_id: snapshot.restoreCommandId,
    secondary_ip: snapshot.secondaryIp,
    status,
    ...standingColumns(snapshot.standing),
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
    expires_at: snapshot.expiresAt,
    profile_name: snapshot.profileName,
    primary_ip: snapshot.primaryIp,
    restore_command_id: snapshot.restoreCommandId,
    secondary_ip: snapshot.secondaryIp,
    ...standingColumns(snapshot.standing),
  })
}

function standingToSnapshot(standing: DnsStandingSnapshot): DnsDirectiveSnapshot {
  return {
    commandId: generateId(),
    expiresAt: null,
    kind: standing.kind,
    primaryIp: standing.primaryIp,
    profileName: standing.profileName,
    restoreCommandId: null,
    secondaryIp: standing.secondaryIp,
    standing: null,
  }
}

async function materializeStanding(
  transaction: Database,
  clientId: string,
  standing: DnsStandingSnapshot | null,
) {
  await transaction.deleteMany(pendingDnsDirectives, {
    where: { client_id: clientId },
  })

  if (!standing) {
    await transaction.deleteMany(clientDnsStates, {
      where: { client_id: clientId },
    })
    return null
  }

  let snapshot = standingToSnapshot(standing)
  await replaceLatestState(transaction, clientId, snapshot, standing.status, standing.issuedAt)
  await transaction.update(clientDnsStates, clientId, {
    completed_at: standing.completedAt,
    error: null,
  })

  return snapshot
}

function pendingStandingFields(
  pending: TableRow<typeof pendingDnsDirectives>,
  issuedAt: string,
) {
  return {
    completed_at: pending.standing_completed_at,
    directive_kind: pending.directive_kind as DnsDirectiveKind,
    expires_at: pending.expires_at,
    issued_at: issuedAt,
    primary_ip: pending.primary_ip,
    profile_name: pending.profile_name,
    restore_command_id: pending.restore_command_id,
    secondary_ip: pending.secondary_ip,
    standing_completed_at: pending.standing_completed_at,
    standing_issued_at: pending.standing_issued_at,
    standing_kind: pending.standing_kind,
    standing_primary_ip: pending.standing_primary_ip,
    standing_profile_name: pending.standing_profile_name,
    standing_secondary_ip: pending.standing_secondary_ip,
    standing_status: pending.standing_status,
    status: 'pending' as const,
  }
}

async function expirePendingOverlayIfNeeded(
  transaction: Database,
  clientId: string,
  pending: TableRow<typeof pendingDnsDirectives>,
  now: Date,
): Promise<{ send: boolean; snapshot: DnsDirectiveSnapshot | null }> {
  if (!pending.expires_at || isDnsOverlayActive({ expires_at: pending.expires_at, status: 'pending' }, now)) {
    return { send: true, snapshot: snapshotFromPending(pending) }
  }

  let standing = captureStandingSnapshot(
    pendingStandingFields(pending, pending.standing_issued_at ?? now.toISOString()),
  )
  let snapshot = await materializeStanding(transaction, clientId, standing)
  if (!snapshot || standing?.status === 'applied') {
    return { send: false, snapshot }
  }

  return { send: true, snapshot }
}

export async function issueDnsDirective(
  input: {
    clientId: string
    durationMinutes?: DnsOverlayPresetMinutes | null
    kind: DnsDirectiveKind
    profileName?: string | null
    primaryIp?: string | null
    secondaryIp?: string | null
  },
  database: Database = db,
) {
  let issuedAt = new Date()
  let isOverlay = input.kind !== 'reset' && input.durationMinutes != null

  return database.transaction(async (transaction) => {
    let client = await transaction.find(clients, input.clientId)
    if (!client) {
      throw new DnsDirectiveTargetNotFoundError()
    }

    let current = await transaction.find(clientDnsStates, input.clientId)
    let standing = isOverlay ? captureStandingSnapshot(current) : null
    let expiresAt = isOverlay ? overlayDeadlineIso(issuedAt, input.durationMinutes!) : null

    let snapshot: DnsDirectiveSnapshot = {
      commandId: generateId(),
      expiresAt,
      kind: input.kind,
      primaryIp: input.kind === 'profile' ? input.primaryIp ?? null : null,
      profileName: input.kind === 'profile' ? input.profileName ?? null : null,
      restoreCommandId: isOverlay ? generateId() : null,
      secondaryIp: input.kind === 'profile' ? input.secondaryIp ?? null : null,
      standing,
    }

    let delivered = connectionRegistry.sendApplyDnsCommand(input.clientId, toPayload(snapshot))

    await replaceLatestState(
      transaction,
      input.clientId,
      snapshot,
      delivered ? 'delivered' : 'pending',
      issuedAt.toISOString(),
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

export async function extendDnsOverlay(
  input: {
    clientId: string
    durationMinutes: DnsOverlayPresetMinutes
  },
  database: Database = db,
) {
  return database.transaction(async (transaction) => {
    let client = await transaction.find(clients, input.clientId)
    if (!client) {
      throw new DnsDirectiveTargetNotFoundError()
    }

    let current = await transaction.find(clientDnsStates, input.clientId)
    if (!current || !isDnsOverlayActive(current)) {
      throw new DnsOverlayNotActiveError()
    }

    let expiresAt = addOverlayMinutes(current.expires_at!, input.durationMinutes)
    await transaction.update(clientDnsStates, input.clientId, {
      expires_at: expiresAt,
    })

    let updated = await transaction.find(clientDnsStates, input.clientId)
    if (!updated) {
      throw new DnsOverlayNotActiveError()
    }

    let snapshot = snapshotFromState(updated)
    snapshot.expiresAt = expiresAt

    let delivered = connectionRegistry.sendApplyDnsCommand(input.clientId, toPayload(snapshot))
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

    let now = new Date()
    let expired = await expirePendingOverlayIfNeeded(
      transaction,
      clientId,
      pendingDirective,
      now,
    )

    if (!expired.send || !expired.snapshot) {
      return false
    }

    let snapshot = expired.snapshot
    if (!connectionRegistry.sendApplyDnsCommand(clientId, toPayload(snapshot))) {
      await replacePendingDirective(transaction, clientId, snapshot)
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
  if (!state) {
    return null
  }

  if (state.restore_command_id && state.restore_command_id === input.commandId) {
    if (input.status === 'failed') {
      await database.update(clientDnsStates, input.clientId, {
        completed_at: new Date().toISOString(),
        error: input.error?.trim() || 'Standing DNS could not be restored.',
        expires_at: null,
        status: 'failed',
      })
      return database.find(clientDnsStates, input.clientId)
    }

    let standing = captureStandingSnapshot(state)
    return database.transaction(async (transaction) => {
      await materializeStanding(transaction, input.clientId, standing)
      if (!standing) {
        return state
      }

      await transaction.update(clientDnsStates, input.clientId, {
        completed_at: new Date().toISOString(),
        status: 'applied',
      })
      return transaction.find(clientDnsStates, input.clientId)
    })
  }

  if (state.command_id !== input.commandId) {
    return null
  }

  await database.update(clientDnsStates, input.clientId, {
    completed_at: new Date().toISOString(),
    error: input.status === 'failed' ? input.error?.trim() || 'DNS directive failed.' : null,
    expires_at: input.status === 'failed' ? null : state.expires_at,
    status: input.status,
  })

  return database.find(clientDnsStates, input.clientId)
}

export async function getLatestDnsState(clientId: string, database: Database = db) {
  return database.find(clientDnsStates, clientId)
}
