import type { Database, TableRow } from 'remix/data-table'

import { bridgeRegistry } from '../realtime/bridge-registry.ts'
import { generateId, generateOpaqueSecret, hashSecret, verifySecret } from '../utils/secrets.ts'
import { db } from './database.ts'
import {
  isDeviceError,
  isRouterEntry,
  parseJsonArray,
  tryNormalizeMac,
  type BridgeErrorCode,
  type BridgeView,
  type DeviceError,
  type RouterEntry,
} from './device-access.ts'
import { routerBridges } from './schema.ts'

export type RouterBridgeRow = TableRow<typeof routerBridges>

export class RouterBridgeAlreadyRegisteredError extends Error {
  constructor() {
    super('A Router bridge is already registered. Remove it in Settings before registering another.')
  }
}

/** v1 supports one Router bridge per household (ADR 0007). */
export async function getRouterBridge(database: Database = db) {
  let [bridge] = await database.findMany(routerBridges, { limit: 1, orderBy: ['id', 'asc'] })
  return bridge ?? null
}

export async function hasRouterBridge(database: Database = db) {
  return (await database.count(routerBridges)) > 0
}

export async function registerRouterBridge(name: string, database: Database = db) {
  let credential = `rb_${generateOpaqueSecret(32)}`
  let credentialSalt = generateOpaqueSecret(16)
  let credentialHash = await hashSecret(credential, credentialSalt)

  return database.transaction(async (transaction) => {
    if ((await transaction.count(routerBridges)) > 0) {
      throw new RouterBridgeAlreadyRegisteredError()
    }

    let bridge = await transaction.create(
      routerBridges,
      {
        credential_hash: credentialHash,
        credential_salt: credentialSalt,
        id: generateId(),
        name: name.trim(),
      },
      { returnRow: true },
    )

    return { bridge, credential }
  })
}

export async function authenticateRouterBridge(
  bridgeId: string,
  credential: string,
  database: Database = db,
) {
  let bridge = await database.find(routerBridges, bridgeId)
  if (!bridge || !(await verifySecret(credential, bridge.credential_salt, bridge.credential_hash))) {
    return null
  }

  await database.update(routerBridges, bridgeId, { last_used_at: new Date().toISOString() })
  return bridge
}

export async function updateRouterBridgeIdentity(
  bridgeId: string,
  identity: { routerModel: string | null; version: string | null },
  database: Database = db,
) {
  if (!(await database.find(routerBridges, bridgeId))) {
    return
  }

  await database.update(routerBridges, bridgeId, {
    last_seen_version: identity.version,
    router_model: identity.routerModel,
  })
}

export interface ReconcileReport {
  deviceErrors: DeviceError[]
  /** The router's whole MAC filter table, or null when the bridge couldn't read it. */
  entries: RouterEntry[] | null
  error: { code: BridgeErrorCode; message: string | null } | null
}

/**
 * Stores what the router showed. A report without the table (for example, a failed login) keeps
 * the last table and its time, so the console never treats an old table as fresh.
 */
export async function recordReconcileReport(
  bridgeId: string,
  report: ReconcileReport,
  receivedAt: Date = new Date(),
  database: Database = db,
) {
  if (!(await database.find(routerBridges, bridgeId))) {
    return null
  }

  let received = receivedAt.toISOString()
  let entries = report.entries?.flatMap((entry) => {
    let mac = tryNormalizeMac(entry.mac)
    return mac ? [{ mac, name: entry.name }] : []
  })

  await database.update(routerBridges, bridgeId, {
    device_errors: JSON.stringify(report.deviceErrors),
    last_error: report.error?.message ?? null,
    last_error_code: report.error?.code ?? null,
    last_report_at: received,
    ...(entries
      ? { last_reconciled_at: received, router_entries: JSON.stringify(entries) }
      : {}),
  })

  return database.find(routerBridges, bridgeId)
}

export function routerBridgeView(bridge: RouterBridgeRow | null): BridgeView | null {
  if (!bridge) {
    return null
  }

  return {
    connected: bridgeRegistry.isConnected(bridge.id),
    deviceErrors: parseJsonArray(bridge.device_errors, isDeviceError) ?? [],
    lastError: bridge.last_error,
    lastErrorCode: (bridge.last_error_code as BridgeErrorCode | null) ?? null,
    lastReconciledAt: bridge.last_reconciled_at,
    routerEntries: parseJsonArray(bridge.router_entries, isRouterEntry),
  }
}

/** Revokes the bridge's credential and disconnects it. Network devices and router entries stay as they are. */
export async function removeRouterBridge(bridgeId: string, database: Database = db) {
  let bridge = await database.find(routerBridges, bridgeId)
  if (!bridge) {
    return null
  }

  await database.delete(routerBridges, bridgeId)
  bridgeRegistry.disconnect(bridgeId)
  return bridge
}
