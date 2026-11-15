import { DNS_OVERLAY_PRESET_MINUTES, type DnsOverlayPresetMinutes } from './dns-overlay.ts'

/** Whether a Network device is blocked or allowed at the router (see CONTEXT.md, Device access). */
export type DeviceAccess = 'blocked' | 'allowed'

/** Timed Device access uses the DNS time limit presets. */
export const DEVICE_TIME_LIMIT_MINUTES = DNS_OVERLAY_PRESET_MINUTES
export type DeviceTimeLimitMinutes = DnsOverlayPresetMinutes

export const BRIDGE_ERROR_CODES = [
  'unreachable',
  'login-failed',
  'locked-out',
  'router-busy',
  'unexpected',
] as const
export type BridgeErrorCode = (typeof BRIDGE_ERROR_CODES)[number]

export const DEVICE_ERROR_CODES = ['protected-mac', 'table-full', 'unexpected'] as const
export type DeviceErrorCode = (typeof DEVICE_ERROR_CODES)[number]

export interface RouterEntry {
  mac: string
  name: string
}

export interface DeviceError {
  code: DeviceErrorCode
  deviceId: string
  message: string | null
}

export class InvalidMacAddressError extends Error {}

export function isDeviceAccess(value: unknown): value is DeviceAccess {
  return value === 'blocked' || value === 'allowed'
}

export function otherAccess(access: DeviceAccess): DeviceAccess {
  return access === 'blocked' ? 'allowed' : 'blocked'
}

/**
 * Accepts `aa:bb:cc:dd:ee:ff`, `AA-BB-CC-DD-EE-FF`, `aabb.ccdd.eeff`, or bare hex, and returns the
 * router's form, `AA-BB-CC-DD-EE-FF`. Group (multicast and broadcast) and all-zero addresses can't
 * belong to a device, and the router refuses them.
 */
export function normalizeMac(value: string) {
  let hex = value.trim().replace(/[\s:.-]/g, '')
  if (!/^[0-9a-fA-F]{12}$/.test(hex)) {
    throw new InvalidMacAddressError(
      'Enter a MAC address as six pairs of hex digits, like 3C-A9-F4-10-20-AB.',
    )
  }

  let upper = hex.toUpperCase()
  if (Number.parseInt(upper.slice(0, 2), 16) & 1) {
    throw new InvalidMacAddressError(
      "That's a group address, not one device's. Check the address on the device.",
    )
  }
  if (/^0+$/.test(upper)) {
    throw new InvalidMacAddressError("That isn't a real device's address.")
  }

  return upper.match(/../g)!.join('-')
}

export function tryNormalizeMac(value: string) {
  try {
    return normalizeMac(value)
  } catch {
    return null
  }
}

/**
 * The locally administered bit. Phones and tablets set it on a private Wi-Fi address, which can
 * change unless the device is told to keep a fixed one for this network.
 */
export function isPrivateWifiMac(mac: string) {
  return (Number.parseInt(mac.slice(0, 2), 16) & 0b10) !== 0
}

export interface DeviceAccessFields {
  standing_access: string
  timed_access: string | null
  timed_expires_at: string | null
}

export function activeTimedAccess(device: DeviceAccessFields, now: Date = new Date()) {
  if (!isDeviceAccess(device.timed_access) || !device.timed_expires_at) {
    return null
  }

  let remainingMs = Date.parse(device.timed_expires_at) - now.getTime()
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return null
  }

  return {
    access: device.timed_access,
    expiresAt: device.timed_expires_at,
    remainingMs,
  }
}

/** What the router should do for the device right now: a running timed change, else standing access. */
export function effectiveAccess(device: DeviceAccessFields, now: Date = new Date()): DeviceAccess {
  return activeTimedAccess(device, now)?.access ?? (device.standing_access as DeviceAccess)
}

export type ObservedAccess = DeviceAccess | 'partial'

/** A device is blocked when every one of its MAC addresses is in the router's filter table. */
export function observedAccess(macs: string[], entries: RouterEntry[]): ObservedAccess {
  let inTable = new Set(entries.map((entry) => entry.mac.toUpperCase()))
  let present = macs.filter((mac) => inTable.has(mac.toUpperCase())).length
  if (present === 0) {
    return 'allowed'
  }

  return present === macs.length ? 'blocked' : 'partial'
}

/** The latest reconcile report, as the console needs it. */
export interface BridgeView {
  connected: boolean
  deviceErrors: DeviceError[]
  lastError: string | null
  lastErrorCode: BridgeErrorCode | null
  /** When the router's table was last read. */
  lastReconciledAt: string | null
  /** The router's whole MAC filter table at lastReconciledAt. */
  routerEntries: RouterEntry[] | null
}

export type DeviceStatusKind = DeviceAccess | 'waiting' | 'failed'

export interface DeviceStatus {
  detail: string | null
  kind: DeviceStatusKind
  label: string
}

export interface StatusDevice extends DeviceAccessFields {
  access_changed_at: string
  id: string
  macs: string[]
}

export function describeBridgeError(code: BridgeErrorCode, message: string | null) {
  switch (code) {
    case 'unreachable':
      return "The Router bridge can't reach the router."
    case 'login-failed':
      return "The router turned down the bridge's username or password. The bridge stopped trying so it can't lock you out. Update the password on the bridge PC."
    case 'locked-out':
      return 'The router locked its admin login after too many failed tries. Wait for it to unlock, then update the password on the bridge PC.'
    case 'router-busy':
      return "Someone else is signed in to the router's admin page. The bridge will try again."
    case 'unexpected':
      return message || 'The router gave an answer the bridge didn\'t expect.'
  }
}

export function describeDeviceError(code: DeviceErrorCode, message: string | null) {
  switch (code) {
    case 'protected-mac':
      return "The bridge won't block this address: it belongs to the bridge PC or to the PC signed in to the router."
    case 'table-full':
      return "The router's filter table is full."
    case 'unexpected':
      return message || "The router didn't accept the change."
  }
}

const ACCESS_LABEL: Record<DeviceAccess, string> = {
  allowed: 'Allowed',
  blocked: 'Blocked',
}

/**
 * Compares what the router last showed with what it should do now. A report only speaks for the
 * device if it arrived after the device's last change; until then the device is waiting.
 */
export function deviceStatus(
  device: StatusDevice,
  bridge: BridgeView | null,
  now: Date = new Date(),
): DeviceStatus {
  let desired = effectiveAccess(device, now)
  if (!bridge) {
    return { detail: 'No Router bridge is registered.', kind: 'waiting', label: 'Waiting for the router' }
  }

  let fresh =
    bridge.routerEntries !== null &&
    bridge.lastReconciledAt !== null &&
    Date.parse(bridge.lastReconciledAt) >= Date.parse(device.access_changed_at)
  let observed = bridge.routerEntries ? observedAccess(device.macs, bridge.routerEntries) : null

  if (fresh && observed === desired) {
    return { detail: null, kind: desired, label: ACCESS_LABEL[desired] }
  }

  if (fresh) {
    let deviceError = bridge.deviceErrors.find((error) => error.deviceId === device.id)
    if (deviceError) {
      return {
        detail: describeDeviceError(deviceError.code, deviceError.message),
        kind: 'failed',
        label: desired === 'blocked' ? "Couldn't block" : "Couldn't allow",
      }
    }
  }

  if (bridge.lastErrorCode) {
    return {
      detail: describeBridgeError(bridge.lastErrorCode, bridge.lastError),
      kind: 'failed',
      label: "Couldn't reach the router",
    }
  }

  return {
    detail: !bridge.connected
      ? 'The Router bridge is offline. It catches up when it reconnects.'
      : observed === 'partial'
        ? 'Only some of its addresses are blocked right now.'
        : null,
    kind: 'waiting',
    label: 'Waiting for the router',
  }
}

export interface DesiredDevice {
  id: string
  macs: string[]
  name: string
  standing: DeviceAccess
  timed: { access: DeviceAccess; expiresAt: string } | null
}

export interface DesiredStatePayload {
  devices: DesiredDevice[]
  /** Lets the bridge correct for its own clock when it ends timed changes. */
  serverTime: string
  type: 'desired-state'
}

/** Everything the Router bridge needs to make the router match (ADR 0008). Ended timed changes are left out. */
export function buildDesiredState(
  devices: Array<DeviceAccessFields & { id: string; macs: string[]; name: string }>,
  now: Date = new Date(),
): DesiredStatePayload {
  return {
    devices: devices.map((device) => {
      let timed = activeTimedAccess(device, now)
      return {
        id: device.id,
        macs: [...device.macs],
        name: device.name,
        standing: device.standing_access as DeviceAccess,
        timed: timed ? { access: timed.access, expiresAt: timed.expiresAt } : null,
      }
    }),
    serverTime: now.toISOString(),
    type: 'desired-state',
  }
}

/** Router entries for MAC addresses no Network device owns, so a Console admin can adopt them. */
export function unmanagedEntries(entries: RouterEntry[] | null, managedMacs: Iterable<string>) {
  if (!entries) {
    return []
  }

  let managed = new Set([...managedMacs].map((mac) => mac.toUpperCase()))
  return entries.filter((entry) => !managed.has(entry.mac.toUpperCase()))
}

/** A readable starting name for an adopted entry: `Switch_Alex_Lan` becomes `Switch Alex Lan`. */
export function suggestedDeviceName(routerName: string) {
  return routerName.replace(/_+/g, ' ').trim()
}

export function parseJsonArray<T>(value: string | null, guard: (item: unknown) => item is T): T[] | null {
  if (value === null) {
    return null
  }

  try {
    let parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter(guard) : null
  } catch {
    return null
  }
}

export function isRouterEntry(item: unknown): item is RouterEntry {
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof (item as RouterEntry).mac === 'string' &&
    typeof (item as RouterEntry).name === 'string'
  )
}

export function isDeviceError(item: unknown): item is DeviceError {
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof (item as DeviceError).deviceId === 'string' &&
    (DEVICE_ERROR_CODES as readonly string[]).includes((item as DeviceError).code)
  )
}
