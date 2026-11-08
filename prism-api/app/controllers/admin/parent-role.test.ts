import assert from 'node:assert/strict'
import test from 'node:test'

import { getClient, historyCollectionEnabled } from '../../data/clients.ts'
import { getLatestDnsState } from '../../data/dns-directives.ts'
import { createDnsProfile, listDnsProfiles } from '../../data/dns-profiles.ts'
import { listGroupsWithMembers } from '../../data/groups.ts'
import { listHistoryPage } from '../../data/visits.ts'
import { router } from '../../router.ts'
import { routes } from '../../routes.ts'
import { cookieHeaderFrom, formRequest, jsonRequest } from '../../../test/http.ts'
import { closeTestPersistence, installTestPersistence } from '../../../test/persistence.ts'

test.after(async () => {
  await closeTestPersistence()
})

const ADMIN = {
  email: 'console-admin@example.com',
  name: 'Console Admin',
  password: 'password123',
}

interface Household {
  adminCookie: string
  client: { clientId: string; credential: string }
  groupId: string
  parentCookie: string
}

async function registerClient(name: string) {
  let response = await router.fetch(
    jsonRequest(routes.api.clients.register.href(), {
      body: JSON.stringify({
        clientName: name,
        registrationPassword: 'test-registration-password',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }),
  )
  assert.equal(response.status, 200)
  return (await response.json()) as { clientId: string; credential: string }
}

async function postVisit(client: { clientId: string; credential: string }) {
  let response = await router.fetch(
    jsonRequest(routes.api.clients.visits.href({ clientId: client.clientId }), {
      body: JSON.stringify({
        visits: [
          {
            browser: 'Chrome',
            browserProfile: 'Default',
            title: 'Example',
            url: 'https://example.com/',
            visitTime: new Date(Date.now() - 60_000).toISOString(),
            windowsUser: 'HOUSE\\kid',
          },
        ],
      }),
      headers: {
        authorization: `Bearer ${client.credential}`,
        'content-type': 'application/json',
        'x-client-id': client.clientId,
      },
      method: 'POST',
    }),
  )
  assert.equal(response.status, 204)
}

/** An admin, a Parent who joined by invite, one PC with a Visit, and one group. */
async function setUpHousehold(): Promise<Household> {
  await installTestPersistence()
  let setup = await router.fetch(formRequest(routes.auth.setup.action.href(), ADMIN))
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
  assert.equal(accepted.status, 302)

  let client = await registerClient('Den PC')
  await postVisit(client)

  let group = await router.fetch(
    formRequest(
      routes.admin.groups.create.href(),
      { clientId: client.clientId, description: '', name: 'Kids' },
      { headers: { cookie: adminCookie } },
    ),
  )
  assert.equal(group.status, 302)
  let [kids] = await listGroupsWithMembers()
  assert.ok(kids)

  return {
    adminCookie,
    client,
    groupId: kids.id,
    parentCookie: cookieHeaderFrom(accepted),
  }
}

function asParent(household: Household, path: string, fields?: Record<string, string>) {
  let headers = { cookie: household.parentCookie }
  return router.fetch(
    fields ? formRequest(path, fields, { headers }) : jsonRequest(path, { headers }),
  )
}

test('a Parent can open every everyday page', async () => {
  let household = await setUpHousehold()

  for (let path of [
    routes.admin.index.href(),
    routes.admin.clients.index.href(),
    routes.admin.clients.detail.href({ clientId: household.client.clientId }),
    routes.admin.groups.index.href(),
    routes.admin.history.index.href(),
  ]) {
    let response = await asParent(household, path)
    assert.equal(response.status, 200, path)
  }
})

test("a Parent can message PCs and groups and change a PC's DNS", async () => {
  let household = await setUpHousehold()
  let { clientId } = household.client
  let profile = await createDnsProfile({ name: 'Family', primaryIp: '1.1.1.3', secondaryIp: '' })

  let toClient = await asParent(household, routes.admin.messages.client.href({ clientId }), {
    content: 'Dinner',
  })
  assert.equal(toClient.status, 302)

  let toGroup = await asParent(
    household,
    routes.admin.messages.group.href({ groupId: household.groupId }),
    { content: 'Bedtime' },
  )
  assert.equal(toGroup.status, 302)

  let apply = await asParent(household, routes.admin.clients.applyDns.href({ clientId }), {
    durationMinutes: '',
    profileId: profile.id,
  })
  assert.equal(apply.status, 302)
  assert.equal((await getLatestDnsState(clientId))?.profile_name, 'Family')

  let reset = await asParent(household, routes.admin.clients.resetDns.href({ clientId }), {})
  assert.equal(reset.status, 302)
  assert.equal((await getLatestDnsState(clientId))?.directive_kind, 'reset')
})

test('a Parent is refused every admin-only page and leaves nothing changed', async () => {
  let household = await setUpHousehold()
  let { clientId } = household.client
  let visitCount = async () => (await listHistoryPage(1, new Date(), { clientId })).total
  let [visit] = (await listHistoryPage(1, new Date(), { clientId })).visits
  assert.ok(visit)

  let refused: Array<[string, Record<string, string>?]> = [
    [routes.admin.settings.index.href()],
    [routes.admin.settings.accounts.index.href()],
    [routes.admin.settings.dnsProfiles.index.href()],
    [routes.admin.settings.dnsProfiles.create.href(), { name: 'Open', primaryIp: '8.8.8.8', secondaryIp: '' }],
    [routes.admin.settings.visitRetention.href(), { visitRetentionDays: '1' }],
    [routes.admin.settings.accounts.invite.href(), { email: 'x@example.com', name: 'X', role: 'admin' }],
    [routes.admin.history.delete.href({ visitId: visit.id }), {}],
    [routes.admin.clients.clearHistory.href({ clientId }), {}],
    [routes.admin.clients.historyCollection.href({ clientId }), { enabled: 'off' }],
    [routes.admin.clients.delete.href({ clientId }), {}],
    [routes.admin.groups.create.href(), { description: '', name: 'Mine' }],
    [routes.admin.groups.members.href({ groupId: household.groupId }), {}],
  ]

  for (let [path, fields] of refused) {
    let response = await asParent(household, path, fields)
    assert.equal(response.status, 403, path)
  }

  let client = await getClient(clientId)
  assert.ok(client, 'the PC is still registered')
  assert.equal(historyCollectionEnabled(client.history_collection), true)
  assert.equal(await visitCount(), 1)
  assert.deepEqual(await listDnsProfiles(), [])
  let groups = await listGroupsWithMembers()
  assert.deepEqual(
    groups.map((group) => [group.name, group.members.length]),
    [['Kids', 1]],
  )
})

test('a Parent does not see admin-only controls that an admin does', async () => {
  let household = await setUpHousehold()
  let detail = routes.admin.clients.detail.href({ clientId: household.client.clientId })
  let read = async (cookie: string, path: string) =>
    (await router.fetch(jsonRequest(path, { headers: { cookie } }))).text()

  let adminDetail = await read(household.adminCookie, detail)
  let parentDetail = await read(household.parentCookie, detail)
  for (let action of [
    routes.admin.clients.delete.href({ clientId: household.client.clientId }),
    routes.admin.clients.clearHistory.href({ clientId: household.client.clientId }),
    routes.admin.clients.historyCollection.href({ clientId: household.client.clientId }),
    routes.admin.settings.index.href(),
  ]) {
    assert.ok(adminDetail.includes(`"${action}"`), `admin sees ${action}`)
    assert.ok(!parentDetail.includes(`"${action}"`), `parent does not see ${action}`)
  }
  assert.ok(parentDetail.includes(routes.admin.clients.resetDns.href({ clientId: household.client.clientId })))

  let parentHistory = await read(household.parentCookie, routes.admin.history.index.href())
  assert.doesNotMatch(parentHistory, /class="visit-delete"/)
  let adminHistory = await read(household.adminCookie, routes.admin.history.index.href())
  assert.match(adminHistory, /class="visit-delete"/)

  let parentGroups = await read(household.parentCookie, routes.admin.groups.index.href())
  assert.doesNotMatch(parentGroups, /Create group|Change members/)
  assert.ok(parentGroups.includes(routes.admin.messages.group.href({ groupId: household.groupId })))
})
