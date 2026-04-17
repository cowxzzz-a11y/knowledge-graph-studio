import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const studioRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serviceKbRoot = resolve(studioRoot, "..", "knowledge-graph-service", "data", "knowledge_bases");
const targetPath = resolve(studioRoot, "public", "datasets", "knowledge-base-current.json");

function latestKnowledgeBaseDir(rootPath) {
  if (!existsSync(rootPath)) {
    throw new Error(`knowledge base directory not found: ${rootPath}`);
  }

  const candidates = readdirSync(rootPath)
    .map((name) => join(rootPath, name))
    .filter((candidate) => statSync(candidate).isDirectory())
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);

  if (!candidates.length) {
    throw new Error(`no knowledge base batches found under ${rootPath}`);
  }

  return candidates[0];
}

function main() {
  const latestDir = latestKnowledgeBaseDir(serviceKbRoot);
  const sourcePath = join(latestDir, "studio_dataset.json");

  if (!existsSync(sourcePath)) {
    throw new Error(`studio dataset not found: ${sourcePath}`);
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  copyFileSync(sourcePath, targetPath);

  const dataset = JSON.parse(readFileSync(targetPath, "utf8"));
  console.log(`source=${sourcePath}`);
  console.log(`target=${targetPath}`);
  console.log(`knowledgeBaseId=${dataset.metadata?.knowledgeBaseId ?? ""}`);
  console.log(`title=${dataset.metadata?.title ?? ""}`);
  console.log(`documents=${dataset.metadata?.documentCount ?? 0}`);
  console.log(`entities=${dataset.metadata?.entityCount ?? dataset.nodes?.length ?? 0}`);
  console.log(`relations=${dataset.metadata?.relationCount ?? 0}`);
}

main();
