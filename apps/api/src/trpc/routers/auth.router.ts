import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  hashPassword,
  signAccessToken,
  verifyPassword,
} from '../../auth/auth.utils';
import { promoteListedAdminIfNeeded } from '../../auth/system-admin';
import { assertTrustedUserAvatarUrl } from '../../s3';
import { formatUserDisplayName } from '../../users/user-display-name';
import { toAuthClientUser } from '../helpers/auth-user';
import { authInputSchema } from '../helpers/schemas';
import { protectedProcedure, publicProcedure, router } from '../trpc';

export const authRouter = router({
  register: publicProcedure
    .input(authInputSchema.extend({ name: z.string().min(2).max(80) }))
    .mutation(async ({ input, ctx }) => {
      const { userModel } = ctx.models;
      const existing = await userModel.findOne({
        email: input.email.toLowerCase(),
      });
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Пользователь уже существует',
        });
      }

      const passwordHash = await hashPassword(input.password);
      const user = await userModel.create({
        email: input.email.toLowerCase(),
        name: input.name,
        passwordHash,
      });

      await promoteListedAdminIfNeeded(user);

      const displayName = formatUserDisplayName(user);
      const token = signAccessToken({
        sub: user._id.toString(),
        email: user.email,
        name: displayName,
      });

      return {
        token,
        user: toAuthClientUser(user),
      };
    }),
  login: publicProcedure
    .input(authInputSchema)
    .mutation(async ({ input, ctx }) => {
      const { userModel } = ctx.models;
      const user = await userModel.findOne({
        email: input.email.toLowerCase(),
      });
      if (!user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Неверный email или пароль',
        });
      }

      const isValid = await verifyPassword(input.password, user.passwordHash);
      if (!isValid) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Неверный email или пароль',
        });
      }

      await promoteListedAdminIfNeeded(user);

      const displayName = formatUserDisplayName(user);
      const token = signAccessToken({
        sub: user._id.toString(),
        email: user.email,
        name: displayName,
      });

      return {
        token,
        user: toAuthClientUser(user),
      };
    }),
  me: protectedProcedure.query(async ({ ctx }) => {
    const { userModel } = ctx.models;
    const user = await userModel.findById(ctx.authUser.sub);
    if (!user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Пользователь не найден',
      });
    }
    await promoteListedAdminIfNeeded(user);
    return toAuthClientUser(user);
  }),
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80).trim(),
        lastName: z.string().max(80).trim().optional(),
        avatarUrl: z.union([z.string().url().max(2048), z.null()]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { userModel } = ctx.models;
      const user = await userModel.findById(ctx.authUser.sub);
      if (!user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
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
          assertTrustedUserAvatarUrl(input.avatarUrl, ctx.authUser.sub);
          user.avatarUrl = input.avatarUrl.trim();
        }
      }
      await user.save();
      return toAuthClientUser(user);
    }),
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1).max(72),
        newPassword: z.string().min(8).max(72),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { userModel } = ctx.models;
      const user = await userModel.findById(ctx.authUser.sub);
      if (!user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Пользователь не найден',
        });
      }
      const valid = await verifyPassword(
        input.currentPassword,
        user.passwordHash,
      );
      if (!valid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Неверный текущий пароль',
        });
      }
      user.passwordHash = await hashPassword(input.newPassword);
      await user.save();
      return { success: true as const };
    }),
});
