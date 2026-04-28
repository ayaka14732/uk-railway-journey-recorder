/*
 * Design reminder: Swiss International Style + SBB passenger-information system.
 * Server behaviour should protect the timetable-first UI by keeping API calls reliable in both dev and built preview modes.
 */
import express from "express";
import { spawn } from "child_process";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = process.cwd();
const fastApiTarget = process.env.FASTAPI_TARGET || "http://127.0.0.1:8000";

function startFastApiIfRequested() {
  if (process.env.DISABLE_FASTAPI_AUTOSTART === "1") return;

  const child = spawn(
    "python3.11",
    ["-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000"],
    {
      cwd: projectRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout.on("data", (chunk) => process.stdout.write(`[fastapi] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[fastapi] ${chunk}`));
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.warn(`FastAPI helper exited with code ${code}. If another process is already listening on port 8000, this is expected.`);
    }
  });

  process.on("exit", () => child.kill());
}

function collectRequestBody(req: express.Request): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  startFastApiIfRequested();

  app.use("/api", async (req, res) => {
    try {
      const body = await collectRequestBody(req);
      const targetUrl = `${fastApiTarget}${req.originalUrl}`;
      const headers = new Headers();

      for (const [key, value] of Object.entries(req.headers)) {
        if (!value || ["host", "connection", "content-length"].includes(key.toLowerCase())) continue;
        headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      }

      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: body.length > 0 && !["GET", "HEAD"].includes(req.method) ? body : undefined,
      });

      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (!["transfer-encoding", "content-encoding", "content-length"].includes(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });

      const responseBody = Buffer.from(await upstream.arrayBuffer());
      res.end(responseBody);
    } catch (error) {
      res.status(502).json({
        detail: `FastAPI backend is not reachable at ${fastApiTarget}. Start it with: pnpm api`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    console.log(`API proxy forwarding /api/* to ${fastApiTarget}`);
  });
}

startServer().catch(console.error);
