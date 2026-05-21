import { describe, it, expect } from "vitest";
import { loadControlPlaneConfig, tryLoadControlPlaneConfig } from "../../src/core/control-plane-config.js";

const validKey = Buffer.alloc(32).toString("base64");

describe("loadControlPlaneConfig", () => {
  it("loads config from env vars", () => {
    const env = {
      ADMIN_API_TOKEN: "tok",
      DATABASE_URL: "postgres://x",
      CONTROL_PLANE_ENCRYPTION_KEY: validKey,
      ADMIN_ALLOWED_ORIGINS: "http://localhost:5173,http://localhost:3000",
    };
    const config = loadControlPlaneConfig(env);
    expect(config.adminToken).toBe("tok");
    expect(config.allowedOrigins).toEqual(["http://localhost:5173", "http://localhost:3000"]);
    expect(config.encryptionKey).toHaveLength(32);
    expect(config.encryptionKeyVersion).toBe("v1");
  });

  it("uses custom key version when set", () => {
    const env = {
      ADMIN_API_TOKEN: "tok",
      DATABASE_URL: "postgres://x",
      CONTROL_PLANE_ENCRYPTION_KEY: validKey,
      CONTROL_PLANE_ENCRYPTION_KEY_VERSION: "v2",
    };
    expect(loadControlPlaneConfig(env).encryptionKeyVersion).toBe("v2");
  });

  it("throws when encryption key is wrong size", () => {
    const shortKey = Buffer.alloc(16).toString("base64"); // 16 bytes, not 32
    const env = {
      ADMIN_API_TOKEN: "tok",
      DATABASE_URL: "postgres://x",
      CONTROL_PLANE_ENCRYPTION_KEY: shortKey,
    };
    expect(() => loadControlPlaneConfig(env)).toThrow("32-byte");
  });

  it("throws when required env var is missing", () => {
    expect(() => loadControlPlaneConfig({})).toThrow("Missing required");
  });
});

describe("tryLoadControlPlaneConfig", () => {
  it("returns null when config is invalid", () => {
    expect(tryLoadControlPlaneConfig({})).toBeNull();
  });

  it("returns config when env is valid", () => {
    const env = {
      ADMIN_API_TOKEN: "tok",
      DATABASE_URL: "postgres://x",
      CONTROL_PLANE_ENCRYPTION_KEY: validKey,
    };
    expect(tryLoadControlPlaneConfig(env)).not.toBeNull();
  });
});
