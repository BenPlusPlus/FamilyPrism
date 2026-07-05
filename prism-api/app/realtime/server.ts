import type * as http from 'node:http'
import type { Duplex } from 'node:stream'

import { WebSocketServer, type RawData, type WebSocket } from 'ws'

import { authenticateClient, updateClientLastUser } from '../data/clients.ts'
import { flushPendingDnsDirective } from '../data/dns-directives.ts'
import { routes } from '../routes.ts'
import { connectionRegistry } from './registry.ts'

interface ManagedSocket extends WebSocket {
  isAlive?: boolean
}

interface IdentifyClientMessage {
  type: 'identify'
  windowsUser: string
}

function firstHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function rejectUpgrade(socket: Duplex, statusCode: number, message: string) {
  let body = Buffer.from(message)
  socket.write(
    `HTTP/1.1 ${statusCode} ${message}\r\n` +
      'Connection: close\r\n' +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      `Content-Length: ${body.byteLength}\r\n` +
      '\r\n',
  )
  socket.write(body)
  socket.destroy()
}

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

export function parseClientMessage(rawData: RawData): IdentifyClientMessage | null {
  let payload: unknown

  try {
    payload = JSON.parse(rawDataToString(rawData))
  } catch {
    return null
  }

  if (!payload || typeof payload !== 'object') {
    return null
  }

  let type = 'type' in payload ? payload.type : null
  let windowsUser = 'windowsUser' in payload ? payload.windowsUser : null
  if (type !== 'identify' || typeof windowsUser !== 'string') {
    return null
  }

  let normalizedWindowsUser = windowsUser.trim()
  if (!normalizedWindowsUser) {
    return null
  }

  return {
    type,
    windowsUser: normalizedWindowsUser,
  }
}

export async function handleClientMessage(
  clientId: string,
  rawData: RawData,
  updateLastUser: typeof updateClientLastUser = updateClientLastUser,
) {
  let message = parseClientMessage(rawData)
  if (!message) {
    return false
  }

  await updateLastUser(clientId, message.windowsUser)
  return true
}

export function attachRealtimeServer(server: http.Server) {
  let websocketServer = new WebSocketServer({ noServer: true })

  server.on('upgrade', async (request, socket, head) => {
    let requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

    if (requestUrl.pathname !== routes.websocket.href()) {
      rejectUpgrade(socket, 404, 'Not Found')
      return
    }

    let clientId = firstHeaderValue(request.headers['x-client-id'])
    let authorization = firstHeaderValue(request.headers.authorization)
    let credential =
      authorization && authorization.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length).trim()
        : null

    if (!clientId || !credential) {
      rejectUpgrade(socket, 401, 'Missing client credentials')
      return
    }

    let client = await authenticateClient(clientId, credential)
    if (!client) {
      rejectUpgrade(socket, 401, 'Invalid client credentials')
      return
    }

    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      let managedSocket = websocket as ManagedSocket
      managedSocket.isAlive = true

      connectionRegistry.register(client.id, websocket)

      let heartbeat = setInterval(() => {
        if (!managedSocket.isAlive) {
          managedSocket.terminate()
          return
        }

        managedSocket.isAlive = false
        managedSocket.ping()
      }, 30_000)

      websocket.on('pong', () => {
        managedSocket.isAlive = true
      })

      websocket.on('message', (rawData, isBinary) => {
        if (isBinary) {
          return
        }

        void handleClientMessage(client.id, rawData).catch((error: unknown) => {
          console.error(`Failed to handle websocket message for client ${client.id}.`, error)
        })
      })

      let cleanup = () => {
        clearInterval(heartbeat)
        connectionRegistry.unregister(client.id, websocket)
      }

      websocket.on('close', cleanup)
      websocket.on('error', cleanup)

      websocket.send(
        JSON.stringify({
          clientId: client.id,
          name: client.name,
          type: 'connected',
        }),
      )

      void flushPendingDnsDirective(client.id).catch((error: unknown) => {
        console.error(`Failed to flush pending DNS directive for client ${client.id}.`, error)
      })
    })
  })
}
