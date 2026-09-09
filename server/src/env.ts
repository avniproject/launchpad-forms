// Read at call time (not import time) so tests can set process.env per case.
export interface Env {
  PORT: number;
  AVNI_BASE_URL: string;
  AVNI_USERNAME: string;
  AVNI_PASSWORD: string;
  RECAPTCHA_SECRET: string;
  RECAPTCHA_BYPASS_TOKEN: string;
  BUGSNAG_KEY: string;
  COHORT: string;
  REG_OPEN: string;
  REG_CLOSE: string;
  SUBJECT_TYPE: string;
  PROGRAM: string;
  ADDRESS: string;
  DEAD_LETTER_PATH: string;
  LOG_LEVEL: string;
}

export function env(): Env {
  const e = process.env;
  return {
    PORT: Number(e.PORT ?? 4000),
    AVNI_BASE_URL: (e.AVNI_BASE_URL ?? "").replace(/\/$/, ""),
    AVNI_USERNAME: e.AVNI_USERNAME ?? "",
    AVNI_PASSWORD: e.AVNI_PASSWORD ?? "",
    RECAPTCHA_SECRET: e.RECAPTCHA_SECRET ?? "",
    RECAPTCHA_BYPASS_TOKEN: e.RECAPTCHA_BYPASS_TOKEN ?? "",
    BUGSNAG_KEY: e.BUGSNAG_KEY ?? "",
    COHORT: e.COHORT ?? "Cohort 4",
    REG_OPEN: e.REG_OPEN ?? "",
    REG_CLOSE: e.REG_CLOSE ?? "",
    SUBJECT_TYPE: e.SUBJECT_TYPE ?? "Organisation",
    PROGRAM: e.PROGRAM ?? "Launchpad Application",
    ADDRESS: e.ADDRESS ?? "India",
    DEAD_LETTER_PATH: e.DEAD_LETTER_PATH ?? "dead-letter.jsonl",
    LOG_LEVEL: e.LOG_LEVEL ?? "info",
  };
}

// The registration window. Empty bounds are open-ended.
export function windowOpen(e: Env, now: Date = new Date()): boolean {
  if (e.REG_OPEN && now < new Date(e.REG_OPEN)) return false;
  if (e.REG_CLOSE && now > new Date(e.REG_CLOSE)) return false;
  return true;
}
