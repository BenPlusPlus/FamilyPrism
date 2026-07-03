import type { Controller } from "remix/fetch-router";
import * as s from "remix/data-schema";
import { maxLength, minLength } from "remix/data-schema/checks";

import { getEnv } from "../../config/env.ts";
import {
  authenticateClient,
  ClientNameConflictError,
  registerClient,
} from "../../data/clients.ts";
import { saveClientScreenshot } from "../../data/screenshots.ts";
import { prismAuth } from "../../data/auth.ts";
import type { AppContext } from "../../router.ts";
import { routes } from "../../routes.ts";

let env = getEnv();

let registrationSchema = s.object({
  clientName: s.string().pipe(minLength(1), maxLength(100)),
  registrationPassword: s.string().pipe(minLength(1)),
});

const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

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

    async screenshot({ params, request }) {
      let requestClientId = request.headers.get("x-client-id")?.trim();
      let authorization = request.headers.get("authorization");
      let credential =
        authorization && authorization.startsWith("Bearer ")
          ? authorization.slice("Bearer ".length).trim()
          : null;

      if (
        !requestClientId ||
        requestClientId !== params.clientId ||
        !credential
      ) {
        return Response.json(
          {
            message: "Missing client credentials.",
          },
          { status: 401 },
        );
      }

      let client = await authenticateClient(requestClientId, credential);
      if (!client) {
        return Response.json(
          {
            message: "Invalid client credentials.",
          },
          { status: 401 },
        );
      }

      let contentType = request.headers.get("content-type")?.split(";")[0]?.trim();
      if (contentType !== "image/png") {
        return Response.json(
          {
            message: "Screenshots must be uploaded as image/png.",
          },
          { status: 415 },
        );
      }

      let contentLengthHeader = request.headers.get("content-length");
      let contentLength = contentLengthHeader
        ? Number.parseInt(contentLengthHeader, 10)
        : null;

      if (contentLength && contentLength > MAX_SCREENSHOT_BYTES) {
        return Response.json(
          {
            message: "Screenshot payload exceeds the 10 MB limit.",
          },
          { status: 413 },
        );
      }

      let screenshot = new Uint8Array(await request.arrayBuffer());
      if (screenshot.byteLength === 0) {
        return Response.json(
          {
            message: "Screenshot payload was empty.",
          },
          { status: 400 },
        );
      }

      if (screenshot.byteLength > MAX_SCREENSHOT_BYTES) {
        return Response.json(
          {
            message: "Screenshot payload exceeds the 10 MB limit.",
          },
          { status: 413 },
        );
      }

      await saveClientScreenshot(client.id, screenshot);
      return new Response(null, { status: 204 });
    },
  },
} satisfies Controller<typeof routes.api.clients, AppContext>;
