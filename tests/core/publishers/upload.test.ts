import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { bluesky } from "../../../src/core/publishers/bluesky.js";
import { pinterest } from "../../../src/core/publishers/pinterest.js";
import { failure, stubFetch } from "./helpers.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { default: { ...actual, readFileSync: vi.fn(() => Buffer.from("mp4")) } };
});

const input = { videoPath: "/tmp/clip.mp4", copy: { title: "Título", caption: "Legenda", description: "Descrição #tag" } };
const ENV = ["BLUESKY_HANDLE", "BLUESKY_APP_PASSWORD", "BLUESKY_SERVICE", "PINTEREST_ACCESS_TOKEN", "PINTEREST_BOARD_ID", "PUBLISH_POLL_MS", "PUBLISH_POLL_ATTEMPTS"];

describe("upload-based publishers", () => {
  beforeEach(() => { process.env.PUBLISH_POLL_MS = "1"; process.env.PUBLISH_POLL_ATTEMPTS = "3"; });
  afterEach(() => { ENV.forEach((name) => delete process.env[name]); vi.unstubAllGlobals(); });

  describe("bluesky", () => {
    beforeEach(() => { process.env.BLUESKY_HANDLE = "me.bsky.social"; process.env.BLUESKY_APP_PASSWORD = "app-pass"; });
    const session = { accessJwt: "JWT", did: "did:plc:abc", handle: "me.bsky.social", didDoc: { service: [{ id: "#atproto_pds", serviceEndpoint: "https://morel.us-east.host.bsky.network" }] } };

    it("reports configuration without needing a public URL", () => {
      expect(bluesky.configured()).toBe(true);
      delete process.env.BLUESKY_APP_PASSWORD;
      expect(bluesky.configured()).toBe(false);
      expect(bluesky.needsPublicUrl).toBe(false);
    });

    it("logs in, uploads through the video service and posts with a video embed", async () => {
      let polls = 0;
      const blob = { $type: "blob", ref: { $link: "bafy" }, mimeType: "video/mp4", size: 3 };
      const calls = stubFetch([
        ["createSession", () => session],
        ["getServiceAuth", () => ({ token: "SVC" })],
        ["uploadVideo", () => ({ jobId: "job1" })],
        ["getJobStatus", () => ({ jobStatus: polls++ < 1 ? { state: "JOB_STATE_PROCESSING" } : { state: "JOB_STATE_COMPLETED", blob } })],
        ["createRecord", () => ({ uri: "at://did:plc:abc/app.bsky.feed.post/3kxyz" })],
      ]);
      expect(await bluesky.publish(input)).toBe("https://bsky.app/profile/me.bsky.social/post/3kxyz");
      const auth = calls.find((c) => c.url.includes("getServiceAuth"))!.url;
      expect(auth).toContain(encodeURIComponent("did:web:morel.us-east.host.bsky.network"));
      expect(auth).toContain("lxm=com.atproto.repo.uploadBlob");
      const upload = calls.find((c) => c.url.includes("uploadVideo"))!;
      expect(upload.url).toContain("name=clip.mp4");
      expect((upload.init!.headers as any).Authorization).toBe("Bearer SVC");
      const record = JSON.parse(String(calls.at(-1)!.init!.body));
      expect(record.record.embed).toEqual({ $type: "app.bsky.embed.video", video: blob, aspectRatio: { width: 1080, height: 1920 } });
      expect(record.record.text).toBe("Legenda");
      expect(fs.readFileSync).toHaveBeenCalledWith("/tmp/clip.mp4");
    });

    it("falls back to the configured service host and fails on a failed job", async () => {
      process.env.BLUESKY_SERVICE = "https://pds.example.com";
      const calls = stubFetch([
        ["createSession", () => ({ ...session, didDoc: undefined })],
        ["getServiceAuth", () => ({ token: "SVC" })],
        ["uploadVideo", () => ({ jobId: "job1" })],
        ["getJobStatus", () => ({ jobStatus: { state: "JOB_STATE_FAILED" } })],
      ]);
      await expect(bluesky.publish(input)).rejects.toThrow("Bluesky video processing failed");
      expect(calls.find((c) => c.url.includes("getServiceAuth"))!.url).toContain(encodeURIComponent("did:web:pds.example.com"));
    });

    it("surfaces login errors", async () => {
      stubFetch([["createSession", () => failure(401, { error: "AuthenticationRequired" })]]);
      await expect(bluesky.publish(input)).rejects.toThrow("Bluesky login failed (401)");
    });
  });

  describe("pinterest", () => {
    beforeEach(() => { process.env.PINTEREST_ACCESS_TOKEN = "TOK"; process.env.PINTEREST_BOARD_ID = "board9"; });
    const media = { media_id: "m1", upload_url: "https://s3.example/upload", upload_parameters: { key: "k", policy: "p" } };

    it("reports configuration", () => {
      expect(pinterest.configured()).toBe(true);
      delete process.env.PINTEREST_BOARD_ID;
      expect(pinterest.configured()).toBe(false);
      expect(pinterest.needsPublicUrl).toBe(false);
    });

    it("registers media, uploads the file, waits and creates the pin", async () => {
      let polls = 0;
      const calls = stubFetch([
        ["/v5/media/m1", () => ({ status: polls++ < 1 ? "processing" : "succeeded" })],
        ["/v5/media", () => media],
        ["s3.example", () => new Response(null, { status: 204 })],
        ["/v5/pins", () => ({ id: "pin7" })],
      ]);
      expect(await pinterest.publish(input)).toBe("https://www.pinterest.com/pin/pin7/");
      const form = calls.find((c) => c.url.includes("s3.example"))!.init!.body as FormData;
      expect(form.get("key")).toBe("k");
      expect(form.get("file")).toBeInstanceOf(Blob);
      const pin = JSON.parse(String(calls.at(-1)!.init!.body));
      expect(pin).toMatchObject({ board_id: "board9", title: "Título", description: "Descrição #tag" });
      expect(pin.media_source).toEqual({ source_type: "video_id", media_id: "m1", cover_image_key_frame_time: 1 });
    });

    it("fails when the upload or the processing fails", async () => {
      stubFetch([["/v5/media", () => media], ["s3.example", () => new Response("", { status: 403 })]]);
      await expect(pinterest.publish(input)).rejects.toThrow("Pinterest upload failed (403)");
      stubFetch([["/v5/media/m1", () => ({ status: "failed" })], ["/v5/media", () => media], ["s3.example", () => new Response(null, { status: 204 })]]);
      await expect(pinterest.publish(input)).rejects.toThrow("Pinterest video processing failed");
    });
  });
});
