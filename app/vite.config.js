import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { spawn } from "child_process";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    {
      name: "agent-results-saver",
      configureServer(server) {
        server.middlewares.use("/api/save-agent-results", (req, res) => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end("Method Not Allowed");
            return;
          }

          let body = "";
          req.on("data", (chunk) => { body += chunk.toString(); });
          req.on("end", () => {
            try {
              const data = JSON.parse(body);
              const json = JSON.stringify(data, null, 2);
              writeFileSync(join(__dirname, "../results/agent-results.json"), json);
              writeFileSync(join(__dirname, "public/agent-results.json"), json);
              res.setHeader("Content-Type", "application/json");
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: e.message }));
            }
          });
        });
      },
    },
    {
      name: "axe-runner",
      configureServer(server) {
        server.middlewares.use("/api/run-axe", (req, res) => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end("Method Not Allowed");
            return;
          }

          // Resolve actual port the dev server is listening on
          const addr = server.httpServer?.address();
          const port = addr?.port ?? 3000;
          const appUrl = `http://localhost:${port}`;

          const scriptPath = join(__dirname, "../scripts/run-axe.js");
          const child = spawn("node", [scriptPath], {
            env: { ...process.env, APP_URL: appUrl },
            cwd: join(__dirname, ".."),
          });

          let stderr = "";
          child.stderr.on("data", (d) => { stderr += d.toString(); });

          child.on("close", (code) => {
            res.setHeader("Content-Type", "application/json");
            if (code === 0) {
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true }));
            } else {
              res.statusCode = 500;
              res.end(JSON.stringify({ ok: false, error: stderr }));
            }
          });
        });
      },
    },
  ],
  server: { port: 3000 },
});
