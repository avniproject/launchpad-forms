import type { FastifyInstance } from "fastify";
import { env } from "../env.js";
import { buildFormConfig } from "../forms/launchpad-cohort.js";

export function registerFormConfig(app: FastifyInstance): void {
  app.get("/api/form-config", async (_req, reply) => {
    reply.header("cache-control", "public, max-age=60");
    return buildFormConfig(env());
  });
}
