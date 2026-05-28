import { WebSocket } from 'ws'

export interface DisplayMessagePayload {
  messageId: string
  text: string
  type: 'display-message'
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

  sendDisplayMessage(clientId: string, payload: DisplayMessagePayload) {
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
}

export const connectionRegistry = new ClientConnectionRegistry()

