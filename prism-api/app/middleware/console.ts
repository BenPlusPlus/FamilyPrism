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

/** Network devices exist only once a Router bridge is registered (ADR 0007). Run after requireConsoleAccount. */
export function requireRouterBridge(): Middleware {
  return async (context, next) => {
    let auth = context.get(Auth);
    if (auth?.ok && (auth.identity as ConsoleIdentity).routerBridge) {
      return next();
    }

    let home = new URL(routes.admin.index.href(), context.request.url);
    home.searchParams.set("notice", "Devices need a Router bridge. An admin can set one up in Settings.");
    home.searchParams.set("noticeType", "error");
    return redirect(`${home.pathname}${home.search}`);
  };
}

export function getConsoleViewer(context: Pick<AppContext, "get">): ConsoleViewer {
  let auth = context.get(Auth);
  if (!auth?.ok || !(auth.identity as ConsoleIdentity).role) {
    throw new Error("Expected a signed-in console account.");
  }

  return auth.identity as ConsoleViewer;
}
