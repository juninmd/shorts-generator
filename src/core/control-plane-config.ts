import { Buffer } from "node:buffer";

export interface ControlPlaneConfig {
  readonly adminToken: string;
  readonly allowedOrigins: readonly string[];
  readonly databaseUrl: string;
  readonly encryptionKey: Buffer;
  readonly encryptionKeyVersion: string;
}

export function loadControlPlaneConfig(
  env: NodeJS.ProcessEnv = process.env,
): ControlPlaneConfig {
  const adminToken = readRequired(env, "ADMIN_API_TOKEN");
  const databaseUrl = readRequired(env, "DATABASE_URL");
  const encryptionKey = decodeKey(readRequired(env, "CONTROL_PLANE_ENCRYPTION_KEY"));
  const encryptionKeyVersion = env.CONTROL_PLANE_ENCRYPTION_KEY_VERSION?.trim() || "v1";

  return {
    adminToken,
    databaseUrl,
    encryptionKey,
    encryptionKeyVersion,
    allowedOrigins: parseOrigins(env.ADMIN_ALLOWED_ORIGINS),
  };
}

export function tryLoadControlPlaneConfig(
  env: NodeJS.ProcessEnv = process.env,
): ControlPlaneConfig | null {
  try {
    return loadControlPlaneConfig(env);
  } catch {
    return null;
  }
}

function readRequired(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function parseOrigins(raw: string | undefined): readonly string[] {
  return (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function decodeKey(raw: string): Buffer {
  const decoded = Buffer.from(raw, "base64");
  if (decoded.byteLength !== 32) {
    throw new Error(
      "CONTROL_PLANE_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
    );
  }
  return decoded;
}