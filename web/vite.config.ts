import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { readFileSync } from "fs";

const PROXY_PREFIXES = ["/api", "/healthz"];

// Dev-only stand-in for the Fastify service, so the page is fully exercisable
// before server/ exists (or without running it). Serves the fixture at
// /api/form-config and accepts /api/submit with a fake reference. Never part
// of the built bundle (apply: "serve"). Disable with VITE_API_MOCK=0 to proxy
// to the real service on :4000 instead.
function devApiMock(): Plugin {
  return {
    name: "launchpad-dev-api-mock",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (url === "/api/form-config" && req.method === "GET") {
          res.setHeader("content-type", "application/json");
          res.end(readFileSync(path.resolve(__dirname, "src/fixtures/form-config.json")));
          return;
        }
        if (url === "/api/submit" && req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            console.log("[dev-api-mock] POST /api/submit", body.slice(0, 2000));
            res.statusCode = 200;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ code: "CREATED", reference: "LP-DEV00000" }));
          });
          return;
        }
        if (url === "/healthz") {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: true, cohort: "dev", open: true, tokenCached: false }));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const mockEnabled = env.VITE_API_MOCK !== "0";

  return {
    plugins: [react(), ...(mockEnabled ? [devApiMock()] : [])],
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    server: {
      port: 3020,
      proxy: mockEnabled
        ? undefined
        : Object.fromEntries(
            PROXY_PREFIXES.map((p) => [
              p,
              // 127.0.0.1, not localhost — the service binds IPv4 loopback only
              // and node resolves localhost to ::1 first.
              { target: "http://127.0.0.1:4000", changeOrigin: true },
            ]),
          ),
    },
  };
});
