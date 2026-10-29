import { describe, expect, it, afterEach } from "vitest";
import { PUBLISHERS, configuredPublishers } from "../../../src/core/publishers/index.js";
import * as pubBarrel from "../../../src/core/publishers/index.js";
import * as blueskyPublisher from "../../../src/core/publishers/bluesky.js";
import * as tiktokPublisher from "../../../src/core/publishers/tiktok.js";
import * as instagramPublisher from "../../../src/core/publishers/instagram.js";
import * as threadsPublisher from "../../../src/core/publishers/threads.js";
import * as pinterestPublisher from "../../../src/core/publishers/pinterest.js";

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


describe("PUBLISHERS barrel", () => {
  it("should map publishers correctly", () => {
    expect(pubBarrel.PUBLISHERS.bluesky).toBe(blueskyPublisher.bluesky);
    expect(pubBarrel.PUBLISHERS.tiktok).toBe(tiktokPublisher.tiktok);
    expect(pubBarrel.PUBLISHERS.instagram).toBe(instagramPublisher.instagram);
    expect(pubBarrel.PUBLISHERS.threads).toBe(threadsPublisher.threads);
    expect(pubBarrel.PUBLISHERS.pinterest).toBe(pinterestPublisher.pinterest);
    expect(pubBarrel.configuredPublishers).toBeDefined();
  });
});
