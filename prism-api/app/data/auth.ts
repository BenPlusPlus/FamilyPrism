import { betterAuth } from 'better-auth'

import { getEnv } from '../config/env.ts'
import { isAdminUser } from './admin-users.ts'
import { pool } from './database.ts'

let env = getEnv()
let authUrl = new URL(env.betterAuthUrl)

export const prismAuth = betterAuth({
  appName: 'Prism API',
  basePath: '/api/auth',
  baseURL: authUrl.origin,
  database: pool,
  emailAndPassword: {
    enabled: true,
  },
  secret: env.betterAuthSecret,
  trustedOrigins: [authUrl.origin],
})

export type BetterAuthSession = Awaited<ReturnType<typeof prismAuth.api.getSession>>
export type SessionData = NonNullable<BetterAuthSession>
export type AdminIdentity = SessionData & {
  isAdmin: boolean
}

export async function getAdminIdentityFromRequest(request: Request): Promise<AdminIdentity | null> {
  let session = await prismAuth.api.getSession({
    headers: request.headers,
  })

  if (!session) {
    return null
  }

  return {
    ...session,
    isAdmin: await isAdminUser(session.user.id),
  }
}

