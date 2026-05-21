import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { PublishingAccountSecret } from "./channel-domain.js";
import type { ControlPlaneConfig } from "./control-plane-config.js";
import { logger } from "./logger.js";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export interface SecretStore {
  encryptToken(channelId: string, accountId: string, token: string): PublishingAccountSecret;
  decryptToken(channelId: string, accountId: string, secret: PublishingAccountSecret): string;
}

export function createSecretStore(config: ControlPlaneConfig): SecretStore {
  return {
    encryptToken(channelId: string, accountId: string, token: string): PublishingAccountSecret {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, config.encryptionKey, iv);
      cipher.setAAD(buildContext(channelId, accountId));

      const ciphertext = Buffer.concat([
        cipher.update(token, "utf8"),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      logger.info(
        { channelId, accountId, keyVersion: config.encryptionKeyVersion },
        "Secret encrypted",
      );

      return {
        keyVersion: config.encryptionKeyVersion,
        iv: iv.toString("base64"),
        authTag: authTag.toString("base64"),
        ciphertext: ciphertext.toString("base64"),
      };
    },

    decryptToken(channelId: string, accountId: string, secret: PublishingAccountSecret): string {
      try {
        const decipher = createDecipheriv(
          ALGORITHM,
          config.encryptionKey,
          Buffer.from(secret.iv, "base64"),
        );
        decipher.setAAD(buildContext(channelId, accountId));
        decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));

        const plaintext = Buffer.concat([
          decipher.update(Buffer.from(secret.ciphertext, "base64")),
          decipher.final(),
        ]);

        logger.info(
          { channelId, accountId, keyVersion: secret.keyVersion },
          "Secret decrypted",
        );

        return plaintext.toString("utf8");
      } catch (error) {
        logger.error(
          { error, channelId, accountId, keyVersion: secret.keyVersion },
          "Secret decrypt failed",
        );
        throw new Error("Failed to decrypt publishing account token");
      }
    },
  };
}

function buildContext(channelId: string, accountId: string): Buffer {
  return Buffer.from(`${channelId}:${accountId}`, "utf8");
}