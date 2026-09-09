// Server-side reCAPTCHA v2 verification. The bypass token is honoured ONLY
// when the env var is non-empty (UAT); on prod it stays unset.
import type { Env } from "./env.js";
import { logger } from "./log.js";

export async function verifyCaptcha(token: string, e: Env): Promise<boolean> {
  if (e.RECAPTCHA_BYPASS_TOKEN && token === e.RECAPTCHA_BYPASS_TOKEN) return true;
  if (!e.RECAPTCHA_SECRET) return false;

  try {
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: e.RECAPTCHA_SECRET, response: token }).toString(),
      signal: AbortSignal.timeout(5_000),
    });
    const body = (await res.json()) as { success?: boolean };
    return body.success === true;
  } catch (err) {
    // Google unreachable → fail closed; the applicant can retry.
    logger.warn({ err: String(err) }, "captcha siteverify unreachable");
    return false;
  }
}
