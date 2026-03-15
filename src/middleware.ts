import { NextRequest, NextResponse } from "next/server";
import { computeAuthToken } from "@/lib/auth-token";

/** Routes that are fully protected (all methods). */
const PROTECTED_PREFIXES = [
  "/api/chat",
  "/api/generate-image",
  "/api/images/edit",
  "/api/images/upload",
  "/api/projects",
  "/api/sounds",
  "/api/meshes",
  "/api/sound-files",
];

/** Routes where only write methods (POST/PUT/PATCH/DELETE) are protected.
 *  GET requests remain public for explore/play pages. */
const WRITE_PROTECTED_PREFIXES = [
  "/api/games",
];

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function middleware(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const method = request.method;

  const isFullyProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  const isWriteProtected =
    WRITE_METHODS.has(method) &&
    WRITE_PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!isFullyProtected && !isWriteProtected) {
    return NextResponse.next();
  }

  const authCookie = request.cookies.get("axiom-auth");
  const expected = await computeAuthToken();
  if (authCookie?.value === expected) {
    return NextResponse.next();
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export const config = {
  matcher: "/api/:path*",
};
