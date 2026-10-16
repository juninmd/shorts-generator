import { describe, it, expect } from "vitest";
import { upsertPublishingAccount } from "../../src/core/publishing-accounts.js";
import type { PublishingAccount, PublishingProvider } from "../../src/core/channel-domain.js";

function account(provider: PublishingProvider, id: string): PublishingAccount {
  return {
    id,
    channelId: "akitemquiz",
    provider,
    label: id,
    status: "active",
    accountIdentifier: id,
    clientId: null,
    clientSecret: null,
    encryptedToken: { keyVersion: "v1", iv: "iv", authTag: "tag", ciphertext: "ct" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("upsertPublishingAccount", () => {
  it("replaces the matching provider and keeps the others", () => {
    const telegram = account("telegram", "tg");
    const openrouter = account("openrouter", "or");
    const oldYoutube = account("youtube", "yt-old");
    const newYoutube = account("youtube", "yt-new");

    const result = upsertPublishingAccount([telegram, oldYoutube, openrouter], newYoutube);

    expect(result.map((a) => a.provider).sort()).toEqual(["openrouter", "telegram", "youtube"]);
    expect(result.find((a) => a.provider === "youtube")).toBe(newYoutube);
    expect(result).toContain(telegram);
    expect(result).toContain(openrouter);
  });

  it("never produces two accounts of the same provider", () => {
    const result = upsertPublishingAccount(
      [account("youtube", "a"), account("youtube", "b")],
      account("youtube", "c"),
    );

    expect(result.filter((a) => a.provider === "youtube")).toHaveLength(1);
  });

  it("adds the provider when it was absent", () => {
    const result = upsertPublishingAccount([account("telegram", "tg")], account("youtube", "yt"));

    expect(result.map((a) => a.provider).sort()).toEqual(["telegram", "youtube"]);
  });
});
