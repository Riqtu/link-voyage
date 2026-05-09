import { Types } from 'mongoose';
import { resolveSystemRole } from '../../auth/system-admin';
import { formatUserDisplayName } from '../../users/user-display-name';

export function toAuthClientUser(user: {
  _id: Types.ObjectId;
  email: string;
  name: string;
  lastName?: string;
  avatarUrl?: string;
  systemRole?: string;
}) {
  const avatarRaw = user.avatarUrl;
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    lastName: user.lastName ?? '',
    displayName: formatUserDisplayName(user),
    avatarUrl:
      typeof avatarRaw === 'string' && avatarRaw.trim().length > 0
        ? avatarRaw.trim()
        : null,
    systemRole: resolveSystemRole(user),
  };
}
