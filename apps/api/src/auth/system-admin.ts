import type { UserDocument } from '../users/user.model';

export function listedAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  );
}

export function shouldBecomeAdminFromEnv(email: string): boolean {
  return listedAdminEmails().has(email.trim().toLowerCase());
}

/**
 * Если email указан в ADMIN_EMAILS — выставляет systemRole admin и сохраняет.
 */
export async function promoteListedAdminIfNeeded(
  user: UserDocument,
): Promise<void> {
  if (!shouldBecomeAdminFromEnv(user.email)) return;
  if (user.systemRole === 'admin') return;
  user.systemRole = 'admin';
  await user.save();
}

export function resolveSystemRole(user: {
  systemRole?: string;
}): 'user' | 'admin' {
  return user.systemRole === 'admin' ? 'admin' : 'user';
}
