import type { Controller } from "remix/fetch-router";
import * as s from "remix/data-schema";
import { maxLength, minLength } from "remix/data-schema/checks";

import { getEnv } from "../../config/env.ts";
import { ClientNameConflictError, registerClient } from "../../data/clients.ts";
import { prismAuth } from "../../data/auth.ts";
import type { AppContext } from "../../router.ts";
import { routes } from "../../routes.ts";

let env = getEnv();

let registrationSchema = s.object({
  clientName: s.string().pipe(minLength(1), maxLength(100)),
  registrationPassword: s.string().pipe(minLength(1)),
});

export const api = {
  actions: {
    async auth({ request }) {
      let pathname = new URL(request.url).pathname;
      if (
        pathname === routes.api.auth.href({ path: "sign-up/email" }) ||
        pathname === routes.api.auth.href({ path: "sign-up/social" })
      ) {
        return new Response("Not Found", { status: 404 });
      }

      return prismAuth.handler(request);
    },
  },
} satisfies Controller<typeof routes.api, AppContext>;

export const apiClients = {
  actions: {
    async register({ request }) {
      let payload: unknown;

      try {
        payload = await request.json();
      } catch {
        return Response.json(
          {
            message: "Invalid JSON body.",
          },
          { status: 400 },
        );
      }

      let parsed = s.parseSafe(registrationSchema, payload);
      if (!parsed.success) {
        return Response.json(
          {
            issues: parsed.issues,
            message: "Invalid client registration payload.",
          },
          { status: 400 },
        );
      }

      if (parsed.value.registrationPassword !== env.registrationPassword) {
        return Response.json(
          {
            message: "Invalid registration password.",
          },
          { status: 403 },
        );
      }

      try {
        let result = await registerClient(parsed.value.clientName);
        return Response.json({
          clientId: result.client.id,
          clientName: result.client.name,
          credential: result.credential,
          websocketPath: routes.websocket.href(),
        });
      } catch (error) {
        if (error instanceof ClientNameConflictError) {
          return Response.json(
            {
              message: error.message,
            },
            { status: 409 },
          );
        }

        throw error;
      }
    },
  },
} satisfies Controller<typeof routes.api.clients, AppContext>;
