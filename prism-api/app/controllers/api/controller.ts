import type { Controller } from "remix/fetch-router";
import * as s from "remix/data-schema";
import { maxLength, minLength } from "remix/data-schema/checks";

import { getEnv, readClientPackagePin } from "../../config/env.ts";
import {
  authenticateClient,
  ClientNameConflictError,
  registerClient,
  updateClientLastSeenVersion,
} from "../../data/clients.ts";
import { serveUpdateManifest } from "../../data/client-package.ts";
import { recordDnsDirectiveResult } from "../../data/dns-directives.ts";
import { saveClientScreenshot } from "../../data/screenshots.ts";
import { prismAuth } from "../../data/auth.ts";
import type { AppContext } from "../../router.ts";
import { routes } from "../../routes.ts";

let env = getEnv();

let registrationSchema = s.object({
  clientName: s.string().pipe(minLength(1), maxLength(100)),
  registrationPassword: s.string().pipe(minLength(1)),
});

let dnsResultSchema = s.object({
  commandId: s.string().pipe(minLength(1), maxLength(255)),
  status: s.string().pipe(minLength(1), maxLength(16)),
});

const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

function readBearerCredential(request: Request) {
  let authorization = request.headers.get("authorization");
  return authorization && authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;
}

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
      let credential = readBearerCredential(request);

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

    async dnsResult({ params, request }) {
      let requestClientId = request.headers.get("x-client-id")?.trim();
      let credential = readBearerCredential(request);

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

      let parsed = s.parseSafe(dnsResultSchema, payload);
      if (!parsed.success) {
        return Response.json(
          {
            issues: parsed.issues,
            message: "Invalid DNS directive result payload.",
          },
          { status: 400 },
        );
      }

      let error =
        payload && typeof payload === "object" && "error" in payload
          ? payload.error
          : null;
      if (error !== null && error !== undefined && typeof error !== "string") {
        return Response.json(
          {
            message: "DNS directive error must be a string when provided.",
          },
          { status: 400 },
        );
      }

      if (parsed.value.status !== "applied" && parsed.value.status !== "failed") {
        return Response.json(
          {
            message: "DNS directive status must be applied or failed.",
          },
          { status: 400 },
        );
      }

      let state = await recordDnsDirectiveResult({
        clientId: client.id,
        commandId: parsed.value.commandId,
        error,
        status: parsed.value.status,
      });

      if (!state) {
        return Response.json(
          {
            message: "DNS directive command was not found for this client.",
          },
          { status: 404 },
        );
      }

      return new Response(null, { status: 204 });
    },

    async update({ params, request }) {
      return serveUpdateManifest({
        authenticate: authenticateClient,
        clientId: request.headers.get("x-client-id"),
        credential: readBearerCredential(request),
        expectedClientId: params.clientId,
        pin: readClientPackagePin(),
        recordVersion: updateClientLastSeenVersion,
        reportedVersion: request.headers.get("x-client-version"),
      });
    },
  },
} satisfies Controller<typeof routes.api.clients, AppContext>;
