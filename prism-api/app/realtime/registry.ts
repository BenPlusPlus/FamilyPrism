import { WebSocket } from 'ws'

export interface DisplayMessagePayload {
  messageId: string
  text: string
  type: 'display-message'
}

export interface TakeScreenshotPayload {
  type: 'take-screenshot'
}

export interface ApplyDnsPayload {
  commandId: string
  primaryIp: string | null
  profileName: string | null
  resetToDhcp: boolean
  secondaryIp: string | null
  type: 'apply-dns'
}

export class ClientConnectionRegistry {
  #connections = new Map<string, Set<WebSocket>>()

  register(clientId: string, socket: WebSocket) {
    let clientSockets = this.#connections.get(clientId) ?? new Set<WebSocket>()
    clientSockets.add(socket)
    this.#connections.set(clientId, clientSockets)
  }

  unregister(clientId: string, socket: WebSocket) {
    let clientSockets = this.#connections.get(clientId)
    if (!clientSockets) {
      return
    }

    clientSockets.delete(socket)

    if (clientSockets.size === 0) {
      this.#connections.delete(clientId)
    }
  }

  countConnectedClients() {
    return this.#connections.size
  }

  isClientConnected(clientId: string) {
    return (this.#connections.get(clientId)?.size ?? 0) > 0
  }

  disconnectClient(clientId: string) {
    let sockets = this.#connections.get(clientId)
    if (!sockets || sockets.size === 0) {
      return 0
    }

    this.#connections.delete(clientId)

    for (let socket of sockets) {
      try {
        socket.close()
      } catch {
        // Let the server-side cleanup handlers dispose any broken sockets.
      }
    }

    return sockets.size
  }

  #sendPayload(
    clientId: string,
    payload: ApplyDnsPayload | DisplayMessagePayload | TakeScreenshotPayload,
  ) {
    let sockets = this.#connections.get(clientId)
    if (!sockets || sockets.size === 0) {
      return false
    }

    let delivered = false
    let body = JSON.stringify(payload)

    for (let socket of sockets) {
      if (socket.readyState !== WebSocket.OPEN) {
        continue
      }

      try {
        socket.send(body)
        delivered = true
      } catch {
        // Let close/error handlers clean up the socket; delivery remains false for this socket.
      }
    }

    return delivered
  }

  sendDisplayMessage(clientId: string, payload: DisplayMessagePayload) {
    return this.#sendPayload(clientId, payload)
  }

  sendTakeScreenshotCommand(clientId: string) {
    return this.#sendPayload(clientId, {
      type: 'take-screenshot',
    })
  }

  sendApplyDnsCommand(clientId: string, payload: ApplyDnsPayload) {
    return this.#sendPayload(clientId, payload)
  }
}

export const connectionRegistry = new ClientConnectionRegistry()
