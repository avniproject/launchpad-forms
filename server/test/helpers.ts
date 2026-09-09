import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FieldValues } from "../src/validation/schema.js";
import { FORM_CODES } from "../src/forms/registry.js";

// The code that maps to the Launchpad form; tests use the real registry so a
// renamed code fails loudly here rather than silently in production.
export const FORM_CODE = Object.keys(FORM_CODES)[0];

export const AVNI_BASE = "http://avni.test";
export const BYPASS = "test-bypass-token";

export function setTestEnv(overrides: Record<string, string> = {}): string {
  const deadLetter = join(mkdtempSync(join(tmpdir(), "lp-test-")), "dead-letter.jsonl");
  Object.assign(process.env, {
    AVNI_BASE_URL: AVNI_BASE,
    AVNI_USERNAME: "launchpad-forms@launchpaduat",
    AVNI_PASSWORD: "secret",
    RECAPTCHA_SECRET: "",
    RECAPTCHA_BYPASS_TOKEN: BYPASS,
    BUGSNAG_KEY: "",
    COHORT: "Cohort 4 – Eastern India",
    REG_OPEN: "",
    REG_CLOSE: "",
    SUBJECT_TYPE: "Organisation",
    PROGRAM: "Launchpad Application",
    ADDRESS: "India",
    DEAD_LETTER_PATH: deadLetter,
    ...overrides,
  });
  return deadLetter;
}

export function validFields(overrides: Partial<FieldValues> = {}): FieldValues {
  return {
    email: "Priya.Sharma@ABCFoundation.org",
    contactName: "Priya Sharma",
    contactRole: "Program Manager / Lead",
    contactRoleOther: "",
    contactPhone: "+919876543210",
    organisationName: "ABC Foundation",
    website: "https://abcfoundation.org",
    headquartersCity: "Bhubaneswar",
    headquartersState: "Odisha",
    foundationYear: 2012,
    annualBudget: "₹50 lakh – ₹1 crore",
    priorMisToolUse: "Yes, have used earlier",
    avniFamiliarity: "I have attended an Avni demo/webinar",
    interventionName: "Tracking health outreach visits",
    programOperationalSince: "2019",
    anticipatedDuration: "3 more years",
    fundingSecuredUntil: "March 2028",
    currentChallenges: "Paper registers and delayed reporting.",
    pilotUseCase: "Digitise outreach visit tracking for 20 field workers.",
    expectedFieldUsers: 20,
    misTeam: "Yes",
    dedicatedTeamMember: "Yes",
    pricingUnderstood: "Yes",
    paidPlanIntent: "I would like to discuss more",
    workshopLocation: "Bhubaneswar",
    referralSource: "NGO partner network",
    referralSourceOther: "",
    applicationAgreement: true,
    privacyConsent: true,
    ...overrides,
  };
}

export function submitBody(fieldOverrides: Partial<FieldValues> = {}, captchaToken: string = BYPASS) {
  return { code: FORM_CODE, captchaToken, _gotcha: "", fields: validFields(fieldOverrides) };
}
