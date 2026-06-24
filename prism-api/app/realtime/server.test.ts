import assert from 'node:assert/strict'
import test from 'node:test'

import { handleClientMessage, parseClientMessage } from './server.ts'

test('parseClientMessage reads identify payloads from websocket data', () => {
  let message = parseClientMessage(Buffer.from('{"type":"identify","windowsUser":" DOMAIN\\\\Ben "}', 'utf8'))

  assert.deepEqual(message, {
    type: 'identify',
    windowsUser: 'DOMAIN\\Ben',
  })
})

test('handleClientMessage persists the last user from identify payloads', async () => {
  let updates: Array<{ clientId: string; lastUser: string }> = []

  let handled = await handleClientMessage(
    'client-1',
    Buffer.from('{"type":"identify","windowsUser":"DOMAIN\\\\Ben"}', 'utf8'),
    async (clientId, lastUser) => {
      updates.push({ clientId, lastUser })
    },
  )

  assert.equal(handled, true)
  assert.deepEqual(updates, [
    {
      clientId: 'client-1',
      lastUser: 'DOMAIN\\Ben',
    },
  ])
})

test('handleClientMessage ignores malformed or unsupported payloads', async () => {
  let updateCount = 0
  let updateLastUser = async () => {
    updateCount += 1
  }

  assert.equal(
    await handleClientMessage('client-1', Buffer.from('{', 'utf8'), updateLastUser),
    false,
  )
  assert.equal(
    await handleClientMessage(
      'client-1',
      Buffer.from('{"type":"display-message","text":"hello"}', 'utf8'),
      updateLastUser,
    ),
    false,
  )
  assert.equal(
    await handleClientMessage(
      'client-1',
      Buffer.from('{"type":"identify","windowsUser":"   "}', 'utf8'),
      updateLastUser,
    ),
    false,
  )
  assert.equal(updateCount, 0)
})
