import assert from 'node:assert/strict'
import test from 'node:test'

import type { WebSocket } from 'ws'

import { bridgeRegistry } from '../realtime/bridge-registry.ts'
import { closeTestPersistence, installTestPersistence } from '../../test/persistence.ts'
import type { DesiredStatePayload } from './device-access.ts'
import {
  addNetworkDeviceMac,
  createNetworkDevice,
  deleteNetworkDevice,
  extendTimedAccess,
  InvalidNetworkDeviceError,
  loadNetworkOverview,
  MacAddressInUseError,
  removeNetworkDeviceMac,
  setStandingAccess,
  startTimedAccess,
} from './network-devices.ts'
import { recordReconcileReport, registerRouterBridge } from './router-bridges.ts'

test.after(async () => {
  await closeTestPersistence()
})

const SWITCH_LAN = '3C-A9-F4-10-20-AB'
const SWITCH_WIFI = '3C-A9-F4-10-20-9E'

/** A registered bridge whose websocket records every desired-state message. */
async function setUp() {
  await installTestPersistence()
  let { bridge } = await registerRouterBridge('Office PC')
  let sent: DesiredStatePayload[] = []
  let socket = {
    close() {},
    readyState: 1,
    send(body: string) {
      let payload = JSON.parse(body)
      if (payload.type === 'desired-state') {
        sent.push(payload)
      }
    },
  } as unknown as WebSocket
  bridgeRegistry.register(bridge.id, socket)
  return {
    bridgeId: bridge.id,
    disconnect: () => bridgeRegistry.unregister(bridge.id, socket),
    sent,
  }
}

test('each change sends the full desired state, and an indefinite change ends a time limit', async () => {
  let household = await setUp()
  try {
    let { result: device } = await createNetworkDevice({
      mac: SWITCH_LAN,
      name: 'Switch',
      standingAccess: 'blocked',
    })
    await addNetworkDeviceMac(device.id, SWITCH_WIFI)

    let timed = await startTimedAccess(device.id, 'allowed', 30)
    assert.equal(timed.delivered, true)
    let during = household.sent.at(-1)?.devices[0]
    assert.deepEqual(during?.macs, [SWITCH_WIFI, SWITCH_LAN])
    assert.equal(during?.standing, 'blocked')
    assert.deepEqual(during?.timed, { access: 'allowed', expiresAt: timed.result.expiresAt })

    await setStandingAccess(device.id, 'allowed')
    let afterwards = household.sent.at(-1)?.devices[0]
    assert.equal(afterwards?.standing, 'allowed')
    assert.equal(afterwards?.timed, null)
  } finally {
    household.disconnect()
  }
})

test('changes still save while the bridge is offline, and say so', async () => {
  let household = await setUp()
  household.disconnect()

  let { delivered, result } = await createNetworkDevice({
    mac: SWITCH_LAN,
    name: 'Switch',
    standingAccess: 'blocked',
  })

  assert.equal(delivered, false)
  let overview = await loadNetworkOverview()
  assert.equal(overview.devices[0]?.id, result.id)
  assert.equal(overview.devices[0]?.status.detail, 'The Router bridge is offline. It catches up when it reconnects.')
})

test('an address belongs to one device, and a device keeps at least one', async () => {
  let household = await setUp()
  try {
    let { result: device } = await createNetworkDevice({ mac: SWITCH_LAN, name: 'Switch', standingAccess: 'allowed' })

    await assert.rejects(
      createNetworkDevice({ mac: '3C:a9:F4:10:20:ab', name: 'Other', standingAccess: 'allowed' }),
      (error: unknown) => error instanceof MacAddressInUseError && error.message.includes('Switch'),
    )
    await assert.rejects(removeNetworkDeviceMac(device.id, SWITCH_LAN), InvalidNetworkDeviceError)
    await assert.rejects(startTimedAccess(device.id, 'allowed', 15), InvalidNetworkDeviceError)
  } finally {
    household.disconnect()
  }
})

test('a failed report without the table never makes an older table count for a newer change', async () => {
  let household = await setUp()
  try {
    let { result: device } = await createNetworkDevice({ mac: SWITCH_LAN, name: 'Switch', standingAccess: 'allowed' })
    await recordReconcileReport(
      household.bridgeId,
      { deviceErrors: [], entries: [], error: null },
      new Date(Date.now() + 1_000),
    )
    assert.equal((await loadNetworkOverview()).devices[0]?.status.kind, 'allowed')

    // Blocked later than that report; the next report failed before reading the table.
    await setStandingAccess(device.id, 'blocked')
    await recordReconcileReport(
      household.bridgeId,
      { deviceErrors: [], entries: null, error: { code: 'router-busy', message: null } },
      new Date(Date.now() + 5_000),
    )

    let overview = await loadNetworkOverview(new Date(Date.now() + 6_000))
    assert.equal(overview.devices[0]?.status.kind, 'failed')
    assert.equal(overview.devices[0]?.status.label, "Couldn't reach the router")
    assert.match(overview.bridge?.error ?? '', /Someone else is signed in/)
  } finally {
    household.disconnect()
  }
})

test('adding time keeps a confirmed device confirmed', async () => {
  let household = await setUp()
  try {
    let { result: device } = await createNetworkDevice({ mac: SWITCH_LAN, name: 'Switch', standingAccess: 'blocked' })
    await startTimedAccess(device.id, 'allowed', 15)
    await recordReconcileReport(
      household.bridgeId,
      { deviceErrors: [], entries: [], error: null },
      new Date(Date.now() + 1_000),
    )

    let { result } = await extendTimedAccess(device.id, 30)
    let overview = await loadNetworkOverview(new Date(Date.now() + 2_000))

    assert.equal(overview.devices[0]?.status.kind, 'allowed')
    assert.equal(overview.devices[0]?.timed?.expiresAt, result.expiresAt)
  } finally {
    household.disconnect()
  }
})

test('removing a blocked device leaves its router entry for an admin to adopt again', async () => {
  let household = await setUp()
  try {
    let { result: device } = await createNetworkDevice({ mac: SWITCH_LAN, name: 'Switch', standingAccess: 'blocked' })
    await recordReconcileReport(
      household.bridgeId,
      { deviceErrors: [], entries: [{ mac: SWITCH_LAN, name: 'Switch' }], error: null },
      new Date(Date.now() + 1_000),
    )

    await deleteNetworkDevice(device.id)

    let overview = await loadNetworkOverview()
    assert.deepEqual(overview.devices, [])
    assert.deepEqual(overview.unmanaged, [{ mac: SWITCH_LAN, name: 'Switch', suggestedName: 'Switch' }])
    assert.deepEqual(household.sent.at(-1)?.devices, [])
  } finally {
    household.disconnect()
  }
})
