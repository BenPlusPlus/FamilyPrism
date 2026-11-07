import assert from 'node:assert/strict'
import test from 'node:test'

import { expandLoopbackTrustedOrigins } from './trusted-origins.ts'

test('expandLoopbackTrustedOrigins includes localhost, 127.0.0.1, and IPv6 loopback', () => {
  assert.deepEqual(expandLoopbackTrustedOrigins('http://localhost:44100'), [
    'http://localhost:44100',
    'http://127.0.0.1:44100',
    'http://[::1]:44100',
  ])
  assert.deepEqual(expandLoopbackTrustedOrigins('http://127.0.0.1:44100'), [
    'http://localhost:44100',
    'http://127.0.0.1:44100',
    'http://[::1]:44100',
  ])
})

test('expandLoopbackTrustedOrigins leaves non-loopback origins unchanged', () => {
  assert.deepEqual(expandLoopbackTrustedOrigins('https://prism.example'), [
    'https://prism.example',
  ])
})
