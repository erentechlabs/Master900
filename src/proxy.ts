import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Early authentication gate for signed-in areas. Pages and actions still perform the authoritative checks
 * (database-backed session revocation, suspension and permissions); this proxy only turns anonymous requests
 * into a proper 307 redirect to the sign-in page instead of rendering a streamed shell first.
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/onboarding",
  "/learn",
  "/practice",
  "/quiz",
  "/diagnostic",
  "/labs",
  "/plan",
  "/progress",
  "/tutor",
  "/bookmarks",
  "/flashcards",
  "/settings",
  "/certificates",
  "/admin",
];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!isProtectedPath(pathname)) return NextResponse.next();
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET }).catch(() => null);
  if (token?.uid) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/sign-in";
  url.search = `?callbackUrl=${encodeURIComponent(`${pathname}${search}`)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/onboarding/:path*",
    "/learn/:path*",
    "/practice/:path*",
    "/quiz/:path*",
    "/diagnostic/:path*",
    "/labs/:path*",
    "/plan/:path*",
    "/progress/:path*",
    "/tutor/:path*",
    "/bookmarks/:path*",
    "/flashcards/:path*",
    "/settings/:path*",
    "/certificates/:path*",
    "/admin/:path*",
  ],
};
