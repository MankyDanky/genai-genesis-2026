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

function guessMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    ico: "image/x-icon",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    glb: "model/gltf-binary",
    gltf: "model/gltf+json",
  };
  return mimeMap[ext ?? ""] ?? "application/octet-stream";
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

  html = html.replace(
    /<script([^>]*)\ssrc=["']([^"']+)["']([^>]*)><\/script>/gi,
    (full, beforeAttrs, src, afterAttrs) => {
    if (!isLocalRef(src)) return full;
    const script = resolveFileRef(src, map);
    if (!script || script.kind !== "script") return full;
      const combinedAttrs = `${beforeAttrs ?? ""} ${afterAttrs ?? ""}`.trim();
      const attrs = combinedAttrs.length > 0 ? ` ${combinedAttrs}` : "";
      return `<script${attrs} data-path=\"${script.path}\">\n${script.content}\n</script>`;
    }
  );

  // Inline local asset files referenced in <img src="..."> tags
  html = html.replace(/<img([^>]*)\ssrc=["']([^"']+)["']([^>]*)>/gi, (full, before, src, after) => {
    if (!isLocalRef(src)) return full;
    const asset = resolveFileRef(src, map);
    if (!asset) return full;
    const mime = guessMimeType(asset.path);
    const dataUrl = `data:${mime};base64,${btoa(asset.content)}`;
    return `<img${before} src="${dataUrl}"${after}>`;
  });

  // Inline local asset files referenced in CSS url("...") values
  html = html.replace(/url\(["']?([^"')]+)["']?\)/gi, (full, ref) => {
    if (!isLocalRef(ref)) return full;
    const asset = resolveFileRef(ref, map);
    if (!asset) return full;
    const mime = guessMimeType(asset.path);
    const dataUrl = `data:${mime};base64,${btoa(asset.content)}`;
    return `url("${dataUrl}")`;
  });

  return html;
}

/**
 * Replace inline data URLs with compact placeholders to avoid blowing up
 * the system prompt token count. A single base64 image can be 100K+ tokens.
 */
export function stripDataUrls(text: string): string {
  return text.replace(
    /data:([^;,]+?)(?:;base64)?,([A-Za-z0-9+/=\s]{200,})/g,
    (_match, mime: string, data: string) => {
      const sizeKB = Math.round((data.replace(/\s/g, "").length * 3) / 4 / 1024);
      return `[inline data-url: ${mime}, ~${sizeKB}KB]`;
    },
  );
}

export function projectFilesToPrompt(files: ProjectFile[]): string {
  if (files.length === 0) return "(none)";

  // Skip pure binary asset files — they can't be meaningfully shown in a prompt
  const codeFiles = files.filter((f) => f.kind !== "asset");
  if (codeFiles.length === 0) return "(none)";

  return codeFiles
    .map((f) => {
      const lang = f.kind === "script" ? "js" : f.kind === "style" ? "css" : f.kind === "html" ? "html" : "txt";
      const content = stripDataUrls(f.content);
      return `### ${f.path}\n\n\`\`\`${lang}\n${content}\n\`\`\``;
    })
    .join("\n\n");
}

export function isAssetFile(file: ProjectFile): boolean {
  return file.kind === "asset" || file.path.startsWith("assets/");
}

export function isCodeFile(file: ProjectFile): boolean {
  return file.kind === "html" || file.kind === "style" || file.kind === "script" || file.kind === "config";
}
