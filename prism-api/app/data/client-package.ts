import type { ClientPackagePin } from "../config/env.ts";

const MAX_CLIENT_VERSION_LENGTH = 64;

export interface ClientUpdateManifest {
  package: {
    kind: string;
    layoutGeneration: number;
    sha256: string;
    url: string;
    version: string;
  } | null;
}

export interface ClientVersionView {
  isStale: boolean;
  lastSeenVersion: string | null;
}

export function normalizeClientVersion(
  value: string | null | undefined,
): string | null {
  let trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed.length > MAX_CLIENT_VERSION_LENGTH) {
    return null;
  }

  return trimmed;
}

function parseVersionParts(version: string) {
  let core = version.trim().split(/[+-]/)[0];
  if (!core) {
    return null;
  }

  let parts = core.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length === 0 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
    return null;
  }

  return parts;
}

export function compareClientVersions(left: string, right: string) {
  let leftParts = parseVersionParts(left);
  let rightParts = parseVersionParts(right);
  if (!leftParts || !rightParts) {
    return left.localeCompare(right);
  }

  let length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    let leftValue = leftParts[index] ?? 0;
    let rightValue = rightParts[index] ?? 0;
    if (leftValue !== rightValue) {
      return leftValue < rightValue ? -1 : 1;
    }
  }

  return 0;
}

export function isClientVersionStale(
  lastSeenVersion: string | null | undefined,
  pinVersion: string | null | undefined,
) {
  let lastSeen = normalizeClientVersion(lastSeenVersion);
  let pin = normalizeClientVersion(pinVersion);
  if (!lastSeen || !pin) {
    return false;
  }

  return compareClientVersions(lastSeen, pin) < 0;
}

export function describeClientVersion(
  lastSeenVersion: string | null | undefined,
  pin: ClientPackagePin | null,
): ClientVersionView {
  let lastSeen = normalizeClientVersion(lastSeenVersion);
  return {
    isStale: isClientVersionStale(lastSeen, pin?.version ?? null),
    lastSeenVersion: lastSeen,
  };
}

export function buildClientUpdateManifest(
  pin: ClientPackagePin | null,
): ClientUpdateManifest {
  if (!pin) {
    return { package: null };
  }

  return {
    package: {
      kind: pin.kind,
      layoutGeneration: pin.layoutGeneration,
      sha256: pin.sha256,
      url: pin.url,
      version: pin.version,
    },
  };
}

export async function serveUpdateManifest(input: {
  authenticate: (
    clientId: string,
    credential: string,
  ) => Promise<{ id: string } | null>;
  clientId: string | null | undefined;
  credential: string | null | undefined;
  expectedClientId: string;
  pin: ClientPackagePin | null;
  recordVersion: (clientId: string, version: string) => Promise<void>;
  reportedVersion: string | null | undefined;
}) {
  let clientId = input.clientId?.trim() ?? "";
  let credential = input.credential?.trim() ?? "";

  if (!clientId || clientId !== input.expectedClientId || !credential) {
    return Response.json(
      {
        message: "Missing client credentials.",
      },
      { status: 401 },
    );
  }

  let client = await input.authenticate(clientId, credential);
  if (!client) {
    return Response.json(
      {
        message: "Invalid client credentials.",
      },
      { status: 401 },
    );
  }

  let reportedVersion = normalizeClientVersion(input.reportedVersion);
  if (reportedVersion) {
    await input.recordVersion(client.id, reportedVersion);
  }

  return Response.json(buildClientUpdateManifest(input.pin), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
