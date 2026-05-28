import { auth } from 'remix/auth-middleware'

import { getAdminIdentityFromRequest, type AdminIdentity } from '../data/auth.ts'

export function loadAuth() {
  return auth({
    schemes: [
      {
        name: 'better-auth-session',
        async authenticate(context) {
          let identity = await getAdminIdentityFromRequest(context.request)

          if (!identity) {
            return null
          }

          return {
            identity,
            status: 'success',
          } satisfies {
            identity: AdminIdentity
            status: 'success'
          }
        },
      },
    ],
  })
}

