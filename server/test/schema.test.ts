import { describe, expect, it } from "vitest";
import { submitSchema, fieldErrors } from "../src/validation/schema.js";
import { submitBody, validFields, BYPASS, FORM_CODE } from "./helpers.js";

describe("submit schema", () => {
  it("accepts a fully valid body", () => {
    expect(submitSchema.safeParse(submitBody()).success).toBe(true);
  });

  it("rejects a bad email with a field error on email", () => {
    const r = submitSchema.safeParse(submitBody({ email: "not-an-email" }));
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).email).toBeDefined();
  });

  it("rejects a non-E.164 phone", () => {
    const r = submitSchema.safeParse(submitBody({ contactPhone: "98765" }));
    expect(r.success).toBe(false);
  });

  it("rejects an unknown coded answer", () => {
    const r = submitSchema.safeParse(submitBody({ annualBudget: "one billion dollars" }));
    expect(r.success).toBe(false);
  });

  it("rejects notes over the word cap", () => {
    const r = submitSchema.safeParse(submitBody({ currentChallenges: "word ".repeat(201) }));
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).currentChallenges).toContain("200");
  });

  it("requires referralSourceOther when referralSource is Other", () => {
    const r = submitSchema.safeParse(submitBody({ referralSource: "Other", referralSourceOther: "" }));
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).referralSourceOther).toBe("Please specify");
    const ok = submitSchema.safeParse(submitBody({ referralSource: "Other", referralSourceOther: "A friend" }));
    expect(ok.success).toBe(true);
  });

  it("requires the agreement and consent checkboxes to be true", () => {
    const r = submitSchema.safeParse(submitBody({ privacyConsent: false }));
    expect(r.success).toBe(false);
  });

  it("rejects out-of-range foundation year", () => {
    const r = submitSchema.safeParse(submitBody({ foundationYear: 1492 }));
    expect(r.success).toBe(false);
  });

  it("requires a captcha token", () => {
    const body = { code: FORM_CODE, captchaToken: "", _gotcha: "", fields: validFields() };
    expect(submitSchema.safeParse(body).success).toBe(false);
    expect(submitSchema.safeParse({ ...body, captchaToken: BYPASS }).success).toBe(true);
  });
});
