import { pino } from "pino";
import { createHash } from "node:crypto";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
});

// Logs never carry a raw email — only this stable, unlinkable-enough handle
// that lets ops correlate a submission across lines.
export function emailHash(externalId: string): string {
  return createHash("sha256").update(externalId).digest("hex").slice(0, 12);
}
