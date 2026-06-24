import type { Database, TableRow } from 'remix/data-table'

import { db } from './database.ts'
import { clientCredentials, clientGroupMemberships, clientGroups, clients } from './schema.ts'
import { generateId, generateOpaqueSecret, hashSecret, verifySecret } from '../utils/secrets.ts'

export class ClientNameConflictError extends Error {
  constructor() {
    super('A client with that name already exists.')
  }
}

export type ClientRow = TableRow<typeof clients>
export type GroupSummary = Pick<TableRow<typeof clientGroups>, 'id' | 'name'>
export type ClientWithGroups = ClientRow & {
  groups: GroupSummary[]
}

async function issueClientCredential(database: Database, clientId: string) {
  let credential = `pc_${generateOpaqueSecret(32)}`
  let credentialSalt = generateOpaqueSecret(16)
  let credentialHash = await hashSecret(credential, credentialSalt)
  let existingCredential = await database.find(clientCredentials, clientId)

  if (existingCredential) {
    await database.update(clientCredentials, clientId, {
      credential_hash: credentialHash,
      credential_salt: credentialSalt,
      last_used_at: null,
    })
  } else {
    await database.create(clientCredentials, {
      client_id: clientId,
      credential_hash: credentialHash,
      credential_salt: credentialSalt,
      last_used_at: null,
    })
  }

  return credential
}

export async function registerClient(name: string, database: Database = db) {
  let normalizedName = name.trim()

  return database.transaction(async (transaction) => {
    let existingClient = await transaction.findOne(clients, {
      where: { name: normalizedName },
    })

    if (existingClient) {
      throw new ClientNameConflictError()
    }

    let client = await transaction.create(
      clients,
      {
        id: generateId(),
        name: normalizedName,
      },
      { returnRow: true },
    )

    let credential = await issueClientCredential(transaction, client.id)

    return {
      client,
      credential,
    }
  })
}

export async function authenticateClient(clientId: string, credential: string, database: Database = db) {
  let [client, storedCredential] = await Promise.all([
    database.find(clients, clientId),
    database.find(clientCredentials, clientId),
  ])

  if (!client || !storedCredential) {
    return null
  }

  let matches = await verifySecret(
    credential,
    storedCredential.credential_salt,
    storedCredential.credential_hash,
  )

  if (!matches) {
    return null
  }

  await database.update(clientCredentials, clientId, {
    last_used_at: new Date().toISOString(),
  })

  return client
}

export async function listClients(database: Database = db) {
  return database.findMany(clients, {
    orderBy: ['name', 'asc'],
  })
}

export async function listClientsWithGroups(database: Database = db): Promise<ClientWithGroups[]> {
  let [allClients, memberships, groups] = await Promise.all([
    database.findMany(clients, { orderBy: ['name', 'asc'] }),
    database.findMany(clientGroupMemberships),
    database.findMany(clientGroups, { orderBy: ['name', 'asc'] }),
  ])

  let groupsById = new Map(groups.map((group) => [group.id, group]))
  let membershipsByClient = new Map<string, GroupSummary[]>()

  for (let membership of memberships) {
    let group = groupsById.get(membership.group_id)
    if (!group) {
      continue
    }

    let clientGroupsForClient = membershipsByClient.get(membership.client_id) ?? []
    clientGroupsForClient.push({ id: group.id, name: group.name })
    membershipsByClient.set(membership.client_id, clientGroupsForClient)
  }

  return allClients.map((client) => ({
    ...client,
    groups: membershipsByClient.get(client.id) ?? [],
  }))
}

export async function updateClientLastUser(
  clientId: string,
  lastUser: string,
  database: Database = db,
) {
  await database.update(clients, clientId, {
    last_user: lastUser,
  })
}

export async function deleteClient(clientId: string, database: Database = db) {
  return database.transaction(async (transaction) => {
    let client = await transaction.find(clients, clientId)
    if (!client) {
      return null
    }

    await transaction.deleteMany(clients, {
      where: { id: clientId },
    })

    return client
  })
}
