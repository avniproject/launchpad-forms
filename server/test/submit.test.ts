import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nock from "nock";
import { readFile } from "node:fs/promises";
import { buildApp } from "../src/index.js";
import { notify } from "../src/bugsnag.js";

// Bugsnag no-ops without an API key, so spy on it to assert what would page.
vi.mock("../src/bugsnag.js", () => ({ startBugsnag: vi.fn(), notify: vi.fn() }));
import { resetTokenState } from "../src/avni/token.js";
import { AVNI_BASE, setTestEnv, submitBody, FORM_CODE } from "./helpers.js";

let deadLetterPath: string;

function mockToken(times = 1) {
  // Real response shape: { authToken } (not { token }) — pinned here.
  return nock(AVNI_BASE).post("/api/user/generateToken").times(times).reply(200, { authToken: "jwt-1" });
}

beforeEach(() => {
  deadLetterPath = setTestEnv();
  resetTokenState();
  nock.cleanAll();
  nock.disableNetConnect();
  vi.mocked(notify).mockClear();
});

afterEach(() => {
  nock.enableNetConnect();
});

describe("POST /api/submit", () => {
  it("happy path: token → subject → enrolment → 200 CREATED with an LP reference", async () => {
    mockToken();
    nock(AVNI_BASE).post("/api/subject").reply(200, { ID: "0af1e2d3-4455-6677-8899-aabbccddeeff" });
    nock(AVNI_BASE)
      .post("/api/programEnrolment", (body) => body["exitObservations"] !== undefined)
      .reply(200, { ID: "deadbeef-1122-3344-5566-778899aabbcc" });

    const app = buildApp();
    const res = await app.inject({ method: "POST", url: "/api/submit", payload: submitBody() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.code).toBe("CREATED");
    expect(body.reference).toBe("LP-deadbeef");
    expect(nock.isDone()).toBe(true);
  });

  it("a 401 from Avni refreshes the token once and retries that call", async () => {
    mockToken(2); // initial + refresh
    nock(AVNI_BASE).post("/api/subject").reply(401);
    nock(AVNI_BASE).post("/api/subject").reply(200, { ID: "0af1e2d3-4455-6677-8899-aabbccddeeff" });
    nock(AVNI_BASE).post("/api/programEnrolment").reply(200, { ID: "deadbeef-1122-3344-5566-778899aabbcc" });

    const app = buildApp();
    const res = await app.inject({ method: "POST", url: "/api/submit", payload: submitBody() });
    expect(res.statusCode).toBe(200);
    expect(nock.isDone()).toBe(true);
  });

  it("persistent 5xx → 202 QUEUED and the payload is dead-lettered", async () => {
    mockToken();
    nock(AVNI_BASE).post("/api/subject").times(3).reply(503); // initial + 2 retries

    const app = buildApp();
    const res = await app.inject({ method: "POST", url: "/api/submit", payload: submitBody() });
    expect(res.statusCode).toBe(202);
    expect(res.json().code).toBe("QUEUED");
    expect(res.json().reference).toMatch(/^LP-Q-[0-9a-f]{8}$/);

    const lines = (await readFile(deadLetterPath, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.payload.subject["External ID"]).toBe("priya.sharma@abcfoundation.org");
    expect(entry.payload.enrolment.exitObservations).toEqual({});
    expect(entry.error.status).toBe(503);
  }, 15_000);

  it("dead-letter write fails → 500 INTERNAL, never a 202 that claims capture", async () => {
    // A path whose parent is a file, so mkdir fails ENOTDIR — the shape of an
    // unwritable state dir under ProtectSystem=strict on a fresh deploy.
    setTestEnv({ DEAD_LETTER_PATH: "/dev/null/nope/dead-letter.jsonl" });
    resetTokenState();
    mockToken();
    nock(AVNI_BASE).post("/api/subject").times(3).reply(503);

    const app = buildApp();
    const res = await app.inject({ method: "POST", url: "/api/submit", payload: submitBody() });

    // 202 QUEUED promises the application is durably captured. It isn't.
    expect(res.statusCode).toBe(500);
    expect(res.json().code).toBe("INTERNAL");
  }, 15_000);

  it("token endpoint unreachable → 202 QUEUED + dead-letter, never a 500", async () => {
    nock(AVNI_BASE).post("/api/user/generateToken").times(3).replyWithError("ECONNREFUSED");

    const app = buildApp();
    const res = await app.inject({ method: "POST", url: "/api/submit", payload: submitBody() });
    expect(res.statusCode).toBe(202);
    expect(res.json().code).toBe("QUEUED");
    const entry = JSON.parse((await readFile(deadLetterPath, "utf8")).trim());
    expect(entry.error.message).toContain("auth failed");
  }, 15_000);

  it("Avni 400 (unknown concept) → 202 QUEUED + dead-letter, no retry storm", async () => {
    mockToken();
    nock(AVNI_BASE).post("/api/subject").reply(400, "Concept with name=State not found");

    const app = buildApp();
    const res = await app.inject({ method: "POST", url: "/api/submit", payload: submitBody() });
    expect(res.statusCode).toBe(202);
    const entry = JSON.parse((await readFile(deadLetterPath, "utf8")).trim());
    expect(entry.error.status).toBe(400);
    expect(entry.error.message).toContain("400");
    expect(nock.isDone()).toBe(true); // exactly one subject call — 4xx is not retried
  });

  it("honeypot filled → fake 200 CREATED, no Avni call, nothing stored", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/submit",
      payload: { ...submitBody(), _gotcha: "i am a bot" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().code).toBe("CREATED");
    expect(res.json().reference).toMatch(/^LP-[0-9a-f]{8}$/);
    await expect(readFile(deadLetterPath, "utf8")).rejects.toThrow(); // nothing written
    expect(nock.pendingMocks()).toEqual([]); // and no Avni traffic
  });

  it("validation failure → 400 with fieldErrors, no Avni call", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/submit",
      payload: submitBody({ email: "nope" }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_FAILED");
    expect(res.json().fieldErrors.email).toBeDefined();
  });

  it("outside the window → 403 REGISTRATION_CLOSED with closesAt", async () => {
    setTestEnv({ REG_CLOSE: "2020-01-01T00:00:00+05:30" });
    const app = buildApp();
    const res = await app.inject({ method: "POST", url: "/api/submit", payload: submitBody() });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ code: "REGISTRATION_CLOSED", closesAt: "2020-01-01T00:00:00+05:30" });
  });

  it("wrong captcha (no secret configured, token ≠ bypass) → 400 CAPTCHA_FAILED", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/submit",
      payload: submitBody({}, "not-the-bypass-token"),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("CAPTCHA_FAILED");
  });
});

describe("GET /healthz and /api/form-config", () => {
  it("healthz never calls Avni", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, cohort: "Cohort 4 – Eastern India", open: true, tokenCached: false });
  });

  it("form-config serves the field spec with window state and cache header", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: `/api/form-config?code=${FORM_CODE}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toContain("max-age=60");
    const body = res.json();
    expect(body.form).toBe("launchpad-cohort");
    expect(body.open).toBe(true);
    // 24 Google Form questions + privacy consent + headquarters split into
    // city/state + workshop location (added 8 Sep) = 27 declared fields
    // (referralSourceOther and contactRoleOther are derived).
    expect(body.sections.flatMap((s: { fields: unknown[] }) => s.fields)).toHaveLength(27);
  });
});

describe("configuration failures must page, not just queue", () => {
  it("a bad integration password reaches Bugsnag, not just the dead-letter file", async () => {
    // A 401 from generateToken is a CONFIGURATION error: every submission will
    // fail identically until someone fixes the credential. Queuing silently
    // while the applicant sees a success screen is the worst of both worlds.
    nock(AVNI_BASE).post("/api/user/generateToken").reply(401, { error: "bad credentials" });

    const app = buildApp();
    const res = await app.inject({ method: "POST", url: "/api/submit", payload: submitBody() });

    expect(res.statusCode).toBe(202); // still captured — the applicant keeps their answers
    const lines = (await readFile(deadLetterPath, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(1);

    expect(notify).toHaveBeenCalled();
  }, 15_000);

  it("a transient network outage queues WITHOUT paging", async () => {
    // Avni being briefly unreachable is not a config error and must not page
    // on every blip; the retries and the dead-letter file already cover it.
    nock(AVNI_BASE).post("/api/user/generateToken").times(3).replyWithError("ECONNREFUSED");

    const app = buildApp();
    const res = await app.inject({ method: "POST", url: "/api/submit", payload: submitBody() });

    expect(res.statusCode).toBe(202);
    expect(notify).not.toHaveBeenCalled();
  }, 15_000);
});

describe("form codes", () => {
  it("form-config without a code is 404 — the bare domain serves no form", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/form-config" });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("FORM_NOT_FOUND");
  });

  it("form-config with an unknown code is 404, indistinguishable from a retired one", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/form-config?code=not-a-real-code" });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("FORM_NOT_FOUND");
  });

  it("a 404 form-config is never cached", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/form-config?code=nope" });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("submit with an unknown code is refused before any Avni call", async () => {
    // No nock mocks registered: if the route reached Avni this would throw.
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/submit",
      payload: { ...submitBody(), code: "not-a-real-code" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("FORM_NOT_FOUND");
  });

  it("submit with no code at all is refused", async () => {
    const body = { ...submitBody() } as Record<string, unknown>;
    delete body.code;
    const app = buildApp();
    const res = await app.inject({ method: "POST", url: "/api/submit", payload: body });
    expect(res.statusCode).toBe(404);
  });
});
