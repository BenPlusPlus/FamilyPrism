import { auth } from 'remix/middleware/auth'

import { getConsoleIdentityFromRequest, type ConsoleIdentity } from '../data/auth.ts'

export function loadAuth() {
  return auth({
    schemes: [
      {
        name: 'better-auth-session',
        async authenticate(context) {
          let identity = await getConsoleIdentityFromRequest(context.request)

          if (!identity) {
            return null
          }

          return {
            identity,
            status: 'success',
          } satisfies {
            identity: ConsoleIdentity
            status: 'success'
          }
        },
      },
    ],
  })
}

