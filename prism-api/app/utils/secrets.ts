import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

let scrypt = promisify(scryptCallback)

export function generateId() {
  return randomUUID()
}

export function generateOpaqueSecret(bytes: number) {
  return randomBytes(bytes).toString('base64url')
}

export async function hashSecret(secret: string, salt: string) {
  let derived = (await scrypt(secret, salt, 64)) as Buffer
  return Buffer.from(derived).toString('base64url')
}

export async function verifySecret(secret: string, salt: string, expectedHash: string) {
  let derived = (await scrypt(secret, salt, 64)) as Buffer
  let actual = Buffer.from(derived)
  let expected = Buffer.from(expectedHash, 'base64url')

  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

