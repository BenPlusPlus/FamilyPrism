import "dotenv/config";

const DEFAULT_PORT = 44100;

export interface ClientPackagePin {
  version: string;
  url: string;
  sha256: string;
  kind: string;
  layoutGeneration: number;
}

export interface AppEnv {
  betterAuthSecret: string;
  betterAuthUrl: string;
  databaseUrl: string;
  nodeEnv: string;
  port: number;
  registrationPassword: string;
}

function readRequiredEnv(name: string) {
  let value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function readPort() {
  let rawPort = process.env.PORT;
  if (!rawPort) {
    return DEFAULT_PORT;
  }

  let port = Number.parseInt(rawPort, 10);
  if (Number.isNaN(port)) {
    throw new Error("PORT must be a number");
  }

  return port;
}

function readRequiredAbsoluteUrl(name: string, value: string) {
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }
}

function readBetterAuthUrl(port: number) {
  let explicit = process.env.BETTER_AUTH_URL;
  if (explicit) {
    return readRequiredAbsoluteUrl("BETTER_AUTH_URL", explicit);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_URL is required in production");
  }

  return readRequiredAbsoluteUrl("BETTER_AUTH_URL", `http://localhost:${port}`);
}

const DEFAULT_PACKAGE_KIND = "zip";
const DEFAULT_LAYOUT_GENERATION = 1;

function readLayoutGeneration(raw: string | undefined) {
  if (!raw?.trim()) {
    return DEFAULT_LAYOUT_GENERATION;
  }

  let value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1) {
    return DEFAULT_LAYOUT_GENERATION;
  }

  return value;
}

export function readClientPackagePin(
  env: NodeJS.Dict<string> = process.env,
): ClientPackagePin | null {
  let version = env.CLIENT_PACKAGE_VERSION?.trim();
  let url = env.CLIENT_PACKAGE_URL?.trim();
  let sha256 = env.CLIENT_PACKAGE_SHA256?.trim();

  if (!version || !url || !sha256) {
    return null;
  }

  return {
    version,
    url,
    sha256,
    kind: env.CLIENT_PACKAGE_KIND?.trim() || DEFAULT_PACKAGE_KIND,
    layoutGeneration: readLayoutGeneration(env.CLIENT_PACKAGE_LAYOUT_GENERATION),
  };
}

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  let port = readPort();

  cachedEnv = {
    betterAuthSecret: readRequiredEnv("BETTER_AUTH_SECRET"),
    betterAuthUrl: readBetterAuthUrl(port),
    databaseUrl: readRequiredEnv("DATABASE_URL"),
    nodeEnv: process.env.NODE_ENV ?? "development",
    port,
    registrationPassword: readRequiredEnv("REGISTRATION_PASSWORD"),
  };

  return cachedEnv;
}
