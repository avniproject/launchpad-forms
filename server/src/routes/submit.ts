// POST /api/submit — the whole pipeline, in the contract's order:
// honeypot → validate → window → captcha → token → subject → enrolment.
// Avni failures return 202 QUEUED (the application is durably captured in the
// dead-letter file) — an error would make the applicant retype 25 answers for
// nothing.
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { env, windowOpen } from "../env.js";
import { logger, emailHash } from "../log.js";
import { notify } from "../bugsnag.js";
import { verifyCaptcha } from "../captcha.js";
import { appendDeadLetter } from "../deadletter.js";
import { submitSchema, fieldErrors } from "../validation/schema.js";
import { findForm } from "../forms/registry.js";
import {
  AvniError,
  buildSubjectPayload,
  buildEnrolmentPayload,
  postSubject,
  postEnrolment,
  externalId,
  referenceFrom,
} from "../avni/client.js";

function shortHex(uuid: string): string {
  return uuid.replace(/-/g, "").slice(0, 8);
}

export function registerSubmit(app: FastifyInstance): void {
  app.post("/api/submit", async (req, reply) => {
    const e = env();
    const submissionId = randomUUID();
    const started = Date.now();
    const body = req.body as { _gotcha?: string; captchaToken?: string; code?: string; fields?: Record<string, unknown> } | null;

    const log = (outcome: string, extra: Record<string, unknown> = {}) => {
      const email = body?.fields?.email;
      logger.info({
        submissionId,
        emailHash: typeof email === "string" ? emailHash(externalId(email)) : undefined,
        orgName: typeof body?.fields?.organisationName === "string" ? body.fields.organisationName : undefined,
        outcome,
        ms: Date.now() - started,
        ...extra,
      });
    };

    // Honeypot: bots that fill the invisible field get a convincing success
    // and nothing is stored.
    if (body?._gotcha) {
      log("honeypot");
      return reply.code(200).send({ code: "CREATED", reference: `LP-${shortHex(submissionId)}` });
    }

    // The code gates submission too, not just the form fetch: once a second
    // form exists, the code decides which schema and concept mapping apply, so
    // accepting a submission without one would validate against the wrong form.
    const form = findForm(body?.code);
    if (!form) {
      log("unknown_form_code");
      return reply.code(404).send({ code: "FORM_NOT_FOUND" });
    }

    const parsed = submitSchema.safeParse(body ?? {});
    if (!parsed.success) {
      const errors = fieldErrors(parsed.error);
      log("validation_failed", { fields: Object.keys(errors) });
      return reply.code(400).send({ code: "VALIDATION_FAILED", fieldErrors: errors });
    }

    if (!windowOpen(e)) {
      log("window_closed");
      return reply.code(403).send({ code: "REGISTRATION_CLOSED", closesAt: e.REG_CLOSE });
    }

    if (!(await verifyCaptcha(parsed.data.captchaToken, e))) {
      log("captcha_failed");
      return reply.code(400).send({ code: "CAPTCHA_FAILED" });
    }

    const fields = parsed.data.fields;
    const subject = buildSubjectPayload(fields, e);
    const enrolment = buildEnrolmentPayload(fields, e);

    try {
      await postSubject(subject, e);
      const enrolmentRes = await postEnrolment(enrolment, e);
      const reference = referenceFrom(enrolmentRes.body, submissionId);
      log("created", { avniStatus: enrolmentRes.status });
      return reply.code(200).send({ code: "CREATED", reference });
    } catch (err) {
      if (err instanceof AvniError) {
        try {
          await appendDeadLetter(
            {
              submissionId,
              receivedAt: new Date().toISOString(),
              cohort: e.COHORT,
              payload: { subject, enrolment },
              // First line of Avni's response — usually names the exact problem
              // (e.g. "Concept with name=X not found") without needing a replay.
              error: { message: err.message, status: err.status, responseBody: err.responseBody.split("\n")[0].slice(0, 300) },
            },
            e,
          );
        } catch (writeErr) {
          // The 202 below promises the application is durably captured. If the
          // write failed (unwritable DEAD_LETTER_PATH, full disk) that promise
          // is false, so do NOT claim success — page ops and let the applicant
          // retry while their answers are still in the form.
          notify(writeErr, { submissionId, stage: "dead_letter_write", avniStatus: err.status });
          log("dead_letter_failed", { avniStatus: err.status, error: String(writeErr) });
          return reply.code(500).send({ code: "INTERNAL" });
        }
        // Configuration errors mean every submission will fail identically
        // until a human fixes something — a renamed concept (4xx), or a bad
        // integration password / missing token-generation privilege ("auth").
        // Both queue silently behind a success screen, so both must page.
        // Transient 5xx and network failures do not: the retries and the
        // dead-letter file cover those, and paging would cry wolf.
        if (err.kind === "auth" || (err.status !== null && err.status < 500)) {
          notify(err, { submissionId, avniStatus: err.status, kind: err.kind });
        }
        log("queued", { avniStatus: err.status, error: err.message });
        return reply.code(202).send({ code: "QUEUED", reference: `LP-Q-${shortHex(submissionId)}` });
      }
      notify(err, { submissionId });
      log("internal_error", { error: String(err) });
      return reply.code(500).send({ code: "INTERNAL" });
    }
  });
}
