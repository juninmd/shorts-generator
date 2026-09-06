import { describe, it, expect, vi, beforeEach } from "vitest";
import { errorDetails, shouldRetryRemoteWhisper, transcribeRemote } from "../../src/core/transcriber-api.js";
import http from "node:http";
import EventEmitter from "node:events";
import fs from "node:fs";

vi.mock("node:http", () => ({
  default: { request: vi.fn() },
}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const EventEmitter = await import("node:events");
  const stream = new EventEmitter.default();
  (stream as any).pipe = vi.fn().mockReturnValue(stream);
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: vi.fn().mockReturnValue(Buffer.from("mock")),
    },
    readFileSync: vi.fn().mockReturnValue(Buffer.from("mock")),
  };
});

describe("transcriber-api", () => {
  const mockConfig = { whisperBaseUrl: "http://localhost:9000" } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("errorDetails", () => {
    it("errorDetails correctly formats an Error object", () => {
      const err = new Error("msg");
      err.name = "MyError";
      err.cause = new Error("causeMsg");
      const details = errorDetails(err);
      expect(details).toHaveProperty("name", "MyError");
      expect(details).toHaveProperty("message", "msg");
      expect(details).toHaveProperty("cause", { name: "Error", message: "causeMsg" });
    });

    it("errorDetails correctly formats a string/unknown error", () => {
      const details = errorDetails("String error");
      expect(details).toHaveProperty("message", "String error");
    });
  });

  describe("shouldRetryRemoteWhisper", () => {
    it("returns true for retryable network errors", () => {
      expect(shouldRetryRemoteWhisper(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe(true);
      expect(shouldRetryRemoteWhisper(new Error("fetch failed"))).toBe(true);
      expect(shouldRetryRemoteWhisper(new Error("ECONNRESET"))).toBe(true);
      expect(shouldRetryRemoteWhisper(new Error("Something else"))).toBe(false);
      expect(shouldRetryRemoteWhisper("not an error")).toBe(false);
    });

    it("returns true for timeout error in cause", () => {
      const err = new Error("wrapped");
      err.cause = Object.assign(new Error("timeout"), { name: "HeadersTimeoutError" });
      expect(shouldRetryRemoteWhisper(err)).toBe(true);

      const err2 = new Error("wrapped2");
      err2.cause = Object.assign(new Error("timeout"), { name: "BodyTimeoutError" });
      expect(shouldRetryRemoteWhisper(err2)).toBe(true);
    });
  });

  describe("transcribeRemote", () => {
    it("handles successful response", async () => {
      vi.mocked(http.request).mockImplementation(((url: any, cb: any) => {
        const req = new EventEmitter() as any;
        req.write = vi.fn();
        req.end = vi.fn();
        req.destroy = vi.fn();
        const res = new EventEmitter() as any;
        res.statusCode = 200;
        setTimeout(() => {
          cb(res);
          res.emit("data", Buffer.from('{"language": "portuguese", "text": "hello"}'));
          res.emit("end");
        }, 10);
        return req;
      }) as any);

      const res = await transcribeRemote("audio.mp4", { whisperBaseUrl: "http://localhost" } as any);
      expect(res).toEqual({ language: "pt", text: "hello" });
    });

    it("handles success with valid json but non-portuguese language", async () => {
      vi.mocked(http.request).mockImplementation(((url: any, cb: any) => {
        const req = new EventEmitter() as any;
        req.write = vi.fn();
        req.end = vi.fn();
        req.destroy = vi.fn();
        const res = new EventEmitter() as any;
        res.statusCode = 200;
        setTimeout(() => {
          cb(res);
          res.emit("data", Buffer.from('{"language": "en", "text": "hello"}'));
          res.emit("end");
        }, 10);
        return req;
      }) as any);

      const res = await transcribeRemote("audio.mp4", mockConfig);
      expect(res).toEqual({ language: "en", text: "hello" });
    });

    it("handles HTTP error status", async () => {
      vi.mocked(http.request).mockImplementation(((url: any, cb: any) => {
        const req = new EventEmitter() as any;
        req.write = vi.fn();
        req.end = vi.fn();
        req.destroy = vi.fn();
        const res = new EventEmitter() as any;
        res.statusCode = 500;
        setTimeout(() => {
          cb(res);
          res.emit("data", Buffer.from('Internal Server Error'));
          res.emit("end");
        }, 10);
        return req;
      }) as any);

      await expect(transcribeRemote("audio.mp4", mockConfig)).rejects.toThrow(/WHISPER HTTP 500/);
    });

    it("handles HTTP error status safely when res.statusCode is missing", async () => {
      vi.mocked(http.request).mockImplementation(((url: any, cb: any) => {
        const req = new EventEmitter() as any;
        req.write = vi.fn();
        req.end = vi.fn();
        req.destroy = vi.fn();
        const res = new EventEmitter() as any;
        setTimeout(() => {
          cb(res);
          res.emit("data", Buffer.from('Internal Server Error'));
          res.emit("end");
        }, 10);
        return req;
      }) as any);

      await expect(transcribeRemote("audio.mp4", mockConfig)).rejects.toThrow(/WHISPER HTTP undefined/);
    });

    it("handles invalid JSON response", async () => {
      vi.mocked(http.request).mockImplementation(((url: any, cb: any) => {
        const req = new EventEmitter() as any;
        req.write = vi.fn();
        req.end = vi.fn();
        req.destroy = vi.fn();
        const res = new EventEmitter() as any;
        res.statusCode = 200;
        setTimeout(() => {
          cb(res);
          res.emit("data", Buffer.from('Invalid json {'));
          res.emit("end");
        }, 10);
        return req;
      }) as any);

      await expect(transcribeRemote("audio.mp4", mockConfig)).rejects.toThrow(/Invalid JSON/);
    });

    it("retries on fetch failed and eventually fails", async () => {
      let attempts = 0;
      vi.mocked(http.request).mockImplementation(((url: string | URL, opts: any, cb: any) => {
        attempts++;
        const req = new EventEmitter() as any;
        req.write = vi.fn();
        req.end = vi.fn();
        req.destroy = vi.fn();
        setTimeout(() => req.emit("error", new Error("fetch failed")), 10);
        return req;
      }) as any);

      await expect(transcribeRemote("audio.mp4", mockConfig)).rejects.toThrow(/WHISPER FAILED after 3/);
      expect(attempts).toBe(3);
    });

    it("handles generic string error without message object property", async () => {
      vi.mocked(http.request).mockImplementation(((url: string | URL, opts: any, cb: any) => {
        const req = new EventEmitter() as any;
        req.write = vi.fn();
        req.end = vi.fn();
        req.destroy = vi.fn();
        setTimeout(() => req.emit("error", "string failure"), 10);
        return req;
      }) as any);

      await expect(transcribeRemote("audio.mp4", mockConfig)).rejects.toThrow(/string failure/);
    });

    it("maps ENOTFOUND to WHISPER_DNS_ERROR", async () => {
      vi.mocked(http.request).mockImplementation(((url: string | URL, opts: any, cb: any) => {
        const req = new EventEmitter() as any;
        req.write = vi.fn();
        req.end = vi.fn();
        req.destroy = vi.fn();
        setTimeout(() => req.emit("error", new Error("ENOTFOUND")), 10);
        return req;
      }) as any);

      await expect(transcribeRemote("audio.mp4", mockConfig)).rejects.toThrow(/WHISPER UNREACHABLE.*WHISPER_DNS_ERROR/);
    });

    it("retries up to 3 times then throws unreachable for ECONNREFUSED", async () => {
      vi.mocked(http.request).mockImplementation(((url: string | URL, opts: any, cb: any) => {
        const req = new EventEmitter() as any;
        req.write = vi.fn();
        req.end = vi.fn();
        req.destroy = vi.fn();
        setTimeout(() => req.emit("error", new Error("ECONNREFUSED")), 10);
        return req;
      }) as any);

      await expect(transcribeRemote("audio.mp4", mockConfig)).rejects.toThrow(/\[WHISPER UNREACHABLE\]/);
    });

    it("handles timeout correctly", async () => {
        vi.mocked(http.request).mockImplementation(((url: string | URL, opts: any, cb: any) => {
            const req = new EventEmitter() as any;
            req.write = vi.fn();
            req.end = vi.fn();
            req.destroy = vi.fn((err: Error) => {
                req.emit("error", err);
            });
            setTimeout(() => req.emit("timeout"), 10);
            return req;
        }) as any);

        await expect(transcribeRemote("audio.mp4", mockConfig)).rejects.toThrow(/WHISPER_TIMEOUT/);
    });
  });
});
