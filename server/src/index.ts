import Fastify from "fastify";
import { env, windowOpen, assertWindowConfig } from "./env.js";
import { logger } from "./log.js";
import { startBugsnag } from "./bugsnag.js";
import { tokenCached } from "./avni/token.js";
import { registerFormConfig } from "./routes/formConfig.js";
import { registerSubmit } from "./routes/submit.js";

export function buildApp() {
  const app = Fastify({ logger: false, bodyLimit: 256 * 1024 });

  // The ALB health check — must never depend on Avni being up.
  app.get("/healthz", async () => {
    const e = env();
    return { ok: true, cohort: e.COHORT, open: windowOpen(e), tokenCached: tokenCached() };
  });

  registerFormConfig(app);
  registerSubmit(app);
  return app;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "");
if (isMain) {
  const e = env();
  try {
    assertWindowConfig(e);
  } catch (err) {
    logger.error({ err: String(err) }, "invalid registration window configuration");
    process.exit(1);
  }
  const missing = (["AVNI_BASE_URL", "AVNI_USERNAME", "AVNI_PASSWORD"] as const).filter((k) => !e[k]);
  if (missing.length) logger.warn({ missing }, "Avni credentials incomplete — submissions will dead-letter");
  startBugsnag(e.BUGSNAG_KEY, e.RELEASE_STAGE);

  const app = buildApp();
  // Loopback only — nginx is the front door (rate limiting, real IPs, TLS).
  app
    .listen({ port: e.PORT, host: "127.0.0.1" })
    .then(() => logger.info({ port: e.PORT, cohort: e.COHORT }, "launchpad-forms service up"))
    .catch((err) => {
      logger.error({ err: String(err) }, "failed to start");
      process.exit(1);
    });
}
