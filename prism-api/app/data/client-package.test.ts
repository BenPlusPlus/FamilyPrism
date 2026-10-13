import assert from "node:assert/strict";
import test from "node:test";

import { readClientPackagePin } from "../config/env.ts";
import {
  buildClientUpdateManifest,
  describeClientVersion,
  isClientVersionStale,
  serveUpdateManifest,
} from "./client-package.ts";

const PINNED_PACKAGE = {
  version: "0.2.0",
  url: "https://github.com/BenPlusPlus/FamilyPrism/releases/download/v0.2.0/FamilyPrism-0.2.0-win-x64.zip",
  sha256: "a".repeat(64),
  kind: "zip",
  layoutGeneration: 1,
};

test("readClientPackagePin returns null when the pin is missing", () => {
  assert.equal(readClientPackagePin({}), null);
  assert.equal(
    readClientPackagePin({
      CLIENT_PACKAGE_VERSION: "0.2.0",
      CLIENT_PACKAGE_URL: PINNED_PACKAGE.url,
    }),
    null,
  );
});

test("readClientPackagePin returns the pin when version, URL, and SHA-256 are set", () => {
  assert.deepEqual(
    readClientPackagePin({
      CLIENT_PACKAGE_VERSION: " 0.2.0 ",
      CLIENT_PACKAGE_URL: ` ${PINNED_PACKAGE.url} `,
      CLIENT_PACKAGE_SHA256: ` ${PINNED_PACKAGE.sha256} `,
    }),
    PINNED_PACKAGE,
  );
});

test("readClientPackagePin uses kind and layout generation from env when provided", () => {
  assert.deepEqual(
    readClientPackagePin({
      CLIENT_PACKAGE_VERSION: "0.2.0",
      CLIENT_PACKAGE_URL: PINNED_PACKAGE.url,
      CLIENT_PACKAGE_SHA256: PINNED_PACKAGE.sha256,
      CLIENT_PACKAGE_KIND: "zip",
      CLIENT_PACKAGE_LAYOUT_GENERATION: "2",
    }),
    {
      ...PINNED_PACKAGE,
      layoutGeneration: 2,
    },
  );
});

test("buildClientUpdateManifest returns no package when the pin is unset", () => {
  assert.deepEqual(buildClientUpdateManifest(null), { package: null });
});

test("buildClientUpdateManifest includes version, URL, SHA-256, kind, and layout generation", () => {
  assert.deepEqual(buildClientUpdateManifest(PINNED_PACKAGE), {
    package: PINNED_PACKAGE,
  });
});

test("describeClientVersion marks a client stale only when it is behind the pin", () => {
  assert.deepEqual(describeClientVersion("0.1.0", PINNED_PACKAGE), {
    isStale: true,
    lastSeenVersion: "0.1.0",
  });
  assert.deepEqual(describeClientVersion("0.2.0", PINNED_PACKAGE), {
    isStale: false,
    lastSeenVersion: "0.2.0",
  });
  assert.deepEqual(describeClientVersion("0.3.0", PINNED_PACKAGE), {
    isStale: false,
    lastSeenVersion: "0.3.0",
  });
  assert.deepEqual(describeClientVersion(null, PINNED_PACKAGE), {
    isStale: false,
    lastSeenVersion: null,
  });
  assert.deepEqual(describeClientVersion("0.1.0", null), {
    isStale: false,
    lastSeenVersion: "0.1.0",
  });
});

test("isClientVersionStale ignores unknown or unpinned versions", () => {
  assert.equal(isClientVersionStale(null, "0.2.0"), false);
  assert.equal(isClientVersionStale("0.1.0", null), false);
});

test("serveUpdateManifest rejects missing or mismatched credentials", async () => {
  let recorded: Array<{ clientId: string; version: string }> = [];
  let response = await serveUpdateManifest({
    authenticate: async () => {
      throw new Error("authenticate should not run");
    },
    clientId: "client-1",
    credential: "pc_secret",
    expectedClientId: "client-2",
    pin: PINNED_PACKAGE,
    recordVersion: async (clientId, version) => {
      recorded.push({ clientId, version });
    },
    reportedVersion: "0.1.0",
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    message: "Missing client credentials.",
  });
  assert.deepEqual(recorded, []);
});

test("serveUpdateManifest rejects invalid credentials", async () => {
  let response = await serveUpdateManifest({
    authenticate: async () => null,
    clientId: "client-1",
    credential: "pc_wrong",
    expectedClientId: "client-1",
    pin: PINNED_PACKAGE,
    recordVersion: async () => {
      throw new Error("recordVersion should not run");
    },
    reportedVersion: "0.1.0",
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    message: "Invalid client credentials.",
  });
});

test("serveUpdateManifest records last_seen_version and returns the pin", async () => {
  let recorded: Array<{ clientId: string; version: string }> = [];
  let response = await serveUpdateManifest({
    authenticate: async (clientId, credential) => {
      assert.equal(clientId, "client-1");
      assert.equal(credential, "pc_secret");
      return { id: "client-1" };
    },
    clientId: "client-1",
    credential: "pc_secret",
    expectedClientId: "client-1",
    pin: PINNED_PACKAGE,
    recordVersion: async (clientId, version) => {
      recorded.push({ clientId, version });
    },
    reportedVersion: " 0.1.0 ",
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { package: PINNED_PACKAGE });
  assert.deepEqual(recorded, [{ clientId: "client-1", version: "0.1.0" }]);
});

test("serveUpdateManifest returns no package when the pin is unset and still records version", async () => {
  let recorded: Array<{ clientId: string; version: string }> = [];
  let response = await serveUpdateManifest({
    authenticate: async () => ({ id: "client-1" }),
    clientId: "client-1",
    credential: "pc_secret",
    expectedClientId: "client-1",
    pin: null,
    recordVersion: async (clientId, version) => {
      recorded.push({ clientId, version });
    },
    reportedVersion: "0.1.0",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { package: null });
  assert.deepEqual(recorded, [{ clientId: "client-1", version: "0.1.0" }]);
});

test("serveUpdateManifest succeeds when the caller omits version", async () => {
  let recordedCount = 0;
  let response = await serveUpdateManifest({
    authenticate: async () => ({ id: "client-1" }),
    clientId: "client-1",
    credential: "pc_secret",
    expectedClientId: "client-1",
    pin: null,
    recordVersion: async () => {
      recordedCount += 1;
    },
    reportedVersion: "   ",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { package: null });
  assert.equal(recordedCount, 0);
});
