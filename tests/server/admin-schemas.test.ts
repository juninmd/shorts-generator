import { describe, it, expect } from "vitest";
import { bundleSchema, channelIdSchema, focusSchema, publishingAccountSchema, sourceSchema } from "../../src/server/admin-schemas.js";

describe("Admin Schemas", () => {
  it("channelIdSchema validates correctly", () => {
    expect(channelIdSchema.safeParse("abc").success).toBe(true);
    expect(channelIdSchema.safeParse("ab").success).toBe(false);
  });

  it("focusSchema validates correctly", () => {
    expect(focusSchema.safeParse({ key: "tecnologia", label: "Tech" }).success).toBe(true);
    expect(focusSchema.safeParse({ key: "invalid", label: "Tech" }).success).toBe(false);
  });

  it("sourceSchema validates correctly", () => {
    expect(sourceSchema.safeParse({ kind: "youtube_url", value: "http://yt.com", label: "YT" }).success).toBe(true);
    expect(sourceSchema.safeParse({ kind: "invalid", value: "http://yt.com", label: "YT" }).success).toBe(false);
  });

  it("publishingAccountSchema validates correctly", () => {
    expect(publishingAccountSchema.safeParse({ provider: "youtube", label: "YT", status: "active", accountIdentifier: "test" }).success).toBe(true);
    expect(publishingAccountSchema.safeParse({ provider: "invalid", label: "YT", status: "active", accountIdentifier: "test" }).success).toBe(false);
  });

  it("bundleSchema validates correctly", () => {
    expect(bundleSchema.safeParse({
      slug: "test-slug",
      name: "Test Name",
      description: "Test Desc",
      status: "active",
      watermarkText: "Test Watermark",
      profile: {
        videoLimit: 10,
        minShortDuration: 15,
        maxShortDuration: 60,
        sortByViews: true,
        aiProvider: "ollama",
        aiModel: "gemma"
      }
    }).success).toBe(true);
  });
});
