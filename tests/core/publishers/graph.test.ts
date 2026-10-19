import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { instagram } from "../../../src/core/publishers/instagram.js";
import { threads } from "../../../src/core/publishers/threads.js";
import { tiktok } from "../../../src/core/publishers/tiktok.js";
import { stubFetch } from "./helpers.js";

const input = { videoPath: "v.mp4", videoUrl: "https://pub/v.mp4", copy: { title: "T", caption: "Legenda #x", description: "D" } };
const ENV = ["INSTAGRAM_USER_ID", "INSTAGRAM_ACCESS_TOKEN", "THREADS_USER_ID", "THREADS_ACCESS_TOKEN", "TIKTOK_ACCESS_TOKEN", "TIKTOK_PRIVACY", "PUBLISH_POLL_MS", "PUBLISH_POLL_ATTEMPTS"];
const bodyOf = (init?: RequestInit) => Object.fromEntries(new URLSearchParams(String(init!.body)));

describe("pull-based publishers", () => {
  beforeEach(() => { process.env.PUBLISH_POLL_MS = "1"; process.env.PUBLISH_POLL_ATTEMPTS = "3"; });
  afterEach(() => { ENV.forEach((name) => delete process.env[name]); vi.unstubAllGlobals(); });

  describe("instagram", () => {
    beforeEach(() => { process.env.INSTAGRAM_USER_ID = "17841"; process.env.INSTAGRAM_ACCESS_TOKEN = "TOK"; });

    it("is configured only with both credentials and needs a public URL", () => {
      expect(instagram.configured()).toBe(true);
      delete process.env.INSTAGRAM_USER_ID;
      expect(instagram.configured()).toBe(false);
      expect(instagram.needsPublicUrl).toBe(true);
    });

    it("creates a REELS container, waits for it and publishes", async () => {
      let polls = 0;
      const calls = stubFetch([
        ["/17841/media_publish", () => ({ id: "post1" })],
        ["/17841/media", () => ({ id: "cont1" })],
        ["/cont1?fields=status_code", () => ({ status_code: ++polls < 2 ? "IN_PROGRESS" : "FINISHED" })],
      ]);
      expect(await instagram.publish(input)).toBe("instagram:post1");
      expect(bodyOf(calls[0]!.init)).toMatchObject({ media_type: "REELS", video_url: input.videoUrl, caption: "Legenda #x", access_token: "TOK" });
      expect(bodyOf(calls.at(-1)!.init)).toMatchObject({ creation_id: "cont1" });
    });

    it.each(["ERROR", "EXPIRED"])("fails when the container ends in %s", async (status_code) => {
      stubFetch([["/17841/media", () => ({ id: "c" })], ["fields=status_code", () => ({ status_code })]]);
      await expect(instagram.publish(input)).rejects.toThrow("Instagram video processing failed");
    });
  });

  describe("threads", () => {
    beforeEach(() => { process.env.THREADS_USER_ID = "99"; process.env.THREADS_ACCESS_TOKEN = "TOK"; });

    it("reports configuration", () => {
      expect(threads.configured()).toBe(true);
      delete process.env.THREADS_ACCESS_TOKEN;
      expect(threads.configured()).toBe(false);
      expect(threads.needsPublicUrl).toBe(true);
    });

    it("creates a VIDEO container, waits and publishes", async () => {
      let polls = 0;
      const calls = stubFetch([
        ["/99/threads_publish", () => ({ id: "t1" })],
        ["/99/threads", () => ({ id: "cont" })],
        ["/cont?fields=status", () => ({ status: ++polls < 2 ? "IN_PROGRESS" : "FINISHED" })],
      ]);
      expect(await threads.publish(input)).toBe("threads:t1");
      expect(bodyOf(calls[0]!.init)).toMatchObject({ media_type: "VIDEO", text: "Legenda #x" });
    });

    it("fails on ERROR", async () => {
      stubFetch([["/99/threads", () => ({ id: "c" })], ["fields=status", () => ({ status: "ERROR" })]]);
      await expect(threads.publish(input)).rejects.toThrow("Threads video processing failed");
    });
  });

  describe("tiktok", () => {
    beforeEach(() => { process.env.TIKTOK_ACCESS_TOKEN = "TOK"; });

    it("reports configuration", () => {
      expect(tiktok.configured()).toBe(true);
      delete process.env.TIKTOK_ACCESS_TOKEN;
      expect(tiktok.configured()).toBe(false);
      expect(tiktok.needsPublicUrl).toBe(true);
    });

    it("inits a PULL_FROM_URL post (private by default) and waits for completion", async () => {
      let polls = 0;
      const calls = stubFetch([
        ["/video/init/", () => ({ data: { publish_id: "p1" } })],
        ["/status/fetch/", () => ({ data: { status: ++polls < 2 ? "PROCESSING_DOWNLOAD" : "PUBLISH_COMPLETE" } })],
      ]);
      expect(await tiktok.publish(input)).toBe("tiktok:p1");
      const init = JSON.parse(String(calls[0]!.init!.body));
      expect(init.post_info).toEqual({ title: "Legenda #x", privacy_level: "SELF_ONLY" });
      expect(init.source_info).toEqual({ source: "PULL_FROM_URL", video_url: input.videoUrl });
      expect((calls[0]!.init!.headers as any).Authorization).toBe("Bearer TOK");
    });

    it("honors TIKTOK_PRIVACY and fails on FAILED", async () => {
      process.env.TIKTOK_PRIVACY = "PUBLIC_TO_EVERYONE";
      const calls = stubFetch([["/video/init/", () => ({ data: { publish_id: "p" } })], ["/status/fetch/", () => ({ data: { status: "FAILED" } })]]);
      await expect(tiktok.publish(input)).rejects.toThrow("TikTok video processing failed");
      expect(JSON.parse(String(calls[0]!.init!.body)).post_info.privacy_level).toBe("PUBLIC_TO_EVERYONE");
    });
  });
});
