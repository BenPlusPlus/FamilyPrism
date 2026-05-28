import type * as http from 'node:http'
import type { Duplex } from 'node:stream'

import { WebSocketServer, type WebSocket } from 'ws'

import { authenticateClient } from '../data/clients.ts'
import { routes } from '../routes.ts'
import { connectionRegistry } from './registry.ts'

interface ManagedSocket extends WebSocket {
  isAlive?: boolean
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
    })
  })
}

