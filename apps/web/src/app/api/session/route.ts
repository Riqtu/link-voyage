import {
  LV_SESSION_COOKIE_MAX_AGE_SEC,
  LV_SESSION_COOKIE_NAME,
} from "@/lib/lv-session";
import { verifyLvAccessToken } from "@/lib/verify-lv-access-token";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

const postBodySchema = z.object({
  token: z.string().min(1),
});

export async function POST(request: Request) {
  let parsed: z.infer<typeof postBodySchema>;
  try {
    const raw: unknown = await request.json();
    parsed = postBodySchema.parse(raw);
  } catch {
    return NextResponse.json({ ok: false as const }, { status: 400 });
  }

  if (!(await verifyLvAccessToken(parsed.token))) {
    return NextResponse.json({ ok: false as const }, { status: 401 });
  }

  const jar = await cookies();
  jar.set(LV_SESSION_COOKIE_NAME, parsed.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: LV_SESSION_COOKIE_MAX_AGE_SEC,
  });

  return NextResponse.json({ ok: true as const });
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(LV_SESSION_COOKIE_NAME);
  return NextResponse.json({ ok: true as const });
}
