import assert from 'node:assert/strict'
import test from 'node:test'

import type { WebSocket } from 'ws'

import { registerClient, updateClientLastSeenVersion } from '../../data/clients.ts'
import { getLatestDnsState, recordDnsDirectiveResult } from '../../data/dns-directives.ts'
import { createDnsProfile, listDnsProfiles, NO_INTERNET_PROFILE } from '../../data/dns-profiles.ts'
import { connectionRegistry, type ApplyDnsPayload } from '../../realtime/registry.ts'
import { router } from '../../router.ts'
import { routes } from '../../routes.ts'
import { cookieHeaderFrom, formRequest, jsonRequest } from '../../../test/http.ts'
import { closeTestPersistence, installTestPersistence } from '../../../test/persistence.ts'

test.after(async () => {
  await closeTestPersistence()
})

interface Household {
  adminCookie: string
  clientId: string
  /** apply-dns messages the connected Client received, oldest first. */
  sent: ApplyDnsPayload[]
  disconnect(): void
}

/** A Console admin and one connected Client reporting the given version. */
async function setUpHousehold(clientVersion: string): Promise<Household> {
  await installTestPersistence()
  let setup = await router.fetch(
    formRequest(routes.auth.setup.action.href(), {
      email: 'console-admin@example.com',
      name: 'Console Admin',
      password: 'password123',
    }),
  )

  let { client } = await registerClient('Den PC')
  await updateClientLastSeenVersion(client.id, clientVersion)

  let sent: ApplyDnsPayload[] = []
  let socket = {
    close() {},
    readyState: 1,
    send(payload: string) {
      sent.push(JSON.parse(payload) as ApplyDnsPayload)
    },
  } as unknown as WebSocket
  connectionRegistry.register(client.id, socket)

  return {
    adminCookie: cookieHeaderFrom(setup),
    clientId: client.id,
    disconnect: () => connectionRegistry.unregister(client.id, socket),
    sent,
  }
}

function apply(household: Household, profileId: string, durationMinutes = '') {
  return router.fetch(
    formRequest(
      routes.admin.clients.applyDns.href({ clientId: household.clientId }),
      { durationMinutes, profileId },
      { headers: { cookie: household.adminCookie } },
    ),
  )
}

function noticeOf(response: Response) {
  return new URL(response.headers.get('location') ?? '', 'http://x').searchParams.get('notice')
}

test('No internet is refused for a Client too old to block, and the picker says why', async () => {
  let household = await setUpHousehold('0.1.9')
  try {
    let response = await apply(household, NO_INTERNET_PROFILE.id)

    assert.equal(response.status, 302)
    assert.equal(noticeOf(response), 'No internet needs client v0.1.10 or newer.')
    assert.equal(await getLatestDnsState(household.clientId), null)
    assert.deepEqual(household.sent, [])

    let page = await router.fetch(
      jsonRequest(routes.admin.clients.detail.href({ clientId: household.clientId }), {
        headers: { cookie: household.adminCookie },
      }),
    )
    assert.match(await page.text(), /<option[^>]*disabled[^>]*>No internet \(needs client v0\.1\.10\)/)
  } finally {
    household.disconnect()
  }
})

test('timed No internet blocks without DNS servers and returns to the standing profile', async () => {
  let household = await setUpHousehold('0.1.10')
  try {
    let family = await createDnsProfile({ name: 'Family', primaryIp: '1.1.1.3', secondaryIp: '1.0.0.3' })
    await apply(household, family.id)

    let response = await apply(household, NO_INTERNET_PROFILE.id, '30')

    assert.equal(noticeOf(response), 'No internet sent to this PC for 30 minutes.')
    let block = household.sent.at(-1)
    assert.ok(block)
    assert.equal(block.blockInternet, true)
    assert.equal(block.primaryIp, null)
    assert.equal(block.resetToDhcp, false)
    assert.ok(block.expiresAt)
    assert.deepEqual(block.standing, {
      blockInternet: false,
      primaryIp: '1.1.1.3',
      profileName: 'Family',
      resetToDhcp: false,
      secondaryIp: '1.0.0.3',
    })
    assert.equal((await getLatestDnsState(household.clientId))?.directive_kind, 'block')
  } finally {
    household.disconnect()
  }
})

test('a timed profile over standing No internet goes back to No internet when it ends', async () => {
  let household = await setUpHousehold('0.1.10')
  try {
    let open = await createDnsProfile({ name: 'Homework', primaryIp: '8.8.8.8', secondaryIp: '' })
    await apply(household, NO_INTERNET_PROFILE.id)
    await apply(household, open.id, '15')

    let overlay = household.sent.at(-1)
    assert.ok(overlay?.restoreCommandId)
    assert.equal(overlay.blockInternet, false)
    assert.equal(overlay.standing?.blockInternet, true)

    // The Client reports that its time limit ran out and standing was put back.
    await recordDnsDirectiveResult({
      clientId: household.clientId,
      commandId: overlay.restoreCommandId,
      status: 'applied',
    })

    let state = await getLatestDnsState(household.clientId)
    assert.equal(state?.directive_kind, 'block')
    assert.equal(state?.status, 'applied')
    assert.equal(state?.expires_at, null)
  } finally {
    household.disconnect()
  }
})

test('an admin cannot create a profile that would shadow No internet', async () => {
  let household = await setUpHousehold('0.1.10')
  try {
    let response = await router.fetch(
      formRequest(
        routes.admin.settings.dnsProfiles.create.href(),
        { name: ' no INTERNET ', primaryIp: '0.0.0.0', secondaryIp: '' },
        { headers: { cookie: household.adminCookie } },
      ),
    )

    assert.equal(noticeOf(response), '"No internet" is built in. Choose another name.')
    assert.deepEqual(await listDnsProfiles(), [])
  } finally {
    household.disconnect()
  }
})
