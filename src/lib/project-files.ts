export type ProjectFileKind = "html" | "style" | "script" | "asset" | "config" | "other";

export interface ProjectFile {
  path: string;
  content: string;
  kind: ProjectFileKind;
}

function normalizePath(path: string): string {
  return path.trim().replace(/^\.\//, "").replace(/\\/g, "/");
}

function inferKind(path: string): ProjectFileKind {
  const p = path.toLowerCase();
  if (p.endsWith(".html") || p.endsWith(".htm")) return "html";
  if (p.endsWith(".css")) return "style";
  if (p.endsWith(".js") || p.endsWith(".mjs") || p.endsWith(".ts")) return "script";
  if (p.endsWith(".json") || p.endsWith(".toml") || p.endsWith(".yaml") || p.endsWith(".yml")) return "config";
  if (/(png|jpg|jpeg|gif|svg|webp|mp3|wav|ogg|glb|gltf|obj|fbx)$/i.test(p)) return "asset";
  return "other";
}

export function normalizeProjectFiles(files: Array<Partial<ProjectFile>>): ProjectFile[] {
  const seen = new Set<string>();
  const normalized: ProjectFile[] = [];

  for (const file of files) {
    if (!file.path || typeof file.path !== "string") continue;
    const path = normalizePath(file.path);
    if (!path || seen.has(path)) continue;
    seen.add(path);

    const content = typeof file.content === "string" ? file.content : "";
    const kind = file.kind ?? inferKind(path);
    normalized.push({ path, content, kind });
  }

  return normalized;
}

function isLocalRef(ref: string): boolean {
  return !/^(https?:|data:|blob:|\/\/|#)/i.test(ref);
}

function fileMap(files: ProjectFile[]): Map<string, ProjectFile> {
  return new Map(files.map((f) => [normalizePath(f.path), f]));
}

function resolveFileRef(ref: string, files: Map<string, ProjectFile>): ProjectFile | null {
  const clean = normalizePath(ref.split("?")[0]?.split("#")[0] ?? ref);
  return files.get(clean) ?? files.get(clean.replace(/^src\//, "")) ?? null;
}

export function compileProjectToHtml(files: ProjectFile[]): string | null {
  if (files.length === 0) return null;

  const map = fileMap(files);
  const htmlFile = map.get("index.html") ?? files.find((f) => f.kind === "html") ?? null;

  if (!htmlFile) {
    const css = files.filter((f) => f.kind === "style").map((f) => f.content).join("\n\n");
    const js = files.filter((f) => f.kind === "script").map((f) => f.content).join("\n\n");
    return `<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\"><style>${css}</style></head><body><canvas id=\"game\"></canvas><script>${js}</script></body></html>`;
  }

  let html = htmlFile.content;

  html = html.replace(/<link[^>]*href=["']([^"']+)["'][^>]*>/gi, (full, href) => {
    if (!isLocalRef(href)) return full;
    const linked = resolveFileRef(href, map);
    if (!linked || linked.kind !== "style") return full;
    return `<style data-path=\"${linked.path}\">\n${linked.content}\n</style>`;
  });

  html = html.replace(/<script[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi, (full, src) => {
    if (!isLocalRef(src)) return full;
    const script = resolveFileRef(src, map);
    if (!script || script.kind !== "script") return full;
    return `<script data-path=\"${script.path}\">\n${script.content}\n</script>`;
  });

  return html;
}

export function projectFilesToPrompt(files: ProjectFile[]): string {
  if (files.length === 0) return "(none)";

  return files
    .map((f) => `### ${f.path}\n\n\`\`\`${f.kind === "script" ? "js" : f.kind === "style" ? "css" : f.kind === "html" ? "html" : "txt"}\n${f.content}\n\`\`\``)
    .join("\n\n");
}

export function isAssetFile(file: ProjectFile): boolean {
  return file.kind === "asset" || file.path.startsWith("assets/");
}

export function isCodeFile(file: ProjectFile): boolean {
  return file.kind === "html" || file.kind === "style" || file.kind === "script" || file.kind === "config";
}
