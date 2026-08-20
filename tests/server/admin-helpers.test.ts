import { describe, it, expect, vi } from "vitest";
import {
  toAdminBundleResponse,
  buildPublishingAccount,
  mapQuizResultToPipeline,
  isCutsOnlyMode
} from "../../src/server/admin-helpers.js";

describe("Admin Helpers", () => {
  it("toAdminBundleResponse maps bundle correctly", () => {
    const bundle: any = {
      channel: { id: "ch1" },
      profile: { aiModel: "gemma" },
      focuses: [],
      sources: [],
      publishingAccounts: [
        {
          id: "acc1",
          channelId: "ch1",
          provider: "youtube",
          label: "My YT",
          status: "active",
          accountIdentifier: "yt1",
          clientId: "client1"
        }
      ]
    };
    const response = toAdminBundleResponse(bundle);
    expect(response.publishingAccounts[0].hasStoredToken).toBe(true);
    expect(response.publishingAccounts[0].hasClientCredentials).toBe(true);
  });

  it("buildPublishingAccount works with existing account", () => {
    const existing: any = {
      publishingAccounts: [
        {
          id: "acc1",
          provider: "youtube",
          encryptedToken: "enc1",
          clientId: "client1",
          clientSecret: "secret1",
          createdAt: "2024-01-01"
        }
      ]
    };
    const payload: any = {
      provider: "youtube",
      label: "My YT",
      status: "active",
      accountIdentifier: "yt1"
    };
    const secretStore: any = {
      encryptToken: vi.fn()
    };

    const account = buildPublishingAccount("ch1", payload, existing, secretStore, "2024-02-01");
    expect(account.id).toBe("acc1");
    expect(account.encryptedToken).toBe("enc1");
  });

  it("buildPublishingAccount works with new account", () => {
    const payload: any = {
      provider: "youtube",
      label: "My YT",
      status: "active",
      accountIdentifier: "yt1",
      refreshToken: "token1"
    };
    const secretStore: any = {
      encryptToken: vi.fn().mockReturnValue("newEnc")
    };

    const account = buildPublishingAccount("ch1", payload, null, secretStore, "2024-02-01");
    expect(account.encryptedToken).toBe("newEnc");
    expect(secretStore.encryptToken).toHaveBeenCalled();
  });

  it("buildPublishingAccount throws if no token", () => {
    const payload: any = {
      provider: "youtube",
      label: "My YT",
      status: "active",
      accountIdentifier: "yt1"
    };
    const secretStore: any = {
      encryptToken: vi.fn()
    };

    expect(() => buildPublishingAccount("ch1", payload, null, secretStore, "2024-02-01")).toThrow("Publishing account token is required");
  });

  it("mapQuizResultToPipeline maps correctly", () => {
    const result: any = {
      quiz: {
        tema: "Quiz Tema",
        fato_curioso: "Curious"
      },
      outputPath: "/out"
    };
    const mapped = mapQuizResultToPipeline(result, "Channel");
    expect(mapped.videoId).toBe("quiz");
    expect(mapped.shorts[0].clip.title).toBe("Quiz Tema");
  });

  it("isCutsOnlyMode correctly reads env", () => {
    process.env.CHANNEL_FLOW_MODE = "cuts";
    expect(isCutsOnlyMode()).toBe(true);
    process.env.CHANNEL_FLOW_MODE = "other";
    expect(isCutsOnlyMode()).toBe(false);
  });
});
