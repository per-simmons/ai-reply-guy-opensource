import { NextResponse, type NextRequest } from "next/server";

// HTTP Basic Auth gate on every request. Single-user app — set
// WEBAPP_SECRET via `wrangler secret put WEBAPP_SECRET` and use any
// username with that secret as the password when the browser prompts.
//
// This is the only thing standing between the open internet and your
// X account / Claude API spend. Do not deploy without it set.

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

const UNAUTHORIZED = new NextResponse("Authentication required", {
  status: 401,
  headers: { "WWW-Authenticate": 'Basic realm="AI Reply Guy"' },
});

export function middleware(request: NextRequest) {
  const expected = process.env.WEBAPP_SECRET;

  if (!expected || expected.length < 16) {
    return new NextResponse(
      "Server misconfigured: WEBAPP_SECRET must be set (min 16 chars). " +
        "Run: npx wrangler secret put WEBAPP_SECRET",
      { status: 500 }
    );
  }

  const auth = request.headers.get("authorization");
  if (!auth || !auth.startsWith("Basic ")) return UNAUTHORIZED;

  let decoded: string;
  try {
    decoded = atob(auth.slice(6));
  } catch {
    return UNAUTHORIZED;
  }

  const colonIdx = decoded.indexOf(":");
  if (colonIdx === -1) return UNAUTHORIZED;
  const password = decoded.slice(colonIdx + 1);

  if (!timingSafeEqual(password, expected)) return UNAUTHORIZED;

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
