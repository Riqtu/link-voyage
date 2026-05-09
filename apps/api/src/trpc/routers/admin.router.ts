import { TRPCError } from '@trpc/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { resolveSystemRole } from '../../auth/system-admin';
import { assertTrustedUserAvatarUrl, signUserAvatarUpload } from '../../s3';
import { formatUserDisplayName } from '../../users/user-display-name';
import { adminProcedure, router } from '../trpc';

export const adminRouter = router({
  listUsers: adminProcedure.query(async ({ ctx }) => {
    const { userModel } = ctx.models;
    const users = await userModel
      .find({})
      .sort({ email: 1 })
      .limit(500)
      .select(['email', 'name', 'lastName', 'avatarUrl', 'systemRole'])
      .lean();

    return {
      users: users.map((u) => {
        const avatarRaw = u.avatarUrl;
        return {
          id: u._id.toString(),
          email: u.email,
          name: u.name,
          lastName: u.lastName ?? '',
          displayName: formatUserDisplayName(u),
          avatarUrl:
            typeof avatarRaw === 'string' && avatarRaw.trim().length > 0
              ? avatarRaw.trim()
              : null,
          systemRole: resolveSystemRole(u),
        };
      }),
    };
  }),
  updateUserProfile: adminProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        name: z.string().min(1).max(80).trim(),
        lastName: z.string().max(80).trim().optional(),
        avatarUrl: z.union([z.string().url().max(2048), z.null()]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!Types.ObjectId.isValid(input.userId)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Некорректный идентификатор пользователя',
        });
      }
      const { userModel } = ctx.models;
      const user = await userModel.findById(input.userId);
      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Пользователь не найден',
        });
      }
      user.name = input.name;
      if (input.lastName !== undefined) {
        user.lastName = input.lastName.length > 0 ? input.lastName : undefined;
      }
      if (input.avatarUrl !== undefined) {
        if (input.avatarUrl === null) {
          user.avatarUrl = undefined;
        } else {
          assertTrustedUserAvatarUrl(input.avatarUrl, input.userId);
          user.avatarUrl = input.avatarUrl.trim();
        }
      }
      await user.save();
      return {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        lastName: user.lastName ?? '',
        displayName: formatUserDisplayName(user),
        avatarUrl:
          typeof user.avatarUrl === 'string' && user.avatarUrl.trim().length > 0
            ? user.avatarUrl.trim()
            : null,
        systemRole: resolveSystemRole(user),
      };
    }),
  getSignedAvatarUploadUrlForUser: adminProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        filename: z.string().min(1).max(200),
        contentType: z.string().min(1).max(100),
        size: z.number().int().nonnegative(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!Types.ObjectId.isValid(input.userId)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Некорректный идентификатор пользователя',
        });
      }
      const { userModel } = ctx.models;
      const exists = await userModel
        .findById(input.userId)
        .select('_id')
        .lean();
      if (!exists) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Пользователь не найден',
        });
      }
      try {
        return await signUserAvatarUpload({
          userId: input.userId,
          filename: input.filename,
          contentType: input.contentType,
          size: input.size,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Не удалось подготовить загрузку аватара';
        throw new TRPCError({ code: 'BAD_REQUEST', message });
      }
    }),
});
