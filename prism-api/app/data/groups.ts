import type { Database, TableRow } from 'remix/data-table'

import { db } from './database.ts'
import { clientGroupMemberships, clientGroups, clients } from './schema.ts'
import { generateId } from '../utils/secrets.ts'

export class GroupNameConflictError extends Error {
  constructor() {
    super('A group with that name already exists.')
  }
}

export type GroupRow = TableRow<typeof clientGroups>
export type GroupWithMembers = GroupRow & {
  members: TableRow<typeof clients>[]
}

function uniqueClientIds(clientIds: string[]) {
  return [...new Set(clientIds.filter(Boolean))]
}

export async function listGroups(database: Database = db) {
  return database.findMany(clientGroups, {
    orderBy: ['name', 'asc'],
  })
}

export async function listGroupsWithMembers(database: Database = db): Promise<GroupWithMembers[]> {
  let [groups, memberships, allClients] = await Promise.all([
    database.findMany(clientGroups, { orderBy: ['name', 'asc'] }),
    database.findMany(clientGroupMemberships),
    database.findMany(clients, { orderBy: ['name', 'asc'] }),
  ])

  let clientsById = new Map(allClients.map((client) => [client.id, client]))
  let membershipsByGroup = new Map<string, TableRow<typeof clients>[]>()

  for (let membership of memberships) {
    let client = clientsById.get(membership.client_id)
    if (!client) {
      continue
    }

    let members = membershipsByGroup.get(membership.group_id) ?? []
    members.push(client)
    membershipsByGroup.set(membership.group_id, members)
  }

  return groups.map((group) => ({
    ...group,
    members: membershipsByGroup.get(group.id) ?? [],
  }))
}

export async function createGroup(
  input: {
    clientIds: string[]
    description?: string
    name: string
  },
  database: Database = db,
) {
  let normalizedName = input.name.trim()

  return database.transaction(async (transaction) => {
    let existingGroup = await transaction.findOne(clientGroups, {
      where: { name: normalizedName },
    })

    if (existingGroup) {
      throw new GroupNameConflictError()
    }

    let group = await transaction.create(
      clientGroups,
      {
        description: input.description?.trim() || null,
        id: generateId(),
        name: normalizedName,
      },
      { returnRow: true },
    )

    let selectedClientIds = uniqueClientIds(input.clientIds)

    if (selectedClientIds.length > 0) {
      await transaction.createMany(
        clientGroupMemberships,
        selectedClientIds.map((clientId) => ({
          client_id: clientId,
          group_id: group.id,
        })),
      )
    }

    return group
  })
}

export async function replaceGroupMembers(groupId: string, clientIds: string[], database: Database = db) {
  return database.transaction(async (transaction) => {
    let group = await transaction.find(clientGroups, groupId)
    if (!group) {
      return null
    }

    await transaction.deleteMany(clientGroupMemberships, {
      where: { group_id: groupId },
    })

    let selectedClientIds = uniqueClientIds(clientIds)

    if (selectedClientIds.length > 0) {
      await transaction.createMany(
        clientGroupMemberships,
        selectedClientIds.map((clientId) => ({
          client_id: clientId,
          group_id: groupId,
        })),
      )
    }

    return group
  })
}

export async function getGroupClientIds(groupId: string, database: Database = db) {
  let memberships = await database.findMany(clientGroupMemberships, {
    where: { group_id: groupId },
  })

  return memberships.map((membership) => membership.client_id)
}

