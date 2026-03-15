export type RuntimeEnvMap = Record<string, string>;

export function getDefaultRuntimeEnv(): RuntimeEnvMap {
  const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999";
  const protocol = process.env.NEXT_PUBLIC_PARTYKIT_PROTOCOL || "";
  return {
    __PARTYKIT_HOST__: host,
    __PARTYKIT_PROTOCOL__: protocol,
  };
}

export function normalizeRuntimeEnv(input: unknown): RuntimeEnvMap {
  if (!input || typeof input !== "object") return {};
  const out: RuntimeEnvMap = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const normalizedKey = key.trim();
    if (!normalizedKey) continue;
    if (typeof value !== "string") continue;
    out[normalizedKey] = value;
  }
  return out;
}

