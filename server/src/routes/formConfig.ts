import type { FastifyInstance } from "fastify";
import { env } from "../env.js";
import { findForm } from "../forms/registry.js";

// GET /api/form-config?code=<code>
//
// The code selects the form. There is deliberately no default: a request with
// no code, or an unknown one, gets 404 — the bare domain must not serve a
// form, and an unknown code must be indistinguishable from a retired one.
export function registerFormConfig(app: FastifyInstance): void {
  app.get("/api/form-config", async (req, reply) => {
    const code = (req.query as { code?: string } | undefined)?.code;
    const form = findForm(code);
    if (!form) {
      // no-store: a 404 must not be cached, or fixing a bad code would need a
      // hard refresh on every applicant's browser.
      reply.header("cache-control", "no-store");
      return reply.code(404).send({ code: "FORM_NOT_FOUND" });
    }
    reply.header("cache-control", "public, max-age=60");
    return form.buildConfig(env());
  });
}
