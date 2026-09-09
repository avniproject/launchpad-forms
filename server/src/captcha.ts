// Server-side captcha verification. Two mechanisms, chosen by configuration:
//
//   reCAPTCHA Enterprise (Google Cloud) — RECAPTCHA_PROJECT_ID + SITE_KEY + API_KEY
//   reCAPTCHA v2 classic (siteverify)   — RECAPTCHA_SECRET
//
// Enterprise is what Google now provisions for new keys; the classic path is
// kept as a fallback so a stalled Cloud provisioning cannot block the
// registration window — the website's existing v2 secret can be dropped in
// instead. If neither is configured we fail CLOSED: no captcha means no
// submissions, never an open door.
//
// The bypass token is honoured ONLY when the env var is non-empty (UAT).
import type { Env } from "./env.js";
import { logger } from "./log.js";

const TIMEOUT_MS = 5_000;

export type CaptchaMode = "enterprise" | "classic" | "unconfigured";

export function captchaMode(e: Env): CaptchaMode {
  if (e.RECAPTCHA_PROJECT_ID && e.RECAPTCHA_SITE_KEY && e.RECAPTCHA_API_KEY) return "enterprise";
  if (e.RECAPTCHA_SECRET) return "classic";
  return "unconfigured";
}

export async function verifyCaptcha(token: string, e: Env): Promise<boolean> {
  if (e.RECAPTCHA_BYPASS_TOKEN && token === e.RECAPTCHA_BYPASS_TOKEN) return true;
  if (!token) return false;

  switch (captchaMode(e)) {
    case "enterprise":
      return verifyEnterprise(token, e);
    case "classic":
      return verifyClassic(token, e);
    default:
      logger.warn("no captcha configured — rejecting submission");
      return false;
  }
}

// POST /v1/projects/{project}/assessments?key={apiKey}
// Response: { tokenProperties: { valid, invalidReason }, riskAnalysis: { score } }
// A checkbox key returns validity with no score; a score key returns both, so
// the score gate only applies when a score is actually present.
// The page uses a score-based key, so the token carries an action. Google's
// own sample checks it, and so do we: it is what stops a token minted on
// another page of the site being replayed against this endpoint.
async function verifyEnterprise(token: string, e: Env): Promise<boolean> {
  const url =
    `https://recaptchaenterprise.googleapis.com/v1/projects/${encodeURIComponent(e.RECAPTCHA_PROJECT_ID)}` +
    `/assessments?key=${encodeURIComponent(e.RECAPTCHA_API_KEY)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: { token, siteKey: e.RECAPTCHA_SITE_KEY, expectedAction: e.RECAPTCHA_ACTION } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      // A 4xx here is our own misconfiguration (wrong project, unrestricted or
      // expired API key), not a bot — say so, because it rejects every
      // applicant until someone fixes it.
      logger.warn({ status: res.status, body: (await res.text()).slice(0, 300) }, "recaptcha assessment failed");
      return false;
    }
    const body = (await res.json()) as {
      tokenProperties?: { valid?: boolean; invalidReason?: string; action?: string };
      riskAnalysis?: { score?: number };
    };
    if (body.tokenProperties?.valid !== true) {
      logger.info({ invalidReason: body.tokenProperties?.invalidReason }, "captcha token invalid");
      return false;
    }
    const action = body.tokenProperties?.action;
    if (e.RECAPTCHA_ACTION && action && action !== e.RECAPTCHA_ACTION) {
      logger.info({ action, expected: e.RECAPTCHA_ACTION }, "captcha action mismatch");
      return false;
    }
    const score = body.riskAnalysis?.score;
    if (typeof score === "number" && score < e.RECAPTCHA_MIN_SCORE) {
      logger.info({ score, min: e.RECAPTCHA_MIN_SCORE }, "captcha score below threshold");
      return false;
    }
    return true;
  } catch (err) {
    // Google unreachable → fail closed; the applicant can retry.
    logger.warn({ err: String(err) }, "recaptcha assessment unreachable");
    return false;
  }
}

async function verifyClassic(token: string, e: Env): Promise<boolean> {
  try {
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: e.RECAPTCHA_SECRET, response: token }).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json()) as { success?: boolean };
    return body.success === true;
  } catch (err) {
    logger.warn({ err: String(err) }, "captcha siteverify unreachable");
    return false;
  }
}
