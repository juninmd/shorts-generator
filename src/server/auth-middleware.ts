import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import type { ControlPlaneConfig } from "../core/control-plane-config.js";
import { logger } from "../core/logger.js";

export function createAdminAuthMiddleware(
  config: ControlPlaneConfig,
): MiddlewareHandler {
  return async (c, next) => {
    const origin = c.req.header("origin");
    const authHeader = c.req.header("authorization");
    const token = extractBearerToken(authHeader);

    if (!isOriginAllowed(origin, config.allowedOrigins)) {
      logger.warn({ origin, path: c.req.path }, "Unauthorized admin request");
      return c.json({ error: "Origin not allowed" }, 403);
    }

    if (!token || !tokensMatch(token, config.adminToken)) {
      logger.warn({ origin, path: c.req.path }, "Unauthorized admin request");
      return c.json({ error: "Unauthorized" }, 401);
    }

    await next();
  };
}

/**
 * Same-origin check is dropped: this guards links shared outside the browser
 * (Telegram), which carry the token as a query param instead of a header.
 * Constant-time compare only — do not reuse for origin-sensitive routes.
 */
export function createLinkAuthMiddleware(config: ControlPlaneConfig): MiddlewareHandler {
  return async (c, next) => {
    const token = extractBearerToken(c.req.header("authorization")) ?? c.req.query("token") ?? null;
    if (!token || !tokensMatch(token, config.adminToken)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  };
}

export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }
  return token;
}

/**
 * Constant-time comparison to avoid leaking the admin token via timing.
 */
function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  if (!origin) {
    return false;
  }
  if (allowedOrigins.length === 0) {
    return false;
  }
  return allowedOrigins.includes(origin);
}