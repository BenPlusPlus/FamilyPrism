import { readFile } from "node:fs/promises";

import { routes } from "../routes.ts";

/**
 * Home screen icons in public/icons. They are rendered from the brand mark by
 * generate-web-icons.ps1; keep this list and that script's file names in sync.
 */
const WEB_APP_ICON_FILES = new Set([
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
]);

const RAIL_COLOR = "#1e2b2f";
const GROUND_COLOR = "#eef0ec";

/**
 * Lets the console be installed to a phone's home screen and open as its own app,
 * without Safari's toolbars. It opens on the console; signed-out people land on sign in.
 */
export function webAppManifest() {
  return {
    id: routes.admin.index.href(),
    name: "FamilyPrism",
    short_name: "FamilyPrism",
    description: "Manage the household's PCs and network devices.",
    lang: "en",
    start_url: routes.admin.index.href(),
    scope: routes.home.href(),
    display: "standalone",
    background_color: GROUND_COLOR,
    theme_color: RAIL_COLOR,
    icons: [
      { src: webAppIconHref("icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: webAppIconHref("icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: webAppIconHref("icon-maskable-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

function webAppIconHref(file: string) {
  return routes.icons.href({ file });
}

export function webAppManifestResponse() {
  return new Response(JSON.stringify(webAppManifest()), {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/manifest+json",
    },
  });
}

export async function webAppIconResponse(file: string) {
  let icon = WEB_APP_ICON_FILES.has(file)
    ? await readFile(new URL(`../../public/icons/${file}`, import.meta.url)).catch(() => null)
    : null;
  if (!icon) {
    return new Response("Not Found", { status: 404 });
  }

  // Not fingerprinted, so cache for a day rather than forever; iOS copies the icon at install.
  return new Response(new Uint8Array(icon), {
    headers: {
      "Cache-Control": "public, max-age=86400",
      "Content-Type": "image/png",
    },
  });
}
