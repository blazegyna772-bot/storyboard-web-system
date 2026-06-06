import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "local-image-proxy",
      configureServer(server) {
        server.middlewares.use("/api/image/generate", async (req, res) => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: "Method not allowed" }));
            return;
          }

          try {
            const body = JSON.parse(await readBody(req));
            const baseUrl = String(body.baseUrl ?? "").replace(/\/+$/, "");
            const apiKey = String(body.apiKey ?? "");
            if (!baseUrl || !apiKey) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "Missing image baseUrl or API key" }));
              return;
            }

            const upstream = await fetch(`${baseUrl}/images/generations`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: body.model,
                prompt: body.prompt,
                size: body.size ?? "1024x1024",
                n: 1,
              }),
            });

            const text = await upstream.text();
            if (!upstream.ok) {
              res.statusCode = upstream.status;
              res.setHeader("Content-Type", "application/json");
              res.end(text);
              return;
            }

            const payload = JSON.parse(text);
            const first = payload.data?.[0];
            const imageUrl = first?.url ?? (first?.b64_json ? `data:image/png;base64,${first.b64_json}` : undefined);
            res.statusCode = imageUrl ? 200 : 502;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(imageUrl ? { imageUrl } : { error: "Image provider returned no url or b64_json" }));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown image proxy error" }));
          }
        });
      },
    },
  ],
});

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}
