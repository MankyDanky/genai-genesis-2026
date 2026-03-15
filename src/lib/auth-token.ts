/**
 * Computes a SHA-256 based auth token from AUTH_PASSWORD.
 * Used by both the auth API route (to set the cookie) and
 * the middleware (to verify it). Edge-runtime compatible.
 */
export async function computeAuthToken(): Promise<string> {
  const password = process.env.AUTH_PASSWORD ?? "";
  const data = new TextEncoder().encode(`axiom-auth-token:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
