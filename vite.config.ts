import react from "@vitejs/plugin-react";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const studioRoot = dirname(fileURLToPath(import.meta.url));
const serviceDataRoot = resolve(studioRoot, "..", "knowledge-graph-service", "data");

function sendJson(response: import("node:http").ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload, null, 2);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(body);
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function listKnowledgeBaseDirs() {
  if (!existsSync(serviceDataRoot)) {
    return [];
  }

  return readdirSync(serviceDataRoot)
    .map((name) => {
      const dirPath = join(serviceDataRoot, name);
      const datasetPath = join(dirPath, "studio_dataset.json");
      if (!statSync(dirPath).isDirectory() || !existsSync(datasetPath)) {
        return null;
      }

      const stat = statSync(dirPath);
      let metadata: Record<string, unknown> = {};
      let summary: Record<string, unknown> = {};
      try {
        metadata = readJson(datasetPath).metadata || {};
      } catch {
        metadata = {};
      }
      try {
        summary = readJson(join(dirPath, "run_summary.json")) || {};
      } catch {
        summary = {};
      }

      return {
        id: name,
        title: String(metadata.title || summary.knowledge_base_title || name),
        dirName: name,
        lastModified: stat.mtime.toISOString(),
        mtimeMs: stat.mtimeMs,
        documentCount: Number(metadata.documentCount || summary.document_count || 0),
        entityCount: Number(metadata.entityCount || 0),
        relationCount: Number(metadata.relationCount || 0),
        datasetUrl: `/api/knowledge-bases/${encodeURIComponent(name)}/dataset`,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
}

function knowledgeBaseApiPlugin() {
  function register(server: import("vite").ViteDevServer | import("vite").PreviewServer) {
    server.middlewares.use((request, response, next) => {
      const pathname = new URL(request.url || "/", "http://local").pathname;
      if (pathname === "/api/knowledge-bases") {
        sendJson(response, 200, { items: listKnowledgeBaseDirs() });
        return;
      }

      const match = pathname.match(/^\/api\/knowledge-bases\/([^/]+)\/dataset$/);
      if (!match) {
        next();
        return;
      }

      const id = decodeURIComponent(match[1]);
      const item = listKnowledgeBaseDirs().find((candidate) => candidate.id === id);
      if (!item) {
        sendJson(response, 404, { error: `Knowledge base not found: ${id}` });
        return;
      }

      const datasetPath = join(serviceDataRoot, item.dirName, "studio_dataset.json");
      try {
        sendJson(response, 200, readJson(datasetPath));
      } catch (error) {
        sendJson(response, 500, { error: error instanceof Error ? error.message : "Unable to read dataset." });
      }
    });
  }

  return {
    name: "knowledge-base-data-api",
    configureServer(server: import("vite").ViteDevServer) {
      register(server);
    },
    configurePreviewServer(server: import("vite").PreviewServer) {
      register(server);
    },
  };
}

export default defineConfig({
  plugins: [react(), knowledgeBaseApiPlugin()],
  server: {
    host: "127.0.0.1",
    port: 4174,
    open: false,
  },
  preview: {
    host: "127.0.0.1",
    port: 4174,
  },
  build: {
    outDir: "build",
  },
});
