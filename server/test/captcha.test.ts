import { afterEach, beforeEach, describe, expect, it } from "vitest";
import nock from "nock";
import { env } from "../src/env.js";
import { verifyCaptcha, captchaMode } from "../src/captcha.js";
import { setTestEnv, BYPASS } from "./helpers.js";

const ENTERPRISE_HOST = "https://recaptchaenterprise.googleapis.com";
const GOOGLE = "https://www.google.com";

function enterpriseEnv(overrides: Record<string, string> = {}) {
  setTestEnv({
    RECAPTCHA_PROJECT_ID: "avni-launchpad",
    RECAPTCHA_SITE_KEY: "6Lc-site-key",
    RECAPTCHA_API_KEY: "AIzaTestKey",
    RECAPTCHA_SECRET: "",
    ...overrides,
  });
}

beforeEach(() => {
  nock.cleanAll();
  nock.disableNetConnect();
});
afterEach(() => nock.enableNetConnect());

describe("captcha mode selection", () => {
  it("uses Enterprise when the project/site/api trio is set", () => {
    enterpriseEnv();
    expect(captchaMode(env())).toBe("enterprise");
  });

  it("falls back to classic v2 when only the secret is set", () => {
    setTestEnv({ RECAPTCHA_PROJECT_ID: "", RECAPTCHA_SITE_KEY: "", RECAPTCHA_API_KEY: "", RECAPTCHA_SECRET: "s3cret" });
    expect(captchaMode(env())).toBe("classic");
  });

  it("reports unconfigured when neither is set", () => {
    setTestEnv({ RECAPTCHA_PROJECT_ID: "", RECAPTCHA_SITE_KEY: "", RECAPTCHA_API_KEY: "", RECAPTCHA_SECRET: "" });
    expect(captchaMode(env())).toBe("unconfigured");
  });
});

describe("verifyCaptcha", () => {
  it("fails CLOSED when no captcha is configured — never an open door", async () => {
    setTestEnv({ RECAPTCHA_PROJECT_ID: "", RECAPTCHA_SITE_KEY: "", RECAPTCHA_API_KEY: "", RECAPTCHA_SECRET: "", RECAPTCHA_BYPASS_TOKEN: "" });
    expect(await verifyCaptcha("anything", env())).toBe(false);
  });

  it("honours the bypass token only when the env var is non-empty", async () => {
    enterpriseEnv();
    expect(await verifyCaptcha(BYPASS, env())).toBe(true);

    enterpriseEnv({ RECAPTCHA_BYPASS_TOKEN: "" });
    nock(ENTERPRISE_HOST).post(/assessments/).reply(200, { tokenProperties: { valid: false } });
    expect(await verifyCaptcha(BYPASS, env())).toBe(false);
  });

  it("rejects an empty token without calling Google", async () => {
    enterpriseEnv({ RECAPTCHA_BYPASS_TOKEN: "" });
    expect(await verifyCaptcha("", env())).toBe(false);
    expect(nock.pendingMocks()).toEqual([]);
  });

  describe("Enterprise", () => {
    it("accepts a valid checkbox token that carries no score", async () => {
      enterpriseEnv({ RECAPTCHA_BYPASS_TOKEN: "" });
      nock(ENTERPRISE_HOST)
        .post("/v1/projects/avni-launchpad/assessments", (b) => b.event.token === "tok" && b.event.siteKey === "6Lc-site-key")
        .query({ key: "AIzaTestKey" })
        .reply(200, { tokenProperties: { valid: true } });
      expect(await verifyCaptcha("tok", env())).toBe(true);
    });

    it("rejects a token minted for a different action", async () => {
      // Google's own sample checks this: it stops a token obtained on another
      // page of the site being replayed against /api/submit.
      enterpriseEnv({ RECAPTCHA_BYPASS_TOKEN: "", RECAPTCHA_ACTION: "submit" });
      nock(ENTERPRISE_HOST).post(/assessments/).query(true)
        .reply(200, { tokenProperties: { valid: true, action: "login" }, riskAnalysis: { score: 0.9 } });
      expect(await verifyCaptcha("tok", env())).toBe(false);
    });

    it("accepts a token whose action matches, and sends expectedAction", async () => {
      enterpriseEnv({ RECAPTCHA_BYPASS_TOKEN: "", RECAPTCHA_ACTION: "submit" });
      nock(ENTERPRISE_HOST)
        .post(/assessments/, (b) => b.event.expectedAction === "submit")
        .query(true)
        .reply(200, { tokenProperties: { valid: true, action: "submit" }, riskAnalysis: { score: 0.9 } });
      expect(await verifyCaptcha("tok", env())).toBe(true);
    });

    it("rejects an invalid token", async () => {
      enterpriseEnv({ RECAPTCHA_BYPASS_TOKEN: "" });
      nock(ENTERPRISE_HOST).post(/assessments/).query(true)
        .reply(200, { tokenProperties: { valid: false, invalidReason: "EXPIRED" } });
      expect(await verifyCaptcha("tok", env())).toBe(false);
    });

    it("applies the score threshold when a score is returned", async () => {
      enterpriseEnv({ RECAPTCHA_BYPASS_TOKEN: "", RECAPTCHA_MIN_SCORE: "0.5" });
      nock(ENTERPRISE_HOST).post(/assessments/).query(true)
        .reply(200, { tokenProperties: { valid: true }, riskAnalysis: { score: 0.3 } });
      expect(await verifyCaptcha("tok", env())).toBe(false);

      nock(ENTERPRISE_HOST).post(/assessments/).query(true)
        .reply(200, { tokenProperties: { valid: true }, riskAnalysis: { score: 0.9 } });
      expect(await verifyCaptcha("tok", env())).toBe(true);
    });

    it("fails closed on a 403 — a bad API key is our bug, not a bot", async () => {
      enterpriseEnv({ RECAPTCHA_BYPASS_TOKEN: "" });
      nock(ENTERPRISE_HOST).post(/assessments/).query(true).reply(403, { error: { message: "API key not valid" } });
      expect(await verifyCaptcha("tok", env())).toBe(false);
    });

    it("fails closed when Google is unreachable", async () => {
      enterpriseEnv({ RECAPTCHA_BYPASS_TOKEN: "" });
      nock(ENTERPRISE_HOST).post(/assessments/).query(true).replyWithError("ECONNREFUSED");
      expect(await verifyCaptcha("tok", env())).toBe(false);
    });
  });

  describe("classic v2 fallback", () => {
    it("accepts success:true and rejects success:false", async () => {
      setTestEnv({ RECAPTCHA_PROJECT_ID: "", RECAPTCHA_SITE_KEY: "", RECAPTCHA_API_KEY: "", RECAPTCHA_SECRET: "s3cret", RECAPTCHA_BYPASS_TOKEN: "" });
      nock(GOOGLE).post("/recaptcha/api/siteverify").reply(200, { success: true });
      expect(await verifyCaptcha("tok", env())).toBe(true);

      nock(GOOGLE).post("/recaptcha/api/siteverify").reply(200, { success: false });
      expect(await verifyCaptcha("tok", env())).toBe(false);
    });
  });
});

describe("API key with a website (referrer) restriction", () => {
  it("sends a Referer when configured, so a referrer-restricted key is accepted", async () => {
    enterpriseEnv({ RECAPTCHA_BYPASS_TOKEN: "", RECAPTCHA_REFERER: "https://forms.avniproject.org/" });
    nock(ENTERPRISE_HOST, { reqheaders: { referer: "https://forms.avniproject.org/" } })
      .post(/assessments/).query(true)
      .reply(200, { tokenProperties: { valid: true, action: "submit" } });
    expect(await verifyCaptcha("tok", env())).toBe(true);
  });

  it("omits the Referer when unset", async () => {
    enterpriseEnv({ RECAPTCHA_BYPASS_TOKEN: "", RECAPTCHA_REFERER: "" });
    nock(ENTERPRISE_HOST, { badheaders: ["referer"] })
      .post(/assessments/).query(true)
      .reply(200, { tokenProperties: { valid: true, action: "submit" } });
    expect(await verifyCaptcha("tok", env())).toBe(true);
  });
});
