import type { Database, TableRow } from 'remix/data-table'

import { bridgeRegistry } from '../realtime/bridge-registry.ts'
import { generateId } from '../utils/secrets.ts'
import { db } from './database.ts'
import {
  activeTimedAccess,
  buildDesiredState,
  describeBridgeError,
  deviceStatus,
  isPrivateWifiMac,
  normalizeMac,
  suggestedDeviceName,
  unmanagedEntries,
  type DeviceAccess,
  type DeviceStatus,
  type DeviceTimeLimitMinutes,
  type RouterEntry,
} from './device-access.ts'
import { getRouterBridge, routerBridgeView } from './router-bridges.ts'
import { networkDeviceMacs, networkDevices } from './schema.ts'

export type NetworkDeviceRow = TableRow<typeof networkDevices>
export type NetworkDevice = NetworkDeviceRow & { macs: string[] }

export const MAX_DEVICE_NAME_LENGTH = 100

export class NetworkDeviceNotFoundError extends Error {
  constructor() {
    super('Device not found.')
  }
}

export class InvalidNetworkDeviceError extends Error {}

export class NetworkDeviceNameConflictError extends Error {
  constructor() {
    super('A device with that name already exists.')
  }
}

export class MacAddressInUseError extends Error {
  constructor(deviceName: string) {
    super(`That MAC address already belongs to ${deviceName}.`)
  }
}

export class TimedAccessNotActiveError extends Error {
  constructor() {
    super('This device has no time limit running.')
  }
}

function normalizeName(value: string) {
  let name = value.trim()
  if (!name) {
    throw new InvalidNetworkDeviceError('Give the device a name.')
  }
  if (name.length > MAX_DEVICE_NAME_LENGTH) {
    throw new InvalidNetworkDeviceError(`Keep the name to ${MAX_DEVICE_NAME_LENGTH} characters or fewer.`)
  }

  return name
}

async function assertNameFree(transaction: Database, name: string, exceptId?: string) {
  let existing = await transaction.findOne(networkDevices, { where: { name } })
  if (existing && existing.id !== exceptId) {
    throw new NetworkDeviceNameConflictError()
  }
}

async function assertMacFree(transaction: Database, mac: string) {
  let existing = await transaction.find(networkDeviceMacs, mac)
  if (existing) {
    let owner = await transaction.find(networkDevices, existing.device_id)
    throw new MacAddressInUseError(owner?.name ?? 'another device')
  }
}

async function requireDevice(transaction: Database, deviceId: string) {
  let device = await transaction.find(networkDevices, deviceId)
  if (!device) {
    throw new NetworkDeviceNotFoundError()
  }

  return device
}

export async function listNetworkDevices(database: Database = db): Promise<NetworkDevice[]> {
  let [devices, macs] = await Promise.all([
    database.findMany(networkDevices, { orderBy: ['name', 'asc'] }),
    database.findMany(networkDeviceMacs, { orderBy: ['mac', 'asc'] }),
  ])

  let macsByDevice = new Map<string, string[]>()
  for (let row of macs) {
    let list = macsByDevice.get(row.device_id) ?? []
    list.push(row.mac)
    macsByDevice.set(row.device_id, list)
  }

  return devices.map((device) => ({ ...device, macs: macsByDevice.get(device.id) ?? [] }))
}

export async function getNetworkDevice(deviceId: string, database: Database = db) {
  let device = await database.find(networkDevices, deviceId)
  if (!device) {
    return null
  }

  let macs = await database.findMany(networkDeviceMacs, {
    orderBy: ['mac', 'asc'],
    where: { device_id: deviceId },
  })
  return { ...device, macs: macs.map((row) => row.mac) }
}

/**
 * Sends the Router bridge the complete desired state (ADR 0008). Returns false when no bridge is
 * connected; it gets the same state when it reconnects.
 */
export async function pushDesiredState(database: Database = db) {
  let bridge = await getRouterBridge(database)
  if (!bridge) {
    return false
  }

  return bridgeRegistry.send(bridge.id, buildDesiredState(await listNetworkDevices(database)))
}

export function requestReconcile(bridgeId: string) {
  return bridgeRegistry.send(bridgeId, { type: 'reconcile-now' })
}

async function changed<T>(database: Database, work: (transaction: Database) => Promise<T>) {
  let result = await database.transaction(work)
  let delivered = await pushDesiredState(database)
  return { delivered, result }
}

export async function createNetworkDevice(
  input: { mac: string; name: string; standingAccess: DeviceAccess },
  database: Database = db,
) {
  let name = normalizeName(input.name)
  let mac = normalizeMac(input.mac)

  return changed(database, async (transaction) => {
    await assertNameFree(transaction, name)
    await assertMacFree(transaction, mac)

    let device = await transaction.create(
      networkDevices,
      {
        access_changed_at: new Date().toISOString(),
        id: generateId(),
        name,
        standing_access: input.standingAccess,
        timed_access: null,
        timed_expires_at: null,
      },
      { returnRow: true },
    )
    await transaction.create(networkDeviceMacs, { device_id: device.id, mac })
    return device
  })
}

export async function renameNetworkDevice(deviceId: string, name: string, database: Database = db) {
  let normalized = normalizeName(name)

  return changed(database, async (transaction) => {
    await requireDevice(transaction, deviceId)
    await assertNameFree(transaction, normalized, deviceId)
    await transaction.update(networkDevices, deviceId, { name: normalized })
    return normalized
  })
}

export async function addNetworkDeviceMac(deviceId: string, mac: string, database: Database = db) {
  let normalized = normalizeMac(mac)

  return changed(database, async (transaction) => {
    let device = await requireDevice(transaction, deviceId)
    await assertMacFree(transaction, normalized)
    await transaction.create(networkDeviceMacs, { device_id: deviceId, mac: normalized })
    await transaction.update(networkDevices, deviceId, { access_changed_at: new Date().toISOString() })
    return { device, mac: normalized }
  })
}

/**
 * Stops managing one address. Its router entry stays as it is (ADR 0008), so a blocked address
 * shows up as an unmanaged entry until someone adopts or removes it.
 */
export async function removeNetworkDeviceMac(deviceId: string, mac: string, database: Database = db) {
  return changed(database, async (transaction) => {
    let device = await requireDevice(transaction, deviceId)
    let row = await transaction.find(networkDeviceMacs, mac)
    if (!row || row.device_id !== deviceId) {
      throw new InvalidNetworkDeviceError('That address is not on this device.')
    }
    if ((await transaction.count(networkDeviceMacs, { where: { device_id: deviceId } })) <= 1) {
      throw new InvalidNetworkDeviceError(
        'A device needs at least one MAC address. Delete the device instead.',
      )
    }

    await transaction.delete(networkDeviceMacs, mac)
    await transaction.update(networkDevices, deviceId, { access_changed_at: new Date().toISOString() })
    return device
  })
}

/** Stops managing the device. Its router entries stay as they are (ADR 0008). */
export async function deleteNetworkDevice(deviceId: string, database: Database = db) {
  return changed(database, async (transaction) => {
    let device = await requireDevice(transaction, deviceId)
    await transaction.delete(networkDevices, deviceId)
    return device
  })
}

/** An indefinite block or allow. It replaces any running timed change. */
export async function setStandingAccess(
  deviceId: string,
  access: DeviceAccess,
  database: Database = db,
) {
  return changed(database, async (transaction) => {
    let device = await requireDevice(transaction, deviceId)
    await transaction.update(networkDevices, deviceId, {
      access_changed_at: new Date().toISOString(),
      standing_access: access,
      timed_access: null,
      timed_expires_at: null,
    })
    return device
  })
}

/** Blocks or allows for a DNS time limit preset, then standing access returns. */
export async function startTimedAccess(
  deviceId: string,
  access: DeviceAccess,
  minutes: DeviceTimeLimitMinutes,
  database: Database = db,
) {
  let now = new Date()

  return changed(database, async (transaction) => {
    let device = await requireDevice(transaction, deviceId)
    if (device.standing_access === access) {
      throw new InvalidNetworkDeviceError(
        access === 'blocked' ? 'This device is already blocked.' : 'This device is already allowed.',
      )
    }

    let expiresAt = new Date(now.getTime() + minutes * 60_000).toISOString()
    await transaction.update(networkDevices, deviceId, {
      access_changed_at: now.toISOString(),
      timed_access: access,
      timed_expires_at: expiresAt,
    })
    return { device, expiresAt }
  })
}

/**
 * Adds time to a running timed change. The router's state doesn't change, so the device's last
 * change time stays put and it doesn't show as waiting.
 */
export async function extendTimedAccess(
  deviceId: string,
  minutes: DeviceTimeLimitMinutes,
  database: Database = db,
) {
  return changed(database, async (transaction) => {
    let device = await requireDevice(transaction, deviceId)
    let timed = activeTimedAccess(device)
    if (!timed) {
      throw new TimedAccessNotActiveError()
    }

    let expiresAt = new Date(Date.parse(timed.expiresAt) + minutes * 60_000).toISOString()
    await transaction.update(networkDevices, deviceId, { timed_expires_at: expiresAt })
    return { device, expiresAt }
  })
}

/** Ends a running timed change now; standing access returns. */
export async function endTimedAccess(deviceId: string, database: Database = db) {
  return changed(database, async (transaction) => {
    let device = await requireDevice(transaction, deviceId)
    if (!activeTimedAccess(device)) {
      throw new TimedAccessNotActiveError()
    }

    await transaction.update(networkDevices, deviceId, {
      access_changed_at: new Date().toISOString(),
      timed_access: null,
      timed_expires_at: null,
    })
    return device
  })
}

export interface DeviceOverview {
  id: string
  macs: Array<{ mac: string; private: boolean }>
  name: string
  standing: DeviceAccess
  status: DeviceStatus
  timed: { access: DeviceAccess; expiresAt: string; remainingMs: number } | null
}

export interface BridgeOverview {
  connected: boolean
  /** Plain-language failure from the latest report, if it failed. */
  error: string | null
  id: string
  lastReportAt: string | null
  name: string
  routerModel: string | null
  version: string | null
}

export interface NetworkOverview {
  bridge: BridgeOverview | null
  devices: DeviceOverview[]
  unmanaged: Array<RouterEntry & { suggestedName: string }>
}

/** What the console shows about Network devices: desired state compared with the router's last report. */
export async function loadNetworkOverview(
  now: Date = new Date(),
  database: Database = db,
): Promise<NetworkOverview> {
  let [devices, bridge] = await Promise.all([listNetworkDevices(database), getRouterBridge(database)])
  let view = routerBridgeView(bridge)

  return {
    bridge: bridge
      ? {
          connected: view?.connected ?? false,
          error: view?.lastErrorCode ? describeBridgeError(view.lastErrorCode, view.lastError) : null,
          id: bridge.id,
          lastReportAt: bridge.last_report_at,
          name: bridge.name,
          routerModel: bridge.router_model,
          version: bridge.last_seen_version,
        }
      : null,
    devices: devices.map((device) => ({
      id: device.id,
      macs: device.macs.map((mac) => ({ mac, private: isPrivateWifiMac(mac) })),
      name: device.name,
      standing: device.standing_access as DeviceAccess,
      status: deviceStatus(device, view, now),
      timed: activeTimedAccess(device, now),
    })),
    unmanaged: unmanagedEntries(
      view?.routerEntries ?? null,
      devices.flatMap((device) => device.macs),
    ).map((entry) => ({ ...entry, suggestedName: suggestedDeviceName(entry.name) })),
  }
}

export interface DevicesSummary {
  allowed: number
  blocked: number
  bridgeConnected: boolean
  failed: number
  timed: number
  total: number
  waiting: number
}

/** The Home page's one-line view of Network devices. */
export function summarizeDevices(overview: NetworkOverview): DevicesSummary {
  let count = (kind: DeviceStatus['kind']) =>
    overview.devices.filter((device) => device.status.kind === kind).length

  return {
    allowed: count('allowed'),
    blocked: count('blocked'),
    bridgeConnected: overview.bridge?.connected ?? false,
    failed: count('failed'),
    timed: overview.devices.filter((device) => device.timed).length,
    total: overview.devices.length,
    waiting: count('waiting'),
  }
}
