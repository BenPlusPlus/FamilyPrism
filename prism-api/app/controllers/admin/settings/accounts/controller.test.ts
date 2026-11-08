import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getConsoleRole,
  LastConsoleAdminError,
  removeConsoleAccount,
  setConsoleRole,
} from '../../../../data/console-accounts.ts'
import {
  createConsoleInvitation,
  findConsoleInvitation,
} from '../../../../data/console-invitations.ts'
import { prismAuth } from '../../../../data/auth.ts'
import { router } from '../../../../router.ts'
import { routes } from '../../../../routes.ts'
import { cookieHeaderFrom, formRequest, jsonRequest } from '../../../../../test/http.ts'
import { closeTestPersistence, installTestPersistence } from '../../../../../test/persistence.ts'

test.after(async () => {
  await closeTestPersistence()
})

const ADMIN = {
  email: 'console-admin@example.com',
  name: 'Console Admin',
  password: 'password123',
}

async function createFirstAdmin() {
  let response = await router.fetch(formRequest(routes.auth.setup.action.href(), ADMIN))
  assert.equal(response.status, 302)
  return cookieHeaderFrom(response)
}

async function userIdFor(email: string) {
  let context = await prismAuth.$context
  let found = await context.internalAdapter.findUserByEmail(email)
  assert.ok(found, `expected a user for ${email}`)
  return found.user.id
}

/** Returns the invite path shown once on the Accounts page. */
async function invite(adminCookie: string, fields: { email: string; name: string; role: string }) {
  let response = await router.fetch(
    formRequest(routes.admin.settings.accounts.invite.href(), fields, {
      headers: { cookie: adminCookie },
    }),
  )
  let text = await response.text()
  assert.equal(response.status, 200)

  let match = text.match(/value="(https?:\/\/[^"]+\/auth\/invite\/[^"]+)"/)
  assert.ok(match, 'expected the invite link on the page')
  return new URL(match[1]).pathname
}

async function acceptInvite(invitePath: string, fields: { name: string; password: string }) {
  return router.fetch(formRequest(invitePath, fields))
}

async function followNotice(response: Response, cookie: string) {
  assert.equal(response.status, 302)
  let page = await router.fetch(
    jsonRequest(response.headers.get('location') ?? '', { headers: { cookie } }),
  )
  return page.text()
}

test('an invited Parent sets a password, lands in the console, and can sign in later', async () => {
  await installTestPersistence()
  let adminCookie = await createFirstAdmin()

  let invitePath = await invite(adminCookie, {
    email: 'Parent@Example.com',
    name: 'Pat',
    role: 'parent',
  })

  let invitePage = await router.fetch(jsonRequest(invitePath))
  let inviteText = await invitePage.text()
  assert.equal(invitePage.status, 200)
  assert.match(inviteText, /parent@example\.com/)
  assert.match(inviteText, /<strong>Parent<\/strong>/)

  let accepted = await acceptInvite(invitePath, { name: 'Pat Parent', password: 'parent-pass-1' })
  assert.equal(accepted.status, 302)
  assert.equal(accepted.headers.get('location'), routes.admin.index.href())

  let dashboard = await router.fetch(
    jsonRequest(routes.admin.index.href(), { headers: { cookie: cookieHeaderFrom(accepted) } }),
  )
  let dashboardText = await dashboard.text()
  assert.equal(dashboard.status, 200)
  assert.match(dashboardText, /Pat Parent<\/strong> \(Parent\)/)

  let signIn = await router.fetch(
    formRequest(routes.auth.login.action.href(), {
      email: 'parent@example.com',
      password: 'parent-pass-1',
    }),
  )
  assert.equal(signIn.status, 302)
  assert.equal(signIn.headers.get('location'), routes.admin.index.href())
  assert.equal(await getConsoleRole(await userIdFor('parent@example.com')), 'parent')
})

test('an invite link works once', async () => {
  await installTestPersistence()
  let adminCookie = await createFirstAdmin()
  let invitePath = await invite(adminCookie, {
    email: 'parent@example.com',
    name: 'Pat',
    role: 'parent',
  })

  let first = await acceptInvite(invitePath, { name: 'Pat', password: 'parent-pass-1' })
  assert.equal(first.status, 302)

  let second = await acceptInvite(invitePath, { name: 'Mallory', password: 'other-pass-1' })
  assert.equal(second.status, 410)

  let page = await router.fetch(jsonRequest(invitePath))
  assert.equal(page.status, 410)
})

test('inviting the same email again replaces the earlier link', async () => {
  await installTestPersistence()
  let adminCookie = await createFirstAdmin()
  let fields = { email: 'parent@example.com', name: 'Pat', role: 'parent' }

  let oldPath = await invite(adminCookie, fields)
  let newPath = await invite(adminCookie, { ...fields, role: 'admin' })

  assert.equal((await router.fetch(jsonRequest(oldPath))).status, 410)

  let accepted = await acceptInvite(newPath, { name: 'Pat', password: 'parent-pass-1' })
  assert.equal(accepted.status, 302)
  assert.equal(await getConsoleRole(await userIdFor('parent@example.com')), 'admin')
})

test('a revoked invite link stops working', async () => {
  await installTestPersistence()
  let adminCookie = await createFirstAdmin()
  let invitePath = await invite(adminCookie, {
    email: 'parent@example.com',
    name: 'Pat',
    role: 'parent',
  })
  let token = invitePath.split('/').pop() ?? ''
  let invitation = await findConsoleInvitation(token)
  assert.ok(invitation)

  let revoked = await router.fetch(
    formRequest(
      routes.admin.settings.accounts.revokeInvite.href({ inviteId: invitation.id }),
      {},
      { headers: { cookie: adminCookie } },
    ),
  )
  assert.match(await followNotice(revoked, adminCookie), /Invite revoked/)

  let accepted = await acceptInvite(invitePath, { name: 'Pat', password: 'parent-pass-1' })
  assert.equal(accepted.status, 410)
})

test('an invite expires after its window', async () => {
  await installTestPersistence()
  await createFirstAdmin()
  let adminId = await userIdFor(ADMIN.email)
  let issuedAt = new Date('2026-11-01T12:00:00Z')

  let { token } = await createConsoleInvitation({
    email: 'parent@example.com',
    invitedByUserId: adminId,
    name: 'Pat',
    now: issuedAt,
    role: 'parent',
  })

  assert.ok(await findConsoleInvitation(token, new Date('2026-11-08T11:59:00Z')))
  assert.equal(await findConsoleInvitation(token, new Date('2026-11-08T12:00:00Z')), null)
})

test('an admin cannot invite an email that already has a console account', async () => {
  await installTestPersistence()
  let adminCookie = await createFirstAdmin()

  let response = await router.fetch(
    formRequest(
      routes.admin.settings.accounts.invite.href(),
      { email: ADMIN.email.toUpperCase(), name: 'Again', role: 'parent' },
      { headers: { cookie: adminCookie } },
    ),
  )

  assert.match(await followNotice(response, adminCookie), /already belongs to a console account/)
})

test('an admin can promote a Parent, and the new role applies to their existing session', async () => {
  await installTestPersistence()
  let adminCookie = await createFirstAdmin()
  let invitePath = await invite(adminCookie, {
    email: 'parent@example.com',
    name: 'Pat',
    role: 'parent',
  })
  let parentCookie = cookieHeaderFrom(
    await acceptInvite(invitePath, { name: 'Pat', password: 'parent-pass-1' }),
  )
  let settingsAsParent = () =>
    router.fetch(
      jsonRequest(routes.admin.settings.index.href(), { headers: { cookie: parentCookie } }),
    )
  assert.equal((await settingsAsParent()).status, 403)

  let promoted = await router.fetch(
    formRequest(
      routes.admin.settings.accounts.role.href({ userId: await userIdFor('parent@example.com') }),
      { role: 'admin' },
      { headers: { cookie: adminCookie } },
    ),
  )
  assert.match(await followNotice(promoted, adminCookie), /Role changed to Admin/)
  assert.equal((await settingsAsParent()).status, 200)
})

test('an admin cannot change their own role or remove themselves', async () => {
  await installTestPersistence()
  let adminCookie = await createFirstAdmin()
  let adminId = await userIdFor(ADMIN.email)

  let demote = await router.fetch(
    formRequest(
      routes.admin.settings.accounts.role.href({ userId: adminId }),
      { role: 'parent' },
      { headers: { cookie: adminCookie } },
    ),
  )
  assert.match(await followNotice(demote, adminCookie), /change your own role/)

  let remove = await router.fetch(
    formRequest(
      routes.admin.settings.accounts.remove.href({ userId: adminId }),
      {},
      { headers: { cookie: adminCookie } },
    ),
  )
  assert.match(await followNotice(remove, adminCookie), /remove your own account/)
  assert.equal(await getConsoleRole(adminId), 'admin')
})

test('the last admin cannot be demoted or removed', async () => {
  await installTestPersistence()
  await createFirstAdmin()
  let adminId = await userIdFor(ADMIN.email)

  await assert.rejects(setConsoleRole(adminId, 'parent'), LastConsoleAdminError)
  await assert.rejects(removeConsoleAccount(adminId), LastConsoleAdminError)
  assert.equal(await getConsoleRole(adminId), 'admin')
})

test('removing an account ends its console access and its sign-in', async () => {
  await installTestPersistence()
  let adminCookie = await createFirstAdmin()
  let invitePath = await invite(adminCookie, {
    email: 'parent@example.com',
    name: 'Pat',
    role: 'parent',
  })
  let parentCookie = cookieHeaderFrom(
    await acceptInvite(invitePath, { name: 'Pat', password: 'parent-pass-1' }),
  )

  let removed = await router.fetch(
    formRequest(
      routes.admin.settings.accounts.remove.href({ userId: await userIdFor('parent@example.com') }),
      {},
      { headers: { cookie: adminCookie } },
    ),
  )
  assert.match(await followNotice(removed, adminCookie), /Account removed/)

  // With Postgres the session row is gone, so this redirects to sign in. The
  // DB-less test auth caches sessions in a cookie; either way there's no role.
  let dashboard = await router.fetch(
    jsonRequest(routes.admin.index.href(), { headers: { cookie: parentCookie } }),
  )
  assert.notEqual(dashboard.status, 200)

  let signIn = await router.fetch(
    formRequest(routes.auth.login.action.href(), {
      email: 'parent@example.com',
      password: 'parent-pass-1',
    }),
  )
  assert.equal(signIn.status, 401)
})

test('a removed person can be invited back with the same email', async () => {
  await installTestPersistence()
  let adminCookie = await createFirstAdmin()
  let fields = { email: 'parent@example.com', name: 'Pat', role: 'parent' }
  await acceptInvite(await invite(adminCookie, fields), { name: 'Pat', password: 'parent-pass-1' })
  await removeConsoleAccount(await userIdFor('parent@example.com'))

  let again = await acceptInvite(await invite(adminCookie, fields), {
    name: 'Pat',
    password: 'parent-pass-2',
  })

  assert.equal(again.status, 302)
  assert.equal(await getConsoleRole(await userIdFor('parent@example.com')), 'parent')
})
