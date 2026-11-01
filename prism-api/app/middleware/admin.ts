import type { Middleware } from "remix/router";
import { Auth } from "remix/middleware/auth";

import type { AdminIdentity } from "../data/auth.ts";

export function requireAdmin(): Middleware {
  return async (context, next) => {
    let auth = context.get(Auth);
    if (!auth?.ok) {
      return new Response("Forbidden", { status: 403 });
    }

    let identity = auth.identity as AdminIdentity;

    if (!identity?.isAdmin) {
      return new Response("Forbidden", { status: 403 });
    }

    return next();
  };
}
