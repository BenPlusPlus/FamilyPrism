import assert from 'node:assert/strict'
import test from 'node:test'

import type { WebSocket } from 'ws'

import { RouterBridgeRegistry } from './bridge-registry.ts'

function fakeSocket() {
  let sent: unknown[] = []
  let closed = 0
  let socket = {
    close() {
      closed += 1
    },
    readyState: 1,
    send(body: string) {
      sent.push(JSON.parse(body))
    },
  } as unknown as WebSocket
  return { closed: () => closed, sent, socket }
}

test('a newer bridge connection replaces the older one and closes it', () => {
  let registry = new RouterBridgeRegistry()
  let older = fakeSocket()
  let newer = fakeSocket()

  registry.register('bridge', older.socket)
  registry.register('bridge', newer.socket)
  registry.send('bridge', { type: 'reconcile-now' })

  assert.equal(older.closed(), 1)
  assert.deepEqual(older.sent, [])
  assert.deepEqual(newer.sent, [{ type: 'reconcile-now' }])
})

test('the replaced socket closing afterwards does not disconnect the newer one', () => {
  let registry = new RouterBridgeRegistry()
  let older = fakeSocket()
  let newer = fakeSocket()

  registry.register('bridge', older.socket)
  registry.register('bridge', newer.socket)
  registry.unregister('bridge', older.socket)

  assert.equal(registry.isConnected('bridge'), true)
  assert.equal(registry.send('bridge', { type: 'reconcile-now' }), true)
})
