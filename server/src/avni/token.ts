// Avni auth: POST /api/user/generateToken with the integration user's
// credentials returns a JWT (the user's "Is Allowed To Invoke Token Generation
// API" setting must be on). Cached ~50 min; one in-flight fetch so a cold
// burst makes a single call.
import type { Env } from "../env.js";

// Why the token could not be obtained. "auth" is a rejected credential or a
// user without "Is Allowed To Invoke Token Generation API" — permanent until
// someone fixes it, so callers page on it. "network" is Avni being briefly
// unreachable, which the retries and the dead-letter file already handle.
export class TokenError extends Error {
  constructor(
    message: string,
    public readonly kind: "auth" | "network",
  ) {
    super(message);
    this.name = "TokenError";
  }
}

const TTL_MS = 50 * 60 * 1000;

let cached: { token: string; fetchedAt: number } | null = null;
let inflight: Promise<string> | null = null;

export function tokenCached(): boolean {
  return cached !== null && Date.now() - cached.fetchedAt < TTL_MS;
}

export function clearToken(): void {
  cached = null;
}

// Test hook.
export function resetTokenState(): void {
  cached = null;
  inflight = null;
}

export async function getToken(e: Env): Promise<string> {
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.token;
  if (!inflight) {
    inflight = fetchToken(e).finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

async function fetchToken(e: Env): Promise<string> {
  const delays = [0, 500, 1500];
  let lastError: unknown;
  for (const delay of delays) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      const res = await fetch(`${e.AVNI_BASE_URL}/api/user/generateToken`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: e.AVNI_USERNAME, password: e.AVNI_PASSWORD }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status >= 500) {
        lastError = new Error(`generateToken ${res.status}`);
        // Drain before retrying: undici holds the socket open until an unread
        // body is garbage-collected.
        await res.arrayBuffer().catch(() => undefined);
        continue;
      }
      if (!res.ok) {
        await res.arrayBuffer().catch(() => undefined);
        throw new TokenError(`generateToken rejected the credentials: HTTP ${res.status}`, "auth");
      }
      // The live endpoint returns { "authToken": "…" } (verified 9 Sep 2026).
      const body = (await res.json()) as { authToken?: string; token?: string };
      const jwt = body.authToken ?? body.token;
      if (!jwt) throw new Error("generateToken returned no token");
      cached = { token: jwt, fetchedAt: Date.now() };
      return jwt;
    } catch (err) {
      if (err instanceof TokenError) throw err;   // credentials: retrying cannot help
      lastError = err;
    }
  }
  throw new TokenError(`generateToken unreachable: ${String(lastError)}`, "network");
}
