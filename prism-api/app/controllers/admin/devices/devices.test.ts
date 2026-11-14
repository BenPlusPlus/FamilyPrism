import assert from 'node:assert/strict'
import test from 'node:test'

import { listNetworkDevices } from '../../../data/network-devices.ts'
import { router } from '../../../router.ts'
import { routes } from '../../../routes.ts'
import { cookieHeaderFrom, formRequest, jsonRequest } from '../../../../test/http.ts'
import { closeTestPersistence, installTestPersistence } from '../../../../test/persistence.ts'

test.after(async () => {
  await closeTestPersistence()
})

interface Household {
  adminCookie: string
  parentCookie: string
}

/** A Console admin and a Parent who joined by invite. */
async function setUpHousehold(): Promise<Household> {
  await installTestPersistence()
  let setup = await router.fetch(
    formRequest(routes.auth.setup.action.href(), {
      email: 'console-admin@example.com',
      name: 'Console Admin',
      password: 'password123',
    }),
  )
  let adminCookie = cookieHeaderFrom(setup)

  let invitePage = await router.fetch(
    formRequest(
      routes.admin.settings.accounts.invite.href(),
      { email: 'parent@example.com', name: 'Pat', role: 'parent' },
      { headers: { cookie: adminCookie } },
    ),
  )
  let link = (await invitePage.text()).match(/value="(https?:\/\/[^"]+\/auth\/invite\/[^"]+)"/)
  assert.ok(link)
  let accepted = await router.fetch(
    formRequest(new URL(link[1]).pathname, { name: 'Pat', password: 'parent-pass-1' }),
  )

  return { adminCookie, parentCookie: cookieHeaderFrom(accepted) }
}

function registerBridge(registrationPassword = 'test-registration-password') {
  return router.fetch(
    jsonRequest(routes.api.bridges.register.href(), {
      body: JSON.stringify({ bridgeName: 'Office PC', registrationPassword }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }),
  )
}

function page(cookie: string, path: string) {
  return router.fetch(jsonRequest(path, { headers: { cookie } }))
}

function post(cookie: string, path: string, fields: Record<string, string>) {
  return router.fetch(formRequest(path, fields, { headers: { cookie } }))
}

function noticeOf(response: Response) {
  return new URL(response.headers.get('location') ?? '', 'http://x').searchParams.get('notice')
}

test('without a Router bridge there is no Devices section', async () => {
  let household = await setUpHousehold()

  let home = await page(household.adminCookie, routes.admin.index.href())
  let html = await home.text()
  assert.doesNotMatch(html, new RegExp(`href="${routes.admin.devices.index.href()}"`))

  let devices = await page(household.adminCookie, routes.admin.devices.index.href())
  assert.equal(devices.status, 302)
  assert.equal(new URL(devices.headers.get('location') ?? '', 'http://x').pathname, routes.admin.index.href())
})

test('one Router bridge can register, with the registration password', async () => {
  await installTestPersistence()

  assert.equal((await registerBridge('wrong')).status, 403)

  let first = await registerBridge()
  assert.equal(first.status, 200)
  let body = (await first.json()) as { credential: string; websocketPath: string }
  assert.match(body.credential, /^rb_/)
  assert.equal(body.websocketPath, routes.bridgeWebsocket.href())

  assert.equal((await registerBridge()).status, 409)
})

test('once a bridge registers, an admin adds devices and a Parent blocks them for a while', async () => {
  let household = await setUpHousehold()
  await registerBridge()

  let added = await post(household.adminCookie, routes.admin.devices.create.href(), {
    access: 'allowed',
    mac: '3C:a9:F4:10:20:ab',
    name: "Sam's Switch",
  })
  assert.equal(noticeOf(added), "Added Sam's Switch (allowed). The Router bridge is offline; the router catches up when it reconnects.")
  let [device] = await listNetworkDevices()
  assert.ok(device)

  let blocked = await post(household.parentCookie, routes.admin.devices.access.href({ deviceId: device.id }), {
    access: 'blocked',
    durationMinutes: '30',
    returnTo: routes.admin.devices.index.href(),
  })
  assert.equal(blocked.status, 302)
  assert.match(noticeOf(blocked) ?? '', /^Blocked for 30 minutes: Sam's Switch\./)
  let [afterBlock] = await listNetworkDevices()
  assert.equal(afterBlock?.timed_access, 'blocked')
  assert.equal(afterBlock?.standing_access, 'allowed')

  let parentList = await page(household.parentCookie, routes.admin.devices.index.href())
  let html = await parentList.text()
  assert.match(html, /Sam&#x27;s Switch|Sam's Switch/)
  assert.doesNotMatch(html, new RegExp(`action="${routes.admin.devices.create.href()}"`))

  let home = await page(household.parentCookie, routes.admin.index.href())
  assert.match(await home.text(), /0 blocked, 0 allowed, 1 on a time limit, 1 waiting for the router\./)
})

test('a Parent cannot add, adopt, rename, or remove devices', async () => {
  let household = await setUpHousehold()
  await registerBridge()
  await post(household.adminCookie, routes.admin.devices.create.href(), {
    access: 'blocked',
    mac: 'FA-12-34-56-78-9A',
    name: 'Kids iPad',
  })
  let [device] = await listNetworkDevices()
  assert.ok(device)
  let ids = { deviceId: device.id }

  let attempts: Array<[string, Record<string, string>]> = [
    [routes.admin.devices.create.href(), { mac: '3C-A9-F4-10-20-9E', name: 'Another' }],
    [routes.admin.devices.adopt.href(), { mac: '3C-A9-F4-10-20-9E', name: 'Another' }],
    [routes.admin.devices.rename.href(ids), { name: 'Renamed' }],
    [routes.admin.devices.addMac.href(ids), { mac: '3C-A9-F4-10-20-9E' }],
    [routes.admin.devices.removeMac.href(ids), { mac: 'FA-12-34-56-78-9A' }],
    [routes.admin.devices.delete.href(ids), {}],
  ]
  for (let [path, fields] of attempts) {
    let response = await post(household.parentCookie, path, fields)
    assert.equal(response.status, 403, path)
  }

  let [unchanged] = await listNetworkDevices()
  assert.equal(unchanged?.name, 'Kids iPad')
  assert.deepEqual(unchanged?.macs, ['FA-12-34-56-78-9A'])

  let parentView = await (await page(household.parentCookie, routes.admin.devices.detail.href(ids))).text()
  assert.match(parentView, /set Private Wi-Fi Address to Fixed/)
  assert.doesNotMatch(parentView, /Danger zone/)
  let adminView = await (await page(household.adminCookie, routes.admin.devices.detail.href(ids))).text()
  assert.match(adminView, /Remove Kids iPad/)
})

test('a mistyped MAC address comes back as a notice, not an error page', async () => {
  let household = await setUpHousehold()
  await registerBridge()

  let response = await post(household.adminCookie, routes.admin.devices.create.href(), {
    mac: '01:00:5e:00:00:fb',
    name: 'Printer',
  })

  assert.equal(response.status, 302)
  assert.match(noticeOf(response) ?? '', /group address/)
  assert.deepEqual(await listNetworkDevices(), [])
})
