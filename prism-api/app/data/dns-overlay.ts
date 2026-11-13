import { formatDnsRemaining } from '../assets/dns-remaining.ts'
import { compareClientVersions, normalizeClientVersion } from './client-package.ts'

export { formatDnsRemaining }

export type DnsDirectiveStatus = 'pending' | 'delivered' | 'applied' | 'failed'

export const DNS_OVERLAY_MIN_CLIENT_VERSION = '0.1.6'

/** First Client release whose Service can turn No internet on and off. */
export const NO_INTERNET_MIN_CLIENT_VERSION = '0.1.10'

export const DNS_OVERLAY_PRESET_MINUTES = [5, 15, 30, 60] as const

export type DnsOverlayPresetMinutes = (typeof DNS_OVERLAY_PRESET_MINUTES)[number]

export type DnsStandingKind = 'profile' | 'reset' | 'block'

export interface DnsStandingSnapshot {
  completedAt: string | null
  issuedAt: string
  kind: DnsStandingKind
  primaryIp: string | null
  profileName: string | null
  secondaryIp: string | null
  status: DnsDirectiveStatus
}

export interface DnsStateStandingFields {
  completed_at: string | null
  directive_kind: string
  error?: string | null
  expires_at?: string | null
  issued_at: string
  primary_ip: string | null
  profile_name: string | null
  restore_command_id: string | null
  secondary_ip: string | null
  standing_completed_at: string | null
  standing_issued_at: string | null
  standing_kind: string | null
  standing_primary_ip: string | null
  standing_profile_name: string | null
  standing_secondary_ip: string | null
  standing_status: string | null
  status: string
}

export function clientSupportsDnsOverlay(lastSeenVersion: string | null | undefined) {
  let version = normalizeClientVersion(lastSeenVersion)
  if (!version) {
    return false
  }

  return compareClientVersions(version, DNS_OVERLAY_MIN_CLIENT_VERSION) >= 0
}

export function clientSupportsNoInternet(lastSeenVersion: string | null | undefined) {
  let version = normalizeClientVersion(lastSeenVersion)
  if (!version) {
    return false
  }

  return compareClientVersions(version, NO_INTERNET_MIN_CLIENT_VERSION) >= 0
}

export function parseDnsOverlayMinutes(value: string | null | undefined) {
  let trimmed = value?.trim() ?? ''
  if (!trimmed) {
    return null
  }

  let minutes = Number.parseInt(trimmed, 10)
  if (
    !Number.isInteger(minutes) ||
    !DNS_OVERLAY_PRESET_MINUTES.includes(minutes as DnsOverlayPresetMinutes)
  ) {
    return undefined
  }

  return minutes as DnsOverlayPresetMinutes
}

export function overlayDeadlineIso(issuedAt: Date, minutes: DnsOverlayPresetMinutes) {
  return new Date(issuedAt.getTime() + minutes * 60_000).toISOString()
}

export function overlayRemainingMs(expiresAt: string | null | undefined, now: Date = new Date()) {
  if (!expiresAt) {
    return 0
  }

  return Math.max(0, Date.parse(expiresAt) - now.getTime())
}

export function isDnsOverlayActive(
  state: {
    expires_at?: string | null
    status: string
  } | null | undefined,
  now: Date = new Date(),
) {
  if (!state?.expires_at || state.status === 'failed') {
    return false
  }

  return overlayRemainingMs(state.expires_at, now) > 0
}

export function addOverlayMinutes(expiresAt: string, minutes: DnsOverlayPresetMinutes) {
  return new Date(Date.parse(expiresAt) + minutes * 60_000).toISOString()
}

export function captureStandingSnapshot(
  state: DnsStateStandingFields | null,
): DnsStandingSnapshot | null {
  if (!state) {
    return null
  }

  if (state.restore_command_id) {
    if (!state.standing_kind) {
      return null
    }

    return {
      completedAt: state.standing_completed_at,
      issuedAt: state.standing_issued_at ?? state.issued_at,
      kind: state.standing_kind as DnsStandingKind,
      primaryIp: state.standing_primary_ip,
      profileName: state.standing_profile_name,
      secondaryIp: state.standing_secondary_ip,
      status: (state.standing_status as DnsDirectiveStatus | null) ?? 'applied',
    }
  }

  return {
    completedAt: state.completed_at,
    issuedAt: state.issued_at,
    kind: state.directive_kind as DnsStandingKind,
    primaryIp: state.primary_ip,
    profileName: state.profile_name,
    secondaryIp: state.secondary_ip,
    status: state.status as DnsDirectiveStatus,
  }
}

export function standingColumns(standing: DnsStandingSnapshot | null) {
  return {
    standing_completed_at: standing?.completedAt ?? null,
    standing_issued_at: standing?.issuedAt ?? null,
    standing_kind: standing?.kind ?? null,
    standing_primary_ip: standing?.primaryIp ?? null,
    standing_profile_name: standing?.profileName ?? null,
    standing_secondary_ip: standing?.secondaryIp ?? null,
    standing_status: standing?.status ?? null,
  }
}

export function presentClientDnsState(state: DnsStateStandingFields | null, now: Date = new Date()) {
  if (!state) {
    return null
  }

  let overlayActive = isDnsOverlayActive(state, now)
  let remainingMs = overlayActive ? overlayRemainingMs(state.expires_at, now) : 0

  if (overlayActive || state.status === 'failed' || !state.restore_command_id) {
    return {
      ...state,
      overlayActive,
      remainingMs,
      awaitingRestore: false,
      windowsDefault: false,
    }
  }

  let standing = captureStandingSnapshot(state)
  if (!standing) {
    return {
      ...state,
      overlayActive: false,
      remainingMs: 0,
      awaitingRestore: state.status === 'applied',
      windowsDefault: true,
      directive_kind: 'reset' as const,
      profile_name: null,
      primary_ip: null,
      secondary_ip: null,
    }
  }

  return {
    ...state,
    overlayActive: false,
    remainingMs: 0,
    awaitingRestore: state.status === 'applied',
    windowsDefault: false,
    completed_at: standing.completedAt,
    directive_kind: standing.kind,
    issued_at: standing.issuedAt,
    primary_ip: standing.primaryIp,
    profile_name: standing.profileName,
    secondary_ip: standing.secondaryIp,
    status: standing.status as DnsDirectiveStatus,
    error: null,
  }
}
