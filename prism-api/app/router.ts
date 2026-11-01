import { readFile } from "node:fs/promises";

import { asyncContext } from "remix/async-context-middleware";
import { compression } from "remix/compression-middleware";
import {
  createRouter,
  type AnyParams,
  type ContextWithParams,
  type MiddlewareContext,
} from "remix/fetch-router";
import { formData } from "remix/form-data-middleware";
import { logger } from "remix/logger-middleware";

import { assets } from "./assets.ts";
import {
  admin,
  adminClients,
  adminGroups,
  adminMessages,
  adminScreenshots,
} from "./controllers/admin/controller.tsx";
import {
  adminSettings,
  adminSettingsDnsProfiles,
} from "./controllers/admin/settings/controller.tsx";
import { api, apiClients } from "./controllers/api/controller.ts";
import { auth, authLogin, authSetup } from "./controllers/auth/controller.tsx";
import { home } from "./controllers/home.tsx";
import { loadAuth } from "./middleware/auth.ts";
import { loadDatabase } from "./middleware/database.ts";
import { routes } from "./routes.ts";

const BUNDLED_FONTS = new Set([
  "archivo-latin.woff2",
  "archivo-narrow-700-latin.woff2",
]);

type RootMiddleware = [
  ReturnType<typeof compression>,
  ReturnType<typeof formData>,
  ReturnType<typeof asyncContext>,
  ReturnType<typeof loadDatabase>,
  ReturnType<typeof loadAuth>,
];

let rootMiddleware: RootMiddleware = [
  compression(),
  formData(),
  asyncContext(),
  loadDatabase(),
  loadAuth(),
];

export type AppContext<params extends AnyParams = AnyParams> =
  ContextWithParams<MiddlewareContext<RootMiddleware>, params>;

export const router =
  process.env.NODE_ENV === "development"
    ? createRouter({ middleware: [logger(), ...rootMiddleware] as const })
    : createRouter({ middleware: rootMiddleware });

router.get(routes.assets, async ({ request }) => {
  let response = await assets.fetch(request);
  return response ?? new Response("Not Found", { status: 404 });
});

router.get(routes.fonts, async ({ params }) => {
  let font = BUNDLED_FONTS.has(params.file)
    ? await readFile(new URL(`../public/fonts/${params.file}`, import.meta.url)).catch(
        () => null,
      )
    : null;
  if (!font) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(new Uint8Array(font), {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "font/woff2",
    },
  });
});

router.map(routes.home, home);
router.map(routes.auth, auth);
router.map(routes.auth.login, authLogin);
router.map(routes.auth.setup, authSetup);
router.map(routes.admin, admin);
router.map(routes.admin.clients, adminClients);
router.map(routes.admin.groups, adminGroups);
router.map(routes.admin.messages, adminMessages);
router.map(routes.admin.screenshots, adminScreenshots);
router.map(routes.admin.settings, adminSettings);
router.map(routes.admin.settings.dnsProfiles, adminSettingsDnsProfiles);
router.map(routes.api, api);
router.map(routes.api.clients, apiClients);
router.get(
  routes.websocket,
  () => new Response("Upgrade Required", { status: 426 }),
);
