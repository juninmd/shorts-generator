import { describe, expect, it } from "vitest";
import { createSecretStore } from "../../src/core/secret-store.js";

const baseConfig = {
  adminToken: "admin-token",
  allowedOrigins: ["http://localhost:5173"],
  databaseUrl: "postgres://example",
  encryptionKey: Buffer.alloc(32, 7),
  encryptionKeyVersion: "v1",
} as const;

describe("SecretStore", () => {
  it("encrypts and decrypts a token roundtrip", () => {
    const store = createSecretStore(baseConfig);

    const secret = store.encryptToken("channel-1", "account-1", "refresh-token");
    const decrypted = store.decryptToken("channel-1", "account-1", secret);

    expect(decrypted).toBe("refresh-token");
    expect(secret.keyVersion).toBe("v1");
    expect(secret.ciphertext).not.toBe("refresh-token");
  });

  it("rejects decryption with a different channel context", () => {
    const store = createSecretStore(baseConfig);
    const secret = store.encryptToken("channel-1", "account-1", "refresh-token");

    expect(() =>
      store.decryptToken("channel-2", "account-1", secret),
    ).toThrow("Failed to decrypt publishing account token");
  });
});