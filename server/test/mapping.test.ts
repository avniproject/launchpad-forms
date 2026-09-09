import { describe, expect, it, beforeEach } from "vitest";
import { setTestEnv, validFields } from "./helpers.js";
import { env } from "../src/env.js";
import {
  buildSubjectPayload,
  buildEnrolmentPayload,
  externalId,
  enrolmentExternalId,
  slug,
} from "../src/avni/client.js";

beforeEach(() => {
  setTestEnv();
});

describe("External ID normalisation", () => {
  it("trims, lower-cases and NFKC-normalises the email", () => {
    expect(externalId("  Priya.Sharma@ABCFoundation.ORG ")).toBe("priya.sharma@abcfoundation.org");
  });

  it("derives the enrolment id as <externalId>::<slug(COHORT)>", () => {
    expect(enrolmentExternalId("priya@x.org", "Cohort 4 – Eastern India")).toBe(
      "priya@x.org::cohort-4-eastern-india",
    );
  });

  it("slug lower-cases and collapses non-alphanumerics", () => {
    expect(slug("Cohort 4 – Eastern India")).toBe("cohort-4-eastern-india");
    expect(slug("Cohort 5")).toBe("cohort-5");
  });
});

describe("subject payload", () => {
  it("uses the documented literal keys and carries the organisation as First name", () => {
    const p = buildSubjectPayload(validFields(), env());
    expect(p["External ID"]).toBe("priya.sharma@abcfoundation.org");
    expect(p["Subject type"]).toBe("Organisation");
    expect(p["First name"]).toBe("ABC Foundation");
    expect(p["Address"]).toBe("India");
    expect(p["Registration date"]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("always has observations, keyed by concept names, with checkbox consent as Yes", () => {
    const p = buildSubjectPayload(validFields(), env());
    expect(p.observations).toBeDefined();
    expect(p.observations["Contact person name"]).toBe("Priya Sharma");
    expect(p.observations["Contact email"]).toBe("Priya.Sharma@ABCFoundation.org");
    expect(p.observations["State"]).toBe("Odisha");
    expect(p.observations["Headquarters city"]).toBe("Bhubaneswar");
    expect(p.observations["Annual budget"]).toBe("₹50 lakh – ₹1 crore");
    expect(p.observations["Foundation year"]).toBe(2012);
    expect(p.observations["Consent to data use"]).toBe("Yes");
  });

  it("does not put the organisation name in observations", () => {
    const p = buildSubjectPayload(validFields(), env());
    expect(Object.values(p.observations)).not.toContain("ABC Foundation");
  });
});

describe("enrolment payload", () => {
  it("always carries observations AND exitObservations:{} (avni-server 500s otherwise)", () => {
    const p = buildEnrolmentPayload(validFields(), env());
    expect(p.observations).toBeDefined();
    expect(p.exitObservations).toEqual({});
  });

  it("sets Cohort from env, never from user input", () => {
    const p = buildEnrolmentPayload(validFields({ referralSource: "Other", referralSourceOther: "Cohort 9" }), env());
    expect(p.observations["Cohort"]).toBe("Cohort 4 – Eastern India");
  });

  it("links to the subject and stamps an IST enrolment datetime", () => {
    const p = buildEnrolmentPayload(validFields(), env());
    expect(p["Subject external ID"]).toBe("priya.sharma@abcfoundation.org");
    expect(p["External ID"]).toBe("priya.sharma@abcfoundation.org::cohort-4-eastern-india");
    expect(p["Program"]).toBe("Launchpad Application");
    expect(p["Enrolment datetime"]).toMatch(/\+05:30$/);
  });

  it("omits referralSourceOther when empty, includes it when Other is chosen", () => {
    const without = buildEnrolmentPayload(validFields(), env());
    expect(without.observations["Referral source other"]).toBeUndefined();
    const withOther = buildEnrolmentPayload(
      validFields({ referralSource: "Other", referralSourceOther: "A friend" }),
      env(),
    );
    expect(withOther.observations["Referral source other"]).toBe("A friend");
  });
});
