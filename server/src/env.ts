// Read at call time (not import time) so tests can set process.env per case.
export interface Env {
  PORT: number;
  AVNI_BASE_URL: string;
  AVNI_USERNAME: string;
  AVNI_PASSWORD: string;
  RECAPTCHA_SECRET: string;
  RECAPTCHA_BYPASS_TOKEN: string;
  BUGSNAG_KEY: string;
  RELEASE_STAGE: string;
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
    // Separate from NODE_ENV: both UAT and prod run NODE_ENV=production,
    // so without this every UAT error lands in Bugsnag as "production".
    RELEASE_STAGE: e.RELEASE_STAGE ?? process.env.NODE_ENV ?? "development",
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

// A window bound: empty = open-ended, otherwise a parseable date. Anything
// else is a deploy misconfiguration, and both ways of guessing are wrong —
// treating it as open accepts applications past the advertised close, treating
// it as closed turns away real applicants. So it is an error, surfaced by
// assertWindowConfig() at startup before the service ever serves.
function boundOrThrow(name: string, value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${name} is not a valid date: ${JSON.stringify(value)} (expected ISO 8601, e.g. 2026-10-05T23:59:59+05:30)`);
  }
  return d;
}

// Call once at startup. Refusing to boot on a bad bound makes the failure
// immediate and obvious (systemd restart loop, ALB health check red) instead
// of silently shipping a form with the wrong window.
export function assertWindowConfig(e: Env = env()): void {
  boundOrThrow("REG_OPEN", e.REG_OPEN);
  boundOrThrow("REG_CLOSE", e.REG_CLOSE);
}

// The registration window. Empty bounds are open-ended. An unparseable bound
// closes the window rather than failing open — defence in depth behind
// assertWindowConfig, which should have stopped startup already.
export function windowOpen(e: Env, now: Date = new Date()): boolean {
  if (e.REG_OPEN) {
    const open = new Date(e.REG_OPEN);
    if (Number.isNaN(open.getTime()) || now < open) return false;
  }
  if (e.REG_CLOSE) {
    const close = new Date(e.REG_CLOSE);
    if (Number.isNaN(close.getTime()) || now > close) return false;
  }
  return true;
}
