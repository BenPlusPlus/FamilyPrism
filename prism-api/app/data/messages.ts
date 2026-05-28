import type { Database, TableRow } from 'remix/data-table'

import { connectionRegistry } from '../realtime/registry.ts'
import { db } from './database.ts'
import { getGroupClientIds } from './groups.ts'
import { clientGroups, clients, messageDeliveries, messages } from './schema.ts'
import { generateId } from '../utils/secrets.ts'

export class MessageTargetNotFoundError extends Error {
  constructor(message: string) {
    super(message)
  }
}

export type MessageRow = TableRow<typeof messages>

async function dispatchMessage(
  input: {
    content: string
    senderAdminUserId: string
    targetClientIds: string[]
    targetId: string
    targetType: 'client' | 'group'
  },
  database: Database = db,
) {
  return database.transaction(async (transaction) => {
    let uniqueClientIds = [...new Set(input.targetClientIds)]
    let message = await transaction.create(
      messages,
      {
        content: input.content,
        delivered_live_count: 0,
        id: generateId(),
        sender_admin_user_id: input.senderAdminUserId,
        target_id: input.targetId,
        target_type: input.targetType,
      },
      { returnRow: true },
    )

    let deliveredLiveCount = 0

    if (uniqueClientIds.length > 0) {
      let deliveries = uniqueClientIds.map((clientId) => {
        let delivered = connectionRegistry.sendDisplayMessage(clientId, {
          messageId: message.id,
          text: input.content,
          type: 'display-message',
        })

        if (delivered) {
          deliveredLiveCount += 1
        }

        return {
          client_id: clientId,
          delivered_at: delivered ? new Date().toISOString() : null,
          id: generateId(),
          message_id: message.id,
          status: delivered ? 'delivered' : 'offline',
        }
      })

      await transaction.createMany(messageDeliveries, deliveries)
    }

    await transaction.update(messages, message.id, {
      delivered_live_count: deliveredLiveCount,
    })

    return {
      deliveredLiveCount,
      message,
      targetCount: uniqueClientIds.length,
    }
  })
}

export async function dispatchTextMessageToClient(
  input: {
    clientId: string
    content: string
    senderAdminUserId: string
  },
  database: Database = db,
) {
  let client = await database.find(clients, input.clientId)
  if (!client) {
    throw new MessageTargetNotFoundError('Client not found.')
  }

  return dispatchMessage(
    {
      content: input.content,
      senderAdminUserId: input.senderAdminUserId,
      targetClientIds: [input.clientId],
      targetId: input.clientId,
      targetType: 'client',
    },
    database,
  )
}

export async function dispatchTextMessageToGroup(
  input: {
    content: string
    groupId: string
    senderAdminUserId: string
  },
  database: Database = db,
) {
  let group = await database.find(clientGroups, input.groupId)
  if (!group) {
    throw new MessageTargetNotFoundError('Group not found.')
  }

  let targetClientIds = await getGroupClientIds(input.groupId, database)

  return dispatchMessage(
    {
      content: input.content,
      senderAdminUserId: input.senderAdminUserId,
      targetClientIds,
      targetId: input.groupId,
      targetType: 'group',
    },
    database,
  )
}

