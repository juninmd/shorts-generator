import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home.arpa"];

function ipv4Private(address: string): boolean {
  const [a, b] = address.split(".").map(Number) as [number, number];
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 168 || (b === 0 && address.startsWith("192.0.0."))))
    || (a === 198 && (b === 18 || b === 19));
}

/** True only for globally routable addresses (no loopback, private, link-local, CGNAT, multicast, ULA). */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !ipv4Private(address);
  if (family !== 6) return false;
  const lower = address.toLowerCase();
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return !ipv4Private(mapped[1]!);
  return !(lower === "::" || lower === "::1" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith("ff"));
}

/**
 * Accepts only http(s) URLs without credentials whose host resolves exclusively to public
 * addresses, so a caller cannot aim the downloader at the cluster or cloud metadata service.
 * ALLOW_PRIVATE_URLS=true switches the check off for trusted, fully internal deployments.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  const invalid = () => new Error("URL de destino não é pública");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalid();
  }
  if (process.env.ALLOW_PRIVATE_URLS === "true") return url;
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password
    || host === "localhost" || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw invalid();
  }
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((entry) => entry.address);
  if (addresses.length === 0 || !addresses.every(isPublicAddress)) throw invalid();
  return url;
}
