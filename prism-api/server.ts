import * as http from "node:http";

import { createRequestListener } from "remix/node-fetch-server";

import { getEnv } from "./app/config/env.ts";
import { ensureDatabaseReady } from "./app/data/migrate.ts";
import { attachRealtimeServer } from "./app/realtime/server.ts";
import { router } from "./app/router.ts";

let env = getEnv();

await ensureDatabaseReady();

const server = http.createServer(
  createRequestListener(
    async (request) => {
      try {
        return await router.fetch(request);
      } catch (error) {
        console.error(error);
        return new Response("Internal Server Error", { status: 500 });
      }
    },
    {
      host: new URL(env.betterAuthUrl).host,
      protocol: new URL(env.betterAuthUrl).protocol,
    },
  ),
);

attachRealtimeServer(server);

await new Promise<void>((resolve) => {
  server.listen(env.port, resolve);
});
console.log(`Server listening on http://localhost:${env.port}`);

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
