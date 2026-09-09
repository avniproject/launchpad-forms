import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

// @bugsnag/js ships CJS with types that don't resolve cleanly under NodeNext —
// require it and type the two calls we use.
interface BugsnagEvent {
  addMetadata(section: string, data: Record<string, unknown>): void;
}
interface BugsnagClient {
  start(opts: {
    apiKey: string;
    releaseStage: string;
    appVersion: string;
    redactedKeys: (string | RegExp)[];
  }): void;
  notify(error: Error, onError?: (event: BugsnagEvent) => void): void;
}
const bugsnagModule = require("@bugsnag/js") as BugsnagClient & { default?: BugsnagClient };
const Bugsnag: BugsnagClient = bugsnagModule.default ?? bugsnagModule;

let started = false;

export function startBugsnag(apiKey: string, releaseStage: string): void {
  if (!apiKey || started) return;
  Bugsnag.start({
    apiKey,
    releaseStage,
    appVersion: pkg.version,
    // The dead-letter payload and anything address-shaped stays out of reports.
    redactedKeys: [/email/i, /phone/i, /whatsapp/i, "payload"],
  });
  started = true;
}

export function notify(error: unknown, metadata?: Record<string, unknown>): void {
  if (!started) return;
  const err = error instanceof Error ? error : new Error(String(error));
  Bugsnag.notify(err, (event) => {
    if (metadata) event.addMetadata("submission", metadata);
  });
}
