import type * as http from 'node:http'
import type { Duplex } from 'node:stream'

import * as s from 'remix/data-schema'
import { maxLength, minLength } from 'remix/data-schema/checks'
import type { RawData, WebSocket, WebSocketServer } from 'ws'

import { normalizeClientVersion } from '../data/client-package.ts'
import { BRIDGE_ERROR_CODES, DEVICE_ERROR_CODES } from '../data/device-access.ts'
import { pushDesiredState } from '../data/network-devices.ts'
import {
  authenticateRouterBridge,
  recordReconcileReport,
  updateRouterBridgeIdentity,
  type ReconcileReport,
} from '../data/router-bridges.ts'
import { bridgeRegistry } from './bridge-registry.ts'

/** The router allows 80 entries; anything past this is a broken or hostile report. */
const MAX_REPORTED_ENTRIES = 500

let identifySchema = s.object({
  routerModel: s.optional(s.string().pipe(maxLength(100))),
  type: s.literal('identify'),
  version: s.optional(s.string().pipe(maxLength(64))),
})

let reportSchema = s.object({
  deviceErrors: s.optional(
    s.array(
      s.object({
        code: s.enum_(DEVICE_ERROR_CODES),
        deviceId: s.string().pipe(minLength(1), maxLength(255)),
        message: s.optional(s.string().pipe(maxLength(500))),
      }),
    ),
  ),
  entries: s.optional(
    s.nullable(
      s.array(
        s.object({
          mac: s.string().pipe(maxLength(32)),
          name: s.string().pipe(maxLength(100)),
        }),
      ),
    ),
  ),
  error: s.optional(
    s.nullable(
      s.object({
        code: s.enum_(BRIDGE_ERROR_CODES),
        message: s.optional(s.string().pipe(maxLength(500))),
      }),
    ),
  ),
  type: s.literal('reconcile-report'),
})

let bridgeMessageSchema = s.variant('type', {
  identify: identifySchema,
  'reconcile-report': reportSchema,
})

export type BridgeMessage =
  | { routerModel: string | null; type: 'identify'; version: string | null }
  | { report: ReconcileReport; type: 'reconcile-report' }

function rawDataToString(rawData: RawData) {
  if (typeof rawData === 'string') {
    return rawData
  }
  if (Array.isArray(rawData)) {
    return Buffer.concat(rawData).toString('utf8')
  }
  if (Buffer.isBuffer(rawData)) {
    return rawData.toString('utf8')
  }
  return Buffer.from(rawData).toString('utf8')
}

export function parseBridgeMessage(rawData: RawData): BridgeMessage | null {
  let payload: unknown
  try {
    payload = JSON.parse(rawDataToString(rawData))
  } catch {
    return null
  }

  let parsed = s.parseSafe(bridgeMessageSchema, payload)
  if (!parsed.success) {
    return null
  }

  let message = parsed.value
  if (message.type === 'identify') {
    return {
      routerModel: message.routerModel?.trim() || null,
      type: 'identify',
      version: message.version ? normalizeClientVersion(message.version) : null,
    }
  }

  if (
    (message.deviceErrors?.length ?? 0) > MAX_REPORTED_ENTRIES ||
    (message.entries?.length ?? 0) > MAX_REPORTED_ENTRIES
  ) {
    return null
  }

  return {
    report: {
      deviceErrors: (message.deviceErrors ?? []).map((error) => ({
        code: error.code,
        deviceId: error.deviceId,
        message: error.message?.trim() || null,
      })),
      entries: message.entries ?? null,
      error: message.error
        ? { code: message.error.code, message: message.error.message?.trim() || null }
        : null,
    },
    type: 'reconcile-report',
  }
}

export async function handleBridgeMessage(bridgeId: string, rawData: RawData) {
  let message = parseBridgeMessage(rawData)
  if (!message) {
    return false
  }

  if (message.type === 'identify') {
    await updateRouterBridgeIdentity(bridgeId, message)
  } else {
    await recordReconcileReport(bridgeId, message.report)
  }

  return true
}

function firstHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

/** Authenticates a Router bridge upgrade on its own path, so a Client socket can never be taken for one. */
export async function handleBridgeUpgrade(
  websocketServer: WebSocketServer,
  request: http.IncomingMessage,
  socket: Duplex,
  head: Buffer,
  reject: (socket: Duplex, statusCode: number, message: string) => void,
) {
  let bridgeId = firstHeaderValue(request.headers['x-bridge-id'])
  let authorization = firstHeaderValue(request.headers.authorization)
  let credential = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : null

  if (!bridgeId || !credential) {
    reject(socket, 401, 'Missing Router bridge credentials')
    return
  }

  let bridge = await authenticateRouterBridge(bridgeId, credential)
  if (!bridge) {
    reject(socket, 401, 'Invalid Router bridge credentials')
    return
  }

  websocketServer.handleUpgrade(request, socket, head, (websocket) => {
    attachBridgeSocket(bridge.id, bridge.name, websocket)
  })
}

function attachBridgeSocket(bridgeId: string, name: string, websocket: WebSocket) {
  let alive = true
  bridgeRegistry.register(bridgeId, websocket)

  let heartbeat = setInterval(() => {
    if (!alive) {
      websocket.terminate()
      return
    }
    alive = false
    websocket.ping()
  }, 30_000)

  websocket.on('pong', () => {
    alive = true
  })

  websocket.on('message', (rawData, isBinary) => {
    if (isBinary) {
      return
    }
    void handleBridgeMessage(bridgeId, rawData).catch((error: unknown) => {
      console.error(`Failed to handle websocket message for Router bridge ${bridgeId}.`, error)
    })
  })

  let cleanup = () => {
    clearInterval(heartbeat)
    bridgeRegistry.unregister(bridgeId, websocket)
  }
  websocket.on('close', cleanup)
  websocket.on('error', cleanup)

  bridgeRegistry.send(bridgeId, { bridgeId, name, type: 'connected' })
  void pushDesiredState().catch((error: unknown) => {
    console.error(`Failed to send desired state to Router bridge ${bridgeId}.`, error)
  })
}
