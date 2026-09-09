// Failed submissions land here as one JSON line each — full payloads, so the
// file holds personal data: mode 0600, purged after replay (see RUNBOOK).
// scripts/replay.mjs re-POSTs them; idempotent upserts make replay always safe.
import { appendFile, mkdir, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import type { Env } from "./env.js";

export interface DeadLetterEntry {
  submissionId: string;
  receivedAt: string;
  cohort: string;
  payload: { subject: unknown; enrolment: unknown };
  error: { message: string; status: number | null; responseBody?: string };
}

export async function appendDeadLetter(entry: DeadLetterEntry, e: Env): Promise<void> {
  await mkdir(dirname(e.DEAD_LETTER_PATH), { recursive: true });
  await appendFile(e.DEAD_LETTER_PATH, JSON.stringify(entry) + "\n", { mode: 0o600 });
  // appendFile's mode only applies on create; enforce on every write in case
  // the file pre-existed with wider permissions.
  await chmod(e.DEAD_LETTER_PATH, 0o600);
}
