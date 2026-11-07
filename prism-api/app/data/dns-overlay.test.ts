import assert from 'node:assert/strict'
import test from 'node:test'

import type { DnsStateStandingFields } from './dns-overlay.ts'
import {
  addOverlayMinutes,
  captureStandingSnapshot,
  clientSupportsDnsOverlay,
  DNS_OVERLAY_MIN_CLIENT_VERSION,
  formatDnsRemaining,
  isDnsOverlayActive,
  overlayDeadlineIso,
  overlayRemainingMs,
  parseDnsOverlayMinutes,
  presentClientDnsState,
} from './dns-overlay.ts'

function state(overrides: Partial<DnsStateStandingFields> = {}): DnsStateStandingFields {
  return {
    completed_at: null,
    directive_kind: 'profile',
    error: null,
    expires_at: null,
    issued_at: '2026-03-01T12:00:00.000Z',
    primary_ip: '1.1.1.1',
    profile_name: 'School',
    restore_command_id: null,
    secondary_ip: '1.0.0.1',
    standing_completed_at: null,
    standing_issued_at: null,
    standing_kind: null,
    standing_primary_ip: null,
    standing_profile_name: null,
    standing_secondary_ip: null,
    standing_status: null,
    status: 'applied',
    ...overrides,
  }
}

test('clientSupportsDnsOverlay requires last seen version 0.1.6 or newer', () => {
  assert.equal(clientSupportsDnsOverlay(null), false)
  assert.equal(clientSupportsDnsOverlay('0.1.5'), false)
  assert.equal(clientSupportsDnsOverlay(DNS_OVERLAY_MIN_CLIENT_VERSION), true)
  assert.equal(clientSupportsDnsOverlay('0.2.0'), true)
})

test('parseDnsOverlayMinutes accepts presets and empty as no limit', () => {
  assert.equal(parseDnsOverlayMinutes(''), null)
  assert.equal(parseDnsOverlayMinutes('15'), 15)
  assert.equal(parseDnsOverlayMinutes('7'), undefined)
  assert.equal(parseDnsOverlayMinutes('60'), 60)
})

test('overlay remaining is zero after the issue-time deadline', () => {
  let issued = new Date('2026-03-01T12:00:00.000Z')
  let deadline = overlayDeadlineIso(issued, 5)
  assert.equal(deadline, '2026-03-01T12:05:00.000Z')
  assert.equal(overlayRemainingMs(deadline, new Date('2026-03-01T12:04:59.000Z')), 1000)
  assert.equal(overlayRemainingMs(deadline, new Date('2026-03-01T12:05:00.000Z')), 0)
  assert.equal(overlayRemainingMs(deadline, new Date('2026-03-01T12:20:00.000Z')), 0)
})

test('extend adds the preset to the existing deadline', () => {
  assert.equal(
    addOverlayMinutes('2026-03-01T12:07:00.000Z', 15),
    '2026-03-01T12:22:00.000Z',
  )
})

test('isDnsOverlayActive ignores failed and expired overlays', () => {
  let now = new Date('2026-03-01T12:03:00.000Z')
  assert.equal(
    isDnsOverlayActive(state({ expires_at: '2026-03-01T12:05:00.000Z', status: 'pending' }), now),
    true,
  )
  assert.equal(
    isDnsOverlayActive(state({ expires_at: '2026-03-01T12:05:00.000Z', status: 'failed' }), now),
    false,
  )
  assert.equal(
    isDnsOverlayActive(state({ expires_at: '2026-03-01T12:02:00.000Z', status: 'applied' }), now),
    false,
  )
})

test('captureStandingSnapshot keeps standing DNS when an overlay is already in progress', () => {
  let overlay = state({
    expires_at: '2026-03-01T12:15:00.000Z',
    profile_name: 'Open',
    primary_ip: '8.8.8.8',
    restore_command_id: 'restore-1',
    standing_issued_at: '2026-03-01T11:00:00.000Z',
    standing_kind: 'profile',
    standing_primary_ip: '1.1.1.1',
    standing_profile_name: 'School',
    standing_secondary_ip: '1.0.0.1',
    standing_status: 'applied',
  })

  assert.deepEqual(captureStandingSnapshot(overlay), {
    completedAt: null,
    issuedAt: '2026-03-01T11:00:00.000Z',
    kind: 'profile',
    primaryIp: '1.1.1.1',
    profileName: 'School',
    secondaryIp: '1.0.0.1',
    status: 'applied',
  })
})

test('presentClientDnsState shows standing DNS after an applied overlay expires', () => {
  let presented = presentClientDnsState(
    state({
      expires_at: '2026-03-01T12:05:00.000Z',
      profile_name: 'Open',
      primary_ip: '8.8.8.8',
      restore_command_id: 'restore-1',
      standing_completed_at: '2026-03-01T11:00:05.000Z',
      standing_issued_at: '2026-03-01T11:00:00.000Z',
      standing_kind: 'profile',
      standing_primary_ip: '1.1.1.1',
      standing_profile_name: 'School',
      standing_secondary_ip: '1.0.0.1',
      standing_status: 'applied',
      status: 'applied',
    }),
    new Date('2026-03-01T12:06:00.000Z'),
  )

  assert.equal(presented?.overlayActive, false)
  assert.equal(presented?.awaitingRestore, true)
  assert.equal(presented?.windowsDefault, false)
  assert.equal(presented?.profile_name, 'School')
  assert.equal(presented?.primary_ip, '1.1.1.1')
  assert.equal(presented?.status, 'applied')
})

test('formatDnsRemaining uses minutes and seconds', () => {
  assert.equal(formatDnsRemaining(0), '0 min left')
  assert.equal(formatDnsRemaining(5_000), '5 sec left')
  assert.equal(formatDnsRemaining(60_000), '1 min left')
  assert.equal(formatDnsRemaining(90_000), '1 min 30 sec left')
  assert.equal(formatDnsRemaining(3_600_000), '1 hr left')
})
