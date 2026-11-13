import net from 'node:net'

import type { Database, TableRow } from 'remix/data-table'

import { db } from './database.ts'
import { dnsProfiles } from './schema.ts'
import { generateId } from '../utils/secrets.ts'

/**
 * The built-in No internet profile. It is not a row in dns_profiles: the picker lists it first
 * and applying it issues a 'block' directive. See docs/adr/0005-no-internet-is-a-built-in-profile.md.
 */
export const NO_INTERNET_PROFILE = {
  id: 'builtin:no-internet',
  name: 'No internet',
} as const

export function isNoInternetProfileId(profileId: string) {
  return profileId === NO_INTERNET_PROFILE.id
}

export class DnsProfileNameConflictError extends Error {
  constructor() {
    super('An internet profile with that name already exists.')
  }
}

export class InvalidDnsProfileError extends Error {}

export type DnsProfileRow = TableRow<typeof dnsProfiles>

function validateIpv4Address(value: string, fieldName: string) {
  let trimmed = value.trim()
  if (net.isIP(trimmed) !== 4) {
    throw new InvalidDnsProfileError(`${fieldName} must be a valid IPv4 address.`)
  }

  return trimmed
}

function normalizeProfileInput(input: {
  name: string
  primaryIp: string
  secondaryIp?: string | null
}) {
  let name = input.name.trim()
  if (!name) {
    throw new InvalidDnsProfileError('Internet profile name is required.')
  }

  if (name.toLowerCase() === NO_INTERNET_PROFILE.name.toLowerCase()) {
    throw new InvalidDnsProfileError(`"${NO_INTERNET_PROFILE.name}" is built in. Choose another name.`)
  }

  let secondaryIp = input.secondaryIp?.trim()

  return {
    name,
    primary_ip: validateIpv4Address(input.primaryIp, 'Primary DNS server'),
    secondary_ip: secondaryIp ? validateIpv4Address(secondaryIp, 'Secondary DNS server') : null,
  }
}

export async function listDnsProfiles(database: Database = db) {
  return database.findMany(dnsProfiles, {
    orderBy: ['name', 'asc'],
  })
}

export async function getDnsProfile(profileId: string, database: Database = db) {
  return database.find(dnsProfiles, profileId)
}

export async function createDnsProfile(
  input: {
    name: string
    primaryIp: string
    secondaryIp?: string | null
  },
  database: Database = db,
) {
  let normalized = normalizeProfileInput(input)

  return database.transaction(async (transaction) => {
    let existingProfile = await transaction.findOne(dnsProfiles, {
      where: { name: normalized.name },
    })

    if (existingProfile) {
      throw new DnsProfileNameConflictError()
    }

    return transaction.create(
      dnsProfiles,
      {
        id: generateId(),
        ...normalized,
      },
      { returnRow: true },
    )
  })
}

export async function updateDnsProfile(
  profileId: string,
  input: {
    name: string
    primaryIp: string
    secondaryIp?: string | null
  },
  database: Database = db,
) {
  let normalized = normalizeProfileInput(input)

  return database.transaction(async (transaction) => {
    let profile = await transaction.find(dnsProfiles, profileId)
    if (!profile) {
      return null
    }

    let existingProfile = await transaction.findOne(dnsProfiles, {
      where: { name: normalized.name },
    })

    if (existingProfile && existingProfile.id !== profileId) {
      throw new DnsProfileNameConflictError()
    }

    await transaction.update(dnsProfiles, profileId, normalized)
    return transaction.find(dnsProfiles, profileId)
  })
}

export async function deleteDnsProfile(profileId: string, database: Database = db) {
  return database.transaction(async (transaction) => {
    let profile = await transaction.find(dnsProfiles, profileId)
    if (!profile) {
      return null
    }

    await transaction.deleteMany(dnsProfiles, {
      where: { id: profileId },
    })

    return profile
  })
}
