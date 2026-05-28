import assert from 'node:assert/strict'
import test from 'node:test'

import { getNotice, withNotice } from './notice.ts'

test('withNotice encodes a success notice into the target URL', () => {
  let href = withNotice(new Request('http://localhost:44100/admin'), '/admin/clients', {
    text: 'Saved successfully',
    type: 'success',
  })

  assert.equal(href, '/admin/clients?notice=Saved+successfully&noticeType=success')
})

test('getNotice returns null when no notice is present', () => {
  let notice = getNotice(new URL('http://localhost:44100/admin'))
  assert.equal(notice, null)
})

test('getNotice parses error notices', () => {
  let notice = getNotice(new URL('http://localhost:44100/admin?notice=Failed&noticeType=error'))

  assert.deepEqual(notice, {
    text: 'Failed',
    type: 'error',
  })
})

