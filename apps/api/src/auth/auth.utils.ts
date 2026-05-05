import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const DEFAULT_JWT_SECRET = 'dev-secret-change-me';

export type AuthTokenPayload = {
  sub: string;
  email: string;
  name: string;
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function signAccessToken(payload: AuthTokenPayload): string {
  const secret = process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET;
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): AuthTokenPayload | null {
  const secret = process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET;
  try {
    return jwt.verify(token, secret) as AuthTokenPayload;
  } catch {
    return null;
  }
}
