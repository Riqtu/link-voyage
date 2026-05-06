/** Имя для отображения в UI и JWT (имя + фамилия). */
export function formatUserDisplayName(user: {
  name?: string | null;
  lastName?: string | null;
}): string {
  const first = (user.name ?? '').trim();
  const last = (user.lastName ?? '').trim();
  if (!first && !last) return 'Участник';
  if (!last) return first;
  if (!first) return last;
  return `${first} ${last}`;
}
