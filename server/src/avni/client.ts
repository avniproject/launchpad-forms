// Builds and sends the two Avni external-API payloads (docs/CONTRACT.md §4).
// Invariants pinned by tests:
//   - "observations" is always present on both calls
//   - "exitObservations": {} is always present on the enrolment (avni-server
//     dereferences it without a null check — omitting it is a 500)
//   - both calls upsert on "External ID"; email is normalised before use
//   - stay on the default API version ("Address" is a title lineage string;
//     version>=3 would demand "Address map" instead — do not send ?version)
import type { Env } from "../env.js";
import { getToken, clearToken } from "./token.js";
import { REGISTRATION_CONCEPTS, ENROLMENT_CONCEPTS } from "../mapping/launchpad-cohort.map.js";
import type { FieldValues } from "../validation/schema.js";

export class AvniError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly responseBody: string,
  ) {
    super(message);
    this.name = "AvniError";
  }
}

export function externalId(email: string): string {
  return email.trim().toLowerCase().normalize("NFKC");
}

export function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function enrolmentExternalId(subjectExternalId: string, cohort: string): string {
  return `${subjectExternalId}::${slug(cohort)}`;
}

function todayIST(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function nowISTISO(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().replace(/Z$/, "+05:30");
}

function conceptValue(value: string | number | boolean): string | number {
  // Checkboxes are stored as the coded answer "Yes". `false` never reaches
  // here — observations() drops it, so an unticked optional box records
  // nothing rather than a spurious "Yes".
  if (typeof value === "boolean") return "Yes";
  return value;
}

function observations(fields: FieldValues, mapping: Record<string, string>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [fieldId, conceptName] of Object.entries(mapping)) {
    const value = fields[fieldId];
    // "" e.g. referralSourceOther when not "Other"; false = an unticked
    // optional checkbox, which must not become "Yes".
    if (value === undefined || value === "" || value === false) continue;
    out[conceptName] = conceptValue(value);
  }
  return out;
}

export function buildSubjectPayload(fields: FieldValues, e: Env) {
  return {
    "External ID": externalId(String(fields.email)),
    "Subject type": e.SUBJECT_TYPE,
    "Registration date": todayIST(),
    "First name": String(fields.organisationName),
    Address: e.ADDRESS,
    observations: observations(fields, REGISTRATION_CONCEPTS),
  };
}

export function buildEnrolmentPayload(fields: FieldValues, e: Env) {
  const subjectId = externalId(String(fields.email));
  return {
    "External ID": enrolmentExternalId(subjectId, e.COHORT),
    Program: e.PROGRAM,
    "Subject external ID": subjectId,
    "Enrolment datetime": nowISTISO(),
    observations: { Cohort: e.COHORT, ...observations(fields, ENROLMENT_CONCEPTS) },
    exitObservations: {},
  };
}

interface AvniResponse {
  status: number;
  body: Record<string, unknown>;
}

// One authenticated POST with the retry contract: any 401 → refresh the token
// once and retry that call once; 5xx → two retries (500 ms, 1500 ms); 10 s
// timeout per call. Other 4xx are configuration errors — no retry.
async function avniPost(path: string, payload: unknown, e: Env): Promise<AvniResponse> {
  let refreshed = false;
  let attempt = 0;
  const backoff = [500, 1500];

  for (;;) {
    // A token failure IS "Avni unreachable" — it must surface as AvniError so
    // the submission dead-letters (202 QUEUED) instead of erroring (500).
    let token: string;
    try {
      token = await getToken(e);
    } catch (err) {
      throw new AvniError(`Avni auth failed: ${String(err)}`, null, "");
    }
    let res: Response;
    try {
      res = await fetch(`${e.AVNI_BASE_URL}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "AUTH-TOKEN": token },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      if (attempt < backoff.length) {
        await new Promise((r) => setTimeout(r, backoff[attempt++]));
        continue;
      }
      throw new AvniError(`Avni unreachable: ${String(err)}`, null, "");
    }

    // Drain before retrying: undici holds the socket open until an unread
    // body is GC'd, so a retry loop leaks connections without this.
    if (res.status === 401 && !refreshed) {
      refreshed = true;
      clearToken();
      await res.arrayBuffer().catch(() => undefined);
      continue;
    }
    if (res.status >= 500 && attempt < backoff.length) {
      await res.arrayBuffer().catch(() => undefined);
      await new Promise((r) => setTimeout(r, backoff[attempt++]));
      continue;
    }

    const text = await res.text();
    if (!res.ok) throw new AvniError(`Avni ${path} HTTP ${res.status}`, res.status, text.slice(0, 2000));

    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // Some responses may not be JSON; the reference falls back to the submission id.
    }
    return { status: res.status, body };
  }
}

export async function postSubject(payload: unknown, e: Env): Promise<AvniResponse> {
  return avniPost("/api/subject", payload, e);
}

export async function postEnrolment(payload: unknown, e: Env): Promise<AvniResponse> {
  return avniPost("/api/programEnrolment", payload, e);
}

// LP-<first 8 hex of the enrolment UUID> — falls back to the submission id
// when the response carries no usable id.
export function referenceFrom(body: Record<string, unknown>, fallbackUuid: string): string {
  const id = body["ID"] ?? body["id"] ?? body["uuid"] ?? body["Uuid"];
  const source = typeof id === "string" && id.length >= 8 ? id : fallbackUuid;
  return `LP-${source.replace(/-/g, "").slice(0, 8)}`;
}
