import assert from 'node:assert/strict'
import test from 'node:test'

import { handleClientMessage, parseClientMessage } from './server.ts'

test('parseClientMessage reads identify payloads from websocket data', () => {
  let message = parseClientMessage(Buffer.from('{"type":"identify","windowsUser":" DOMAIN\\\\Ben "}', 'utf8'))

  assert.deepEqual(message, {
    type: 'identify',
    version: null,
    windowsUser: 'DOMAIN\\Ben',
  })
})

test('parseClientMessage reads an optional assembly version from identify payloads', () => {
  let message = parseClientMessage(
    Buffer.from('{"type":"identify","windowsUser":"DOMAIN\\\\Ben","version":" 0.1.0 "}', 'utf8'),
  )

  assert.deepEqual(message, {
    type: 'identify',
    version: '0.1.0',
    windowsUser: 'DOMAIN\\Ben',
  })
})

test('handleClientMessage persists the last user from identify payloads', async () => {
  let updates: Array<{ clientId: string; lastUser: string }> = []
  let versions: Array<{ clientId: string; version: string }> = []

  let handled = await handleClientMessage(
    'client-1',
    Buffer.from('{"type":"identify","windowsUser":"DOMAIN\\\\Ben"}', 'utf8'),
    async (clientId, lastUser) => {
      updates.push({ clientId, lastUser })
    },
    async (clientId, version) => {
      versions.push({ clientId, version })
    },
  )

  assert.equal(handled, true)
  assert.deepEqual(updates, [
    {
      clientId: 'client-1',
      lastUser: 'DOMAIN\\Ben',
    },
  ])
  assert.deepEqual(versions, [])
})

test('handleClientMessage persists last_seen_version when identify includes a version', async () => {
  let versions: Array<{ clientId: string; version: string }> = []

  let handled = await handleClientMessage(
    'client-1',
    Buffer.from('{"type":"identify","windowsUser":"DOMAIN\\\\Ben","version":"0.1.0"}', 'utf8'),
    async () => {},
    async (clientId, version) => {
      versions.push({ clientId, version })
    },
  )

  assert.equal(handled, true)
  assert.deepEqual(versions, [
    {
      clientId: 'client-1',
      version: '0.1.0',
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
