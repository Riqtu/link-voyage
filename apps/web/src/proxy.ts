import { LV_SESSION_COOKIE_NAME } from "@/lib/lv-session";
import { verifyLvAccessToken } from "@/lib/verify-lv-access-token";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname !== "/") {
    return NextResponse.next();
  }

  const token = request.cookies.get(LV_SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.next();
  }

  const valid = await verifyLvAccessToken(token);
  if (!valid) {
    const response = NextResponse.next();
    response.cookies.delete(LV_SESSION_COOKIE_NAME);
    return response;
  }

  const target = request.nextUrl.clone();
  target.pathname = "/trips";
  target.search = "";
  return NextResponse.redirect(target);
}

export const config = {
  matcher: ["/"],
};
