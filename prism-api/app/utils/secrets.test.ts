import assert from 'node:assert/strict'
import test from 'node:test'

import { generateOpaqueSecret, hashSecret, verifySecret } from './secrets.ts'

test('generateOpaqueSecret creates a non-empty token', () => {
  let secret = generateOpaqueSecret(24)
  assert.ok(secret.length > 0)
})

test('verifySecret accepts the matching secret and rejects a different one', async () => {
  let secret = 'super-secret-value'
  let salt = generateOpaqueSecret(12)
  let hash = await hashSecret(secret, salt)

  assert.equal(await verifySecret(secret, salt, hash), true)
  assert.equal(await verifySecret('different-secret', salt, hash), false)
})

