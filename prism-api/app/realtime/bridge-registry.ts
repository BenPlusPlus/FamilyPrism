import { WebSocket } from 'ws'

import type { DesiredStatePayload } from '../data/device-access.ts'

export interface BridgeConnectedPayload {
  bridgeId: string
  name: string
  type: 'connected'
}

export interface ReconcileNowPayload {
  type: 'reconcile-now'
}

export type BridgePayload = BridgeConnectedPayload | DesiredStatePayload | ReconcileNowPayload

/**
 * The Router bridge's websocket. Only the newest connection is kept: two bridges reconciling at
 * once would keep taking over each other's router session.
 */
export class RouterBridgeRegistry {
  #sockets = new Map<string, WebSocket>()

  register(bridgeId: string, socket: WebSocket) {
    let previous = this.#sockets.get(bridgeId)
    this.#sockets.set(bridgeId, socket)
    if (previous && previous !== socket) {
      try {
        previous.close(4000, 'Replaced by a newer Router bridge connection.')
      } catch {
        // The close handler of the old socket cleans up whatever is left.
      }
    }
  }

  /** Ignores sockets that were already replaced, so an old socket closing can't drop the new one. */
  unregister(bridgeId: string, socket: WebSocket) {
    if (this.#sockets.get(bridgeId) === socket) {
      this.#sockets.delete(bridgeId)
    }
  }

  isConnected(bridgeId: string) {
    return this.#sockets.get(bridgeId)?.readyState === WebSocket.OPEN
  }

  send(bridgeId: string, payload: BridgePayload) {
    let socket = this.#sockets.get(bridgeId)
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false
    }

    try {
      socket.send(JSON.stringify(payload))
      return true
    } catch {
      return false
    }
  }

  disconnect(bridgeId: string) {
    let socket = this.#sockets.get(bridgeId)
    this.#sockets.delete(bridgeId)
    try {
      socket?.close()
    } catch {
      // Already closing.
    }
  }
}

export const bridgeRegistry = new RouterBridgeRegistry()
