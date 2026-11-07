import { betterAuth } from 'better-auth'
import type { Pool } from 'pg'

import { getEnv } from '../config/env.ts'
import { expandLoopbackTrustedOrigins } from '../config/trusted-origins.ts'
import { isAdminUser } from './admin-users.ts'
import { pool } from './database.ts'

export function createPrismAuth(database?: Pool) {
  let env = getEnv()
  let authUrl = new URL(env.betterAuthUrl)

  return betterAuth({
    appName: 'Prism API',
    basePath: '/api/auth',
    baseURL: authUrl.origin,
    ...(database ? { database } : {}),
    emailAndPassword: {
      enabled: true,
    },
    secret: env.betterAuthSecret,
    trustedOrigins: expandLoopbackTrustedOrigins(authUrl.origin),
    ...(database ? {} : { telemetry: { enabled: false } }),
  })
}

export let prismAuth = createPrismAuth(process.env.NODE_ENV === 'test' ? undefined : pool)

export function replacePrismAuth(next: ReturnType<typeof createPrismAuth>) {
  prismAuth = next
}

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

