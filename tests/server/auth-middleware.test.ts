import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { createAdminAuthMiddleware, extractBearerToken } from "../../src/server/auth-middleware.js";

const config = {
  adminToken: "secret-admin-token",
  allowedOrigins: ["http://localhost:5173"],
  databaseUrl: "postgres://example",
  encryptionKey: Buffer.alloc(32, 7),
  encryptionKeyVersion: "v1",
} as const;

function createApp() {
  const app = new Hono();
  app.use("/admin/*", createAdminAuthMiddleware(config));
  app.get("/admin/channels", (c) => c.json({ ok: true }));
  return app;
}

describe("createAdminAuthMiddleware", () => {
  it("rejects requests without a bearer token", async () => {
    const res = await createApp().request("/admin/channels", {
      headers: { origin: "http://localhost:5173" },
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("rejects requests from an unknown origin", async () => {
    const res = await createApp().request("/admin/channels", {
      headers: {
        origin: "http://evil.example",
        authorization: "Bearer secret-admin-token",
      },
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Origin not allowed" });
  });

  it("rejects requests with an incorrect bearer token", async () => {
    const res = await createApp().request("/admin/channels", {
      headers: {
        origin: "http://localhost:5173",
        authorization: "Bearer wrong-token",
      },
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("allows requests with a valid bearer token and allowed origin", async () => {
    const res = await createApp().request("/admin/channels", {
      headers: {
        origin: "http://localhost:5173",
        authorization: "Bearer secret-admin-token",
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("extractBearerToken", () => {
  it("returns null for undefined header", () => {
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it("returns null for non-Bearer scheme", () => {
    expect(extractBearerToken("Basic dXNlcjpwYXNz")).toBeNull();
  });

  it("returns null for Bearer with no token", () => {
    expect(extractBearerToken("Bearer")).toBeNull();
  });

  it("returns the token for valid Bearer header", () => {
    expect(extractBearerToken("Bearer my-token")).toBe("my-token");
  });
});

describe("createAdminAuthMiddleware with empty allowedOrigins", () => {
  it("rejects all origins when allowedOrigins is empty", async () => {
    const emptyConfig = {
      adminToken: "token",
      allowedOrigins: [],
      databaseUrl: "postgres://x",
      encryptionKey: Buffer.alloc(32),
      encryptionKeyVersion: "v1",
    } as const;
    const app = new Hono();
    app.use("/admin/*", createAdminAuthMiddleware(emptyConfig));
    app.get("/admin/test", (c) => c.json({ ok: true }));

    const res = await app.request("/admin/test", {
      headers: { origin: "http://localhost:5173", authorization: "Bearer token" },
    });
    expect(res.status).toBe(403);
  });
});

describe("isOriginAllowed", () => {
  it("rejects when no origin header is provided", async () => {
    const res = await createApp().request("/admin/channels", {
      headers: {
        authorization: "Bearer secret-admin-token",
      },
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Origin not allowed" });
  });
});