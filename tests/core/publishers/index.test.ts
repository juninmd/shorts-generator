import { describe, expect, it, afterEach } from "vitest";
import { PUBLISHERS, configuredPublishers } from "../../../src/core/publishers/index.js";

const ENV = ["PUBLISH_PLATFORMS", "BLUESKY_HANDLE", "BLUESKY_APP_PASSWORD", "TIKTOK_ACCESS_TOKEN"];

describe("configuredPublishers", () => {
  afterEach(() => ENV.forEach((name) => delete process.env[name]));

  it("is empty when nothing is configured", () => {
    expect(configuredPublishers()).toEqual([]);
  });

  it("auto-detects every platform with credentials", () => {
    process.env.BLUESKY_HANDLE = "h";
    process.env.BLUESKY_APP_PASSWORD = "p";
    process.env.TIKTOK_ACCESS_TOKEN = "t";
    expect(configuredPublishers().map((p) => p.name).sort()).toEqual(["bluesky", "tiktok"]);
  });

  it("honors PUBLISH_PLATFORMS, skipping unknown and unconfigured names", () => {
    process.env.BLUESKY_HANDLE = "h";
    process.env.BLUESKY_APP_PASSWORD = "p";
    process.env.TIKTOK_ACCESS_TOKEN = "t";
    process.env.PUBLISH_PLATFORMS = " Bluesky, myspace, pinterest ";
    expect(configuredPublishers()).toEqual([PUBLISHERS.bluesky]);
  });
});
