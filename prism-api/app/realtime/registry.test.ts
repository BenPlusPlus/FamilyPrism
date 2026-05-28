import assert from 'node:assert/strict'
import test from 'node:test'

import type { WebSocket } from 'ws'

import { ClientConnectionRegistry } from './registry.ts'

function createSocket() {
  let sent: string[] = []
  let socket = {
    readyState: 1,
    send(payload: string) {
      sent.push(payload)
    },
  } as unknown as WebSocket

  return { sent, socket }
}

test('registry tracks connection state by client id', () => {
  let registry = new ClientConnectionRegistry()
  let { socket } = createSocket()

  registry.register('client-1', socket)
  assert.equal(registry.isClientConnected('client-1'), true)
  assert.equal(registry.countConnectedClients(), 1)

  registry.unregister('client-1', socket)
  assert.equal(registry.isClientConnected('client-1'), false)
  assert.equal(registry.countConnectedClients(), 0)
})

test('registry sends display messages to connected clients', () => {
  let registry = new ClientConnectionRegistry()
  let { sent, socket } = createSocket()

  registry.register('client-1', socket)
  let delivered = registry.sendDisplayMessage('client-1', {
    messageId: 'msg-1',
    text: 'Hello client',
    type: 'display-message',
  })

  assert.equal(delivered, true)
  assert.equal(sent.length, 1)
  assert.match(sent[0], /Hello client/)
})

test('registry reports offline delivery when no socket is connected', () => {
  let registry = new ClientConnectionRegistry()

  let delivered = registry.sendDisplayMessage('client-404', {
    messageId: 'msg-2',
    text: 'No listeners',
    type: 'display-message',
  })

  assert.equal(delivered, false)
})
