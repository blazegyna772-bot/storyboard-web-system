import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "local-llm-proxy",
      configureServer(server) {
        server.middlewares.use("/api/llm/chat", async (req, res) => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: "Method not allowed" }));
            return;
          }

          try {
            const body = JSON.parse(await readBody(req));
            const baseUrl = String(body.baseUrl ?? "https://api.deepseek.com").replace(/\/+$/, "");
            const apiKey = String(body.apiKey ?? "");
            if (!apiKey) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "Missing API key" }));
              return;
            }

            const upstream = await fetch(`${baseUrl}/chat/completions`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: body.model,
                messages: body.messages,
                temperature: body.temperature ?? 0.2,
                max_tokens: body.maxTokens ?? 6000,
                ...(body.jsonMode ? { response_format: { type: "json_object" } } : {}),
              }),
            });

            const text = await upstream.text();
            res.statusCode = upstream.status;
            res.setHeader("Content-Type", "application/json");
            res.end(text);
          } catch (error) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown proxy error" }));
          }
        });
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
        server.middlewares.use("/api/projects", async (req, res) => {
          try {
            await handleProjectApi(req, res);
          } catch (error) {
            sendJson(res, 500, { error: error instanceof Error ? error.message : "Unknown project API error" });
          }
        });
      },
    },
  ],
});

const appConfigDir = path.join(os.homedir(), ".script-storyboard-system");
const appConfigFile = path.join(appConfigDir, "config.json");

async function handleProjectApi(req, res) {
  const method = req.method || "GET";
  const url = new URL(req.url || "", "http://localhost");
  const segments = url.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);

  if (segments[0] === "roots" && segments[1] === "remove" && method === "POST") {
    const body = JSON.parse(await readBody(req));
    const rootPath = path.resolve(String(body.rootPath || ""));
    const config = await readAppConfig();
    const roots = config.roots.filter((item) => item !== rootPath);
    await writeAppConfig({ roots, activeRootPath: config.activeRootPath === rootPath ? "" : config.activeRootPath });
    sendJson(res, 200, await getRootState());
    return;
  }

  if (segments[0] === "roots" && method === "GET") {
    sendJson(res, 200, await getRootState());
    return;
  }

  if (segments[0] === "roots" && method === "POST") {
    const body = JSON.parse(await readBody(req));
    const rootPath = path.resolve(String(body.rootPath || ""));
    if (!rootPath) return sendJson(res, 400, { error: "Missing rootPath" });
    await fs.mkdir(rootPath, { recursive: true });
    const config = await readAppConfig();
    const roots = [rootPath, ...config.roots.filter((item) => item !== rootPath)];
    await writeAppConfig({ ...config, roots, activeRootPath: rootPath });
    sendJson(res, 200, await getRootState());
    return;
  }

  if (!segments.length && method === "GET") {
    const rootPath = await requireActiveRoot();
    sendJson(res, 200, { projects: await listProjects(rootPath) });
    return;
  }

  if (!segments.length && method === "POST") {
    const rootPath = await requireActiveRoot();
    const body = JSON.parse(await readBody(req));
    const project = createProjectRecord(String(body.name || ""), body.options);
    await writeProject(rootPath, project);
    sendJson(res, 200, { project });
    return;
  }

  const projectId = decodeURIComponent(segments[0] || "");
  if (projectId && method === "GET") {
    const rootPath = await requireActiveRoot();
    sendJson(res, 200, { project: await readProject(rootPath, projectId, true) });
    return;
  }

  if (projectId && method === "PUT") {
    const rootPath = await requireActiveRoot();
    const body = JSON.parse(await readBody(req));
    await writeProject(rootPath, body.project);
    sendJson(res, 200, { project: body.project });
    return;
  }

  if (projectId && method === "DELETE") {
    const rootPath = await requireActiveRoot();
    const projects = await listProjects(rootPath);
    const target = projects.find((project) => project.projectId === projectId);
    if (!target) return sendJson(res, 404, { error: "Project not found" });
    await fs.rm(path.join(rootPath, target.folderName || target.name), { recursive: true, force: true });
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

async function getRootState() {
  const config = await readAppConfig();
  return {
    roots: config.roots.map((rootPath) => ({
      rootPath,
      rootName: path.basename(rootPath),
      isActive: rootPath === config.activeRootPath,
    })),
    activeRootPath: config.activeRootPath,
  };
}

async function readAppConfig() {
  try {
    const raw = await fs.readFile(appConfigFile, "utf8");
    const parsed = JSON.parse(raw);
    return {
      roots: Array.isArray(parsed.roots) ? parsed.roots : [],
      activeRootPath: String(parsed.activeRootPath || ""),
    };
  } catch {
    return { roots: [], activeRootPath: "" };
  }
}

async function writeAppConfig(config) {
  await fs.mkdir(appConfigDir, { recursive: true });
  await fs.writeFile(appConfigFile, JSON.stringify(config, null, 2));
}

async function requireActiveRoot() {
  const config = await readAppConfig();
  if (!config.activeRootPath) throw new Error("未配置当前项目根目录");
  await fs.mkdir(config.activeRootPath, { recursive: true });
  return config.activeRootPath;
}

async function listProjects(rootPath) {
  const entries = await fs.readdir(rootPath, { withFileTypes: true }).catch(() => []);
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const project = await readProjectByFolder(rootPath, entry.name, false);
    if (project) projects.push(project);
  }
  return projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

async function readProject(rootPath, projectId, includeScript) {
  const projects = await listProjects(rootPath);
  const target = projects.find((project) => project.projectId === projectId);
  if (!target) throw new Error("Project not found");
  return readProjectByFolder(rootPath, target.folderName || target.name, includeScript);
}

async function readProjectByFolder(rootPath, folderName, includeScript) {
  try {
    const projectDir = path.join(rootPath, folderName);
    const manifest = JSON.parse(await fs.readFile(path.join(projectDir, "project.json"), "utf8"));
    const script = includeScript ? await readProjectScript(projectDir) : "";
    return {
      projectId: manifest.projectId,
      name: manifest.name || folderName,
      folderName: manifest.folderName || folderName,
      rootName: path.basename(rootPath),
      updatedAt: manifest.updatedAt || new Date().toISOString(),
      script,
      options: manifest.options,
      analysis: manifest.analysis || emptyAnalysis(manifest.options),
      latestRun: manifest.latestRun || null,
      artifacts: manifest.artifacts || [],
      locks: manifest.locks || [],
      tasks: manifest.tasks || [],
      imageCandidates: manifest.imageCandidates || [],
    };
  } catch {
    return null;
  }
}

async function readProjectScript(projectDir) {
  const episodesDir = path.join(projectDir, "input", "episodes");
  const episodeFiles = await fs.readdir(episodesDir).catch(() => []);
  const txtFiles = episodeFiles.filter((file) => file.endsWith(".txt")).sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }));
  if (txtFiles.length) {
    const texts = await Promise.all(txtFiles.map((file) => fs.readFile(path.join(episodesDir, file), "utf8")));
    return texts.map((text) => text.trim()).filter(Boolean).join("\n\n");
  }
  return fs.readFile(path.join(projectDir, "input", "script.txt"), "utf8").catch(() => "");
}

async function writeProject(rootPath, project) {
  const folderName = toSafeFolderName(project.folderName || project.name);
  const projectDir = path.join(rootPath, folderName);
  const episodesDir = path.join(projectDir, "input", "episodes");
  await fs.mkdir(episodesDir, { recursive: true });
  await fs.mkdir(path.join(projectDir, "config"), { recursive: true });
  await fs.mkdir(path.join(projectDir, "artifacts"), { recursive: true });
  await fs.mkdir(path.join(projectDir, "exports"), { recursive: true });
  await fs.rm(episodesDir, { recursive: true, force: true });
  await fs.mkdir(episodesDir, { recursive: true });
  const episodes = project.analysis?.episodes?.length ? project.analysis.episodes : [{ episodeId: "EP01", sourceText: project.script || "" }];
  for (const episode of episodes) {
    await fs.writeFile(path.join(episodesDir, `${episode.episodeId || "EP01"}.txt`), episode.sourceText || "");
  }
  await fs.writeFile(path.join(projectDir, "project.json"), JSON.stringify({ ...project, script: "", folderName }, null, 2));
}

function createProjectRecord(name, options) {
  const now = new Date().toISOString();
  const safeName = name.trim() || createDefaultProjectName();
  return {
    projectId: `PRJ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`,
    name: safeName,
    folderName: toSafeFolderName(safeName),
    updatedAt: now,
    script: "",
    options,
    analysis: emptyAnalysis(options),
    latestRun: null,
    artifacts: [],
    locks: [],
    tasks: [],
    imageCandidates: [],
  };
}

function emptyAnalysis(options) {
  return { totalCharacters: 0, options, episodes: [], warnings: [] };
}

function createDefaultProjectName() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-001`;
}

function toSafeFolderName(value) {
  return String(value || "").trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ") || createDefaultProjectName();
}

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
