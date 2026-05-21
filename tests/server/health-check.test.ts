import { describe, it, expect } from "vitest";
import { app } from "../../src/server/routes.js";

describe("Health check endpoint", () => {
  it("GET /api/health returns 200 with status ok", async () => {
    const req = new Request("http://localhost/api/health");
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; timestamp: string };
    expect(body.status).toBe("ok");
    expect(typeof body.timestamp).toBe("string");
    expect(new Date(body.timestamp).getTime()).not.toBeNaN();
  });
});
