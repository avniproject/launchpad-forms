#!/usr/bin/env node
// Replay dead-lettered submissions into Avni. Safe to re-run: both Avni calls
// upsert on External ID. CAUTION: a stale replay overwrites newer answers from
// the same email — replay the same day, then purge the file (shred -u).
//
// Usage:
//   node scripts/replay.mjs                # dry run: list what would be sent
//   node scripts/replay.mjs --confirm      # actually POST to Avni
//
// Env: AVNI_BASE_URL, AVNI_USERNAME, AVNI_PASSWORD, DEAD_LETTER_PATH
import { readFile } from "node:fs/promises";

const confirm = process.argv.includes("--confirm");
const path = process.env.DEAD_LETTER_PATH ?? "dead-letter.jsonl";
const base = (process.env.AVNI_BASE_URL ?? "").replace(/\/$/, "");

const raw = await readFile(path, "utf8").catch(() => "");
const lines = raw.split("\n").filter(Boolean);
if (!lines.length) {
  console.log(`Nothing to replay — ${path} is empty or missing.`);
  process.exit(0);
}

const entries = lines.map((l) => JSON.parse(l));
console.log(`${entries.length} dead-lettered submission(s) in ${path}:\n`);
for (const e of entries) {
  console.log(`  ${e.submissionId}  receivedAt=${e.receivedAt}  cohort=${e.cohort}  error=${e.error?.message ?? "?"}`);
}

if (!confirm) {
  console.log("\nDry run. Re-run with --confirm to POST these to Avni.");
  console.log("Check receivedAt above — replaying stale entries overwrites newer answers.");
  process.exit(0);
}

if (!base || !process.env.AVNI_USERNAME || !process.env.AVNI_PASSWORD) {
  console.error("AVNI_BASE_URL / AVNI_USERNAME / AVNI_PASSWORD must be set.");
  process.exit(1);
}

const tokenRes = await fetch(`${base}/api/user/generateToken`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: process.env.AVNI_USERNAME, password: process.env.AVNI_PASSWORD }),
});
if (!tokenRes.ok) {
  console.error(`generateToken failed: HTTP ${tokenRes.status}`);
  process.exit(1);
}
const tokenBody = await tokenRes.json();
const token = tokenBody.authToken ?? tokenBody.token;

async function post(pathName, payload) {
  const res = await fetch(`${base}${pathName}`, {
    method: "POST",
    headers: { "content-type": "application/json", "AUTH-TOKEN": token },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`${pathName} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

let ok = 0;
let failed = 0;
for (const e of entries) {
  try {
    await post("/api/subject", e.payload.subject);
    await post("/api/programEnrolment", e.payload.enrolment);
    ok++;
    console.log(`✓ ${e.submissionId}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${e.submissionId}: ${err.message}`);
  }
}

console.log(`\nReplayed ${ok}/${entries.length} (${failed} failed).`);
if (ok === entries.length) console.log(`All replayed — purge the file now: shred -u ${path}`);
process.exit(failed ? 1 : 0);
