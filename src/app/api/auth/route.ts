import { NextRequest, NextResponse } from "next/server";
import { computeAuthToken } from "@/lib/auth-token";

export async function GET(req: NextRequest) {
  const authCookie = req.cookies.get("axiom-auth");
  const expected = await computeAuthToken();
  if (authCookie?.value === expected) {
    return NextResponse.json({ authenticated: true });
  }
  return NextResponse.json({ authenticated: false }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  const validUsername = process.env.AUTH_USERNAME;
  const validPassword = process.env.AUTH_PASSWORD;

  if (!validUsername || !validPassword) {
    return NextResponse.json(
      { error: "Authentication not configured" },
      { status: 503 }
    );
  }

  if (username === validUsername && password === validPassword) {
    const token = await computeAuthToken();
    const response = NextResponse.json({ ok: true });
    response.cookies.set("axiom-auth", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });
    return response;
  }

  return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
}
