import { jwtVerify } from "jose/jwt/verify";

/** То же значение fallback, что `apps/api/src/auth/auth.utils.ts` (локальная разработка). */
const DEFAULT_JWT_SECRET = "dev-secret-change-me";

function jwtSecretBytes(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET);
}

/** Проверка access JWT (HS256), как выдаёт API при login/register. */
export async function verifyLvAccessToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, jwtSecretBytes(), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}
