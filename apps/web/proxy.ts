import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional sign-in redirect for deployments that add their own sign-in as an extension. Does nothing unless VANA_SIGNIN_URL is set.
 * When set, a visitor without the sign-in cookie is sent to that URL and returns to the page they asked for.
 * The API checks the cookie's signature; this only avoids showing the app to people who have not signed in.
 */
export function proxy(request: NextRequest) {
  const gate = process.env.VANA_SIGNIN_URL;
  if (!gate) return NextResponse.next();
  if (request.cookies.has(process.env.VANA_SIGNIN_COOKIE ?? "vana_signin")) return NextResponse.next();
  const url = new URL(gate);
  url.searchParams.set("next", request.nextUrl.href);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|woff2?)$).*)"],
};
