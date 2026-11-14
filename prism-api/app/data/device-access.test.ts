import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDesiredState,
  deviceStatus,
  effectiveAccess,
  InvalidMacAddressError,
  isPrivateWifiMac,
  normalizeMac,
  unmanagedEntries,
  type BridgeView,
  type StatusDevice,
} from './device-access.ts'

const SWITCH_LAN = '3C-A9-F4-10-20-AB'
const SWITCH_WIFI = '3C-A9-F4-10-20-9E'
const changedAt = '2026-11-15T10:00:00.000Z'
const before = '2026-11-15T09:59:00.000Z'
const after = '2026-11-15T10:00:05.000Z'
const now = new Date('2026-11-15T10:01:00.000Z')

function device(overrides: Partial<StatusDevice> = {}): StatusDevice {
  return {
    access_changed_at: changedAt,
    id: 'switch',
    macs: [SWITCH_LAN, SWITCH_WIFI],
    standing_access: 'blocked',
    timed_access: null,
    timed_expires_at: null,
    ...overrides,
  }
}

function bridge(overrides: Partial<BridgeView> = {}): BridgeView {
  return {
    connected: true,
    deviceErrors: [],
    lastError: null,
    lastErrorCode: null,
    lastReconciledAt: after,
    routerEntries: [
      { mac: SWITCH_LAN, name: 'Switch_Lan' },
      { mac: SWITCH_WIFI, name: 'Switch_Wifi' },
    ],
    ...overrides,
  }
}

test('normalizeMac accepts the usual spellings and returns the router form', () => {
  for (let input of ['3C:a9:F4:10:20:ab', '3C-A9-F4-10-20-AB', ' 3Ca9.F410.20ab ', '3CA9F41020AB']) {
    assert.equal(normalizeMac(input), SWITCH_LAN)
  }
})

test('normalizeMac refuses addresses no single device can have', () => {
  assert.throws(() => normalizeMac('01-00-5E-00-00-FB'), InvalidMacAddressError) // multicast
  assert.throws(() => normalizeMac('FF-FF-FF-FF-FF-FF'), InvalidMacAddressError) // broadcast
  assert.throws(() => normalizeMac('00-00-00-00-00-00'), InvalidMacAddressError)
  assert.throws(() => normalizeMac('3C-A9-F4-10-20'), InvalidMacAddressError)
  assert.throws(() => normalizeMac('3C-A9-F4-10-20-AG'), InvalidMacAddressError)
})

test('a private Wi-Fi address is recognized by its locally administered bit', () => {
  assert.equal(isPrivateWifiMac('FA-12-34-56-78-9A'), true)
  assert.equal(isPrivateWifiMac('B6-12-34-56-78-9B'), true)
  assert.equal(isPrivateWifiMac(SWITCH_LAN), false)
})

test('a timed change wins until its deadline, then standing access returns', () => {
  let allowedForNow = device({ timed_access: 'allowed', timed_expires_at: '2026-11-15T10:30:00.000Z' })

  assert.equal(effectiveAccess(allowedForNow, new Date('2026-11-15T10:29:59.000Z')), 'allowed')
  assert.equal(effectiveAccess(allowedForNow, new Date('2026-11-15T10:30:00.000Z')), 'blocked')
})

test('a device matches the router only when a report arrived after its last change', () => {
  assert.equal(deviceStatus(device(), bridge(), now).kind, 'blocked')

  let stale = deviceStatus(device(), bridge({ lastReconciledAt: before }), now)
  assert.equal(stale.kind, 'waiting')
})

test('a console with only one of its two addresses in the table is partly blocked, not blocked', () => {
  let status = deviceStatus(
    device(),
    bridge({ routerEntries: [{ mac: SWITCH_LAN, name: 'Switch_Lan' }] }),
    now,
  )

  assert.equal(status.kind, 'waiting')
  assert.equal(status.detail, 'Only some of its addresses are blocked right now.')
})

test('a failure the bridge reported for the device explains a mismatch', () => {
  let status = deviceStatus(
    device(),
    bridge({
      deviceErrors: [{ code: 'table-full', deviceId: 'switch', message: null }],
      routerEntries: [],
    }),
    now,
  )

  assert.equal(status.kind, 'failed')
  assert.equal(status.label, "Couldn't block")
  assert.equal(status.detail, "The router's filter table is full.")
})

test('a router-level failure shows on devices that are out of step, but not on ones already right', () => {
  let failing = bridge({ lastError: null, lastErrorCode: 'login-failed', routerEntries: [] })
  let outOfStep = deviceStatus(device(), failing, now)
  assert.equal(outOfStep.kind, 'failed')
  assert.equal(outOfStep.label, "Couldn't reach the router")
  assert.match(outOfStep.detail ?? '', /stopped trying/)

  let alreadyAllowed = deviceStatus(device({ macs: ['02-FA-11-00-00-01'], standing_access: 'allowed' }), failing, now)
  assert.equal(alreadyAllowed.kind, 'allowed')
})

test('when a timed allow ends before the bridge reports, the device waits instead of claiming allowed', () => {
  let ended = device({ timed_access: 'allowed', timed_expires_at: '2026-11-15T10:00:30.000Z' })
  let status = deviceStatus(ended, bridge({ routerEntries: [] }), now)

  assert.equal(status.kind, 'waiting')
})

test('an offline bridge says the router catches up when it reconnects', () => {
  let status = deviceStatus(device(), bridge({ connected: false, lastReconciledAt: before }), now)

  assert.equal(status.kind, 'waiting')
  assert.equal(status.detail, 'The Router bridge is offline. It catches up when it reconnects.')
})

test('desired state carries every address and leaves out ended time limits', () => {
  let state = buildDesiredState(
    [
      { ...device(), name: 'Switch' },
      {
        ...device({
          id: 'ipad',
          macs: ['FA-12-34-56-78-9A'],
          timed_access: 'allowed',
          timed_expires_at: '2026-11-15T10:00:59.000Z',
        }),
        name: 'iPad',
      },
      {
        ...device({
          id: 'tv',
          macs: ['B6-12-34-56-78-9B'],
          timed_access: 'allowed',
          timed_expires_at: '2026-11-15T10:20:00.000Z',
        }),
        name: 'TV',
      },
    ],
    now,
  )

  assert.deepEqual(state.devices.map((entry) => entry.macs), [
    [SWITCH_LAN, SWITCH_WIFI],
    ['FA-12-34-56-78-9A'],
    ['B6-12-34-56-78-9B'],
  ])
  assert.equal(state.devices[1].timed, null)
  assert.deepEqual(state.devices[2].timed, { access: 'allowed', expiresAt: '2026-11-15T10:20:00.000Z' })
  assert.equal(state.serverTime, now.toISOString())
})

test('entries for addresses no device owns are unmanaged, whatever their letter case', () => {
  let entries = [
    { mac: SWITCH_LAN, name: 'Switch_Lan' },
    { mac: 'fa-12-34-56-78-9A', name: 'iPad_Kids' },
  ]

  assert.deepEqual(unmanagedEntries(entries, ['FA-12-34-56-78-9A']), [entries[0]])
  assert.deepEqual(unmanagedEntries(null, []), [])
})
