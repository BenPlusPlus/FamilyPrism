import assert from 'node:assert/strict'
import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'

import { WebSocket } from 'ws'

import { createNetworkDevice, loadNetworkOverview } from '../data/network-devices.ts'
import { getRouterBridge, registerRouterBridge } from '../data/router-bridges.ts'
import { routes } from '../routes.ts'
import { closeTestPersistence, installTestPersistence } from '../../test/persistence.ts'
import { parseBridgeMessage } from './bridge-socket.ts'
import { attachRealtimeServer } from './server.ts'

test.after(async () => {
  await closeTestPersistence()
})

const raw = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8')

test('a reconcile report is read with its table, device failures, and router failure', () => {
  let message = parseBridgeMessage(
    raw({
      deviceErrors: [{ code: 'protected-mac', deviceId: 'd1', message: '  ' }],
      entries: [{ mac: '3C-A9-F4-10-20-AB', name: 'Switch_Lan' }],
      error: { code: 'router-busy', message: 'Another admin is signed in.' },
      type: 'reconcile-report',
    }),
  )

  assert.deepEqual(message, {
    report: {
      deviceErrors: [{ code: 'protected-mac', deviceId: 'd1', message: null }],
      entries: [{ mac: '3C-A9-F4-10-20-AB', name: 'Switch_Lan' }],
      error: { code: 'router-busy', message: 'Another admin is signed in.' },
    },
    type: 'reconcile-report',
  })
})

test('a report that could not read the table keeps entries null', () => {
  let message = parseBridgeMessage(raw({ error: { code: 'login-failed' }, type: 'reconcile-report' }))

  assert.equal(message?.type, 'reconcile-report')
  assert.equal(message?.type === 'reconcile-report' ? message.report.entries : 'unexpected', null)
})

test('a device error with a JSON null message is kept, as the installed bridge sends', () => {
  let message = parseBridgeMessage(
    raw({
      deviceErrors: [{ code: 'protected-mac', deviceId: 'd1', message: null }],
      entries: [{ mac: '7C-BB-8A-B3-EB-73', name: 'Switch_Annalise' }],
      error: null,
      type: 'reconcile-report',
    }),
  )

  assert.equal(message?.type, 'reconcile-report')
  assert.deepEqual(message?.type === 'reconcile-report' ? message.report.deviceErrors : null, [
    { code: 'protected-mac', deviceId: 'd1', message: null },
  ])
  assert.equal(message?.type === 'reconcile-report' ? message.report.error : 'unexpected', null)
})

test('unknown failure codes and oversized tables are rejected', () => {
  assert.equal(parseBridgeMessage(raw({ error: { code: 'on-fire' }, type: 'reconcile-report' })), null)

  let entries = Array.from({ length: 501 }, (_, index) => ({
    mac: `02-00-00-00-${String(Math.floor(index / 100)).padStart(2, '0')}-${String(index % 100).padStart(2, '0')}`,
    name: `n${index}`,
  }))
  assert.equal(parseBridgeMessage(raw({ entries, type: 'reconcile-report' })), null)
})

/** A real HTTP server and websocket, with the app's own upgrade handling and an in-memory database. */
async function startServer() {
  await installTestPersistence()
  let server = http.createServer()
  attachRealtimeServer(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  let { port } = server.address() as AddressInfo
  return {
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
    url: `ws://127.0.0.1:${port}${routes.bridgeWebsocket.href()}`,
  }
}

/** Buffers every message from the start, so none is missed between awaits. */
function inbox(socket: WebSocket) {
  let queued: Array<Record<string, unknown>> = []
  let waiting: Array<(message: Record<string, unknown>) => void> = []
  socket.on('message', (data) => {
    let message = JSON.parse(data.toString()) as Record<string, unknown>
    let next = waiting.shift()
    if (next) {
      next(message)
    } else {
      queued.push(message)
    }
  })

  return () =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      let queuedMessage = queued.shift()
      if (queuedMessage) {
        resolve(queuedMessage)
        return
      }
      let timer = setTimeout(() => reject(new Error('No message from the server.')), 3000)
      waiting.push((message) => {
        clearTimeout(timer)
        resolve(message)
      })
    })
}

async function until(check: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await check()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.fail('condition never became true')
}

test('a bridge connects, gets the desired state, and its report shows on the device', async () => {
  let server = await startServer()
  let { bridge, credential } = await registerRouterBridge('Office PC')
  await createNetworkDevice({ mac: '3C:a9:F4:10:20:ab', name: 'Switch', standingAccess: 'blocked' })

  let socket = new WebSocket(server.url, {
    headers: { authorization: `Bearer ${credential}`, 'x-bridge-id': bridge.id },
  })
  let nextMessage = inbox(socket)
  try {
    assert.equal((await nextMessage()).type, 'connected')
    let desired = await nextMessage()
    assert.equal(desired.type, 'desired-state')
    assert.deepEqual(
      (desired.devices as Array<{ macs: string[]; standing: string }>).map((device) => [device.macs, device.standing]),
      [[['3C-A9-F4-10-20-AB'], 'blocked']],
    )

    socket.send(JSON.stringify({ routerModel: 'TL-R600VPN v4', type: 'identify', version: '0.1.0' }))
    socket.send(
      JSON.stringify({
        entries: [
          { mac: '3C-a9-F4-10-20-ab', name: 'Switch' },
          { mac: 'B6-12-34-56-78-9B', name: 'Switch_Alex_Lan' },
        ],
        type: 'reconcile-report',
      }),
    )

    await until(async () => (await getRouterBridge())?.last_reconciled_at != null)
    let overview = await loadNetworkOverview()
    assert.equal(overview.bridge?.routerModel, 'TL-R600VPN v4')
    assert.equal(overview.devices[0]?.status.kind, 'blocked')
    assert.deepEqual(overview.unmanaged.map((entry) => entry.mac), ['B6-12-34-56-78-9B'])
  } finally {
    socket.terminate()
    await server.close()
  }
})

test('a bridge with the wrong credential is turned away', async () => {
  let server = await startServer()
  let { bridge } = await registerRouterBridge('Office PC')

  let socket = new WebSocket(server.url, {
    headers: { authorization: 'Bearer rb_wrong', 'x-bridge-id': bridge.id },
  })
  socket.on('error', () => {})
  try {
    let status = await new Promise<number>((resolve, reject) => {
      socket.once('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0))
      socket.once('open', () => reject(new Error('Opened with a bad credential.')))
    })
    assert.equal(status, 401)
  } finally {
    await server.close()
  }
})
