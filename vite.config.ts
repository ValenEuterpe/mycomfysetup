import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Local development proxy middleware matching Cloudflare Pages Function `/api/proxy`.
 * Forwards requests to arbitrary target ComfyUI / relay URLs to bypass browser CORS locally.
 */
function localProxyPlugin(): Plugin {
  return {
    name: "local-comfy-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith("/api/proxy")) {
          try {
            const parsed = new URL(req.url, "http://localhost:3000");
            const targetUrlStr = parsed.searchParams.get("url");

            if (!targetUrlStr) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Missing 'url' query parameter" }));
              return;
            }

            // Handle OPTIONS preflight
            if (req.method === "OPTIONS") {
              res.statusCode = 204;
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
              res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Api-Key");
              res.end();
              return;
            }

            // Collect request body if not GET/HEAD
            let bodyBuffer: Buffer | undefined;
            if (req.method !== "GET" && req.method !== "HEAD") {
              const chunks: Buffer[] = [];
              for await (const chunk of req) {
                chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
              }
              bodyBuffer = Buffer.concat(chunks);
            }

            // Prepare headers to forward
            const forwardHeaders: Record<string, string> = {};
            for (const [k, v] of Object.entries(req.headers)) {
              const lower = k.toLowerCase();
              if (lower === "host" || lower === "origin" || lower === "referer") continue;
              if (typeof v === "string") forwardHeaders[k] = v;
            }

            const fetchInit: RequestInit = {
              method: req.method,
              headers: forwardHeaders,
              redirect: "follow",
            };

            if (bodyBuffer && bodyBuffer.length > 0) {
              fetchInit.body = bodyBuffer;
            }

            const response = await fetch(targetUrlStr, fetchInit);

            res.statusCode = response.status;
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Api-Key");

            const contentType = response.headers.get("content-type");
            if (contentType) {
              res.setHeader("Content-Type", contentType);
            }

            const responseArrayBuffer = await response.arrayBuffer();
            res.end(Buffer.from(responseArrayBuffer));
          } catch (err: any) {
            console.error("Local proxy error:", err);
            res.statusCode = 502;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(JSON.stringify({ error: "Proxy forwarding error", message: err.message }));
          }
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localProxyPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
});
