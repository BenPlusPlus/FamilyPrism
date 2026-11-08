import type { Middleware } from "remix/router";
import { Auth, requireAuth } from "remix/middleware/auth";
import { redirect } from "remix/response/redirect";

import type { ConsoleRole } from "../data/console-accounts.ts";
import type { ConsoleIdentity } from "../data/auth.ts";
import type { AppContext } from "../router.ts";
import { routes } from "../routes.ts";

export type ConsoleViewer = ConsoleIdentity & { role: ConsoleRole };

function requireRole(allowed: (role: ConsoleRole) => boolean): Middleware {
  return async (context, next) => {
    let auth = context.get(Auth);
    let role = auth?.ok ? (auth.identity as ConsoleIdentity).role : null;

    if (!role || !allowed(role)) {
      return new Response("Forbidden", { status: 403 });
    }

    return next();
  };
}

/** Any console account: Admin or Parent. Signed-out visitors go to sign in. */
export function requireConsoleAccount() {
  return [
    requireAuth<ConsoleIdentity>({
      onFailure() {
        return redirect(routes.auth.login.index.href());
      },
    }),
    requireRole(() => true),
  ];
}

/** Household management: settings, accounts, deletions. Run after requireConsoleAccount. */
export function requireConsoleAdmin(): Middleware {
  return requireRole((role) => role === "admin");
}

export function getConsoleViewer(context: Pick<AppContext, "get">): ConsoleViewer {
  let auth = context.get(Auth);
  if (!auth?.ok || !(auth.identity as ConsoleIdentity).role) {
    throw new Error("Expected a signed-in console account.");
  }

  return auth.identity as ConsoleViewer;
}
