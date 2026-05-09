import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  signDocumentUpload,
  signImageUpload,
  signReceiptImageUpload,
  signUserAvatarUpload,
} from '../../s3';
import { assertTripMemberAccess } from '../helpers/trip-access';
import { protectedProcedure, router } from '../trpc';

export const s3Router = router({
  getSignedImageUploadUrl: protectedProcedure
    .input(
      z.object({
        tripId: z.string(),
        filename: z.string().min(1).max(200),
        contentType: z.string().min(1).max(100),
        size: z.number().int().nonnegative(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tripModel } = ctx.models;
      await assertTripMemberAccess(input.tripId, ctx.authUser.sub, tripModel);

      try {
        return await signImageUpload({
          tripId: input.tripId,
          filename: input.filename,
          contentType: input.contentType,
          size: input.size,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Не удалось подготовить загрузку изображения';
        throw new TRPCError({ code: 'BAD_REQUEST', message });
      }
    }),
  getSignedAvatarUploadUrl: protectedProcedure
    .input(
      z.object({
        filename: z.string().min(1).max(200),
        contentType: z.string().min(1).max(100),
        size: z.number().int().nonnegative(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await signUserAvatarUpload({
          userId: ctx.authUser.sub,
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
  getSignedDocumentUploadUrl: protectedProcedure
    .input(
      z.object({
        tripId: z.string(),
        filename: z.string().min(1).max(200),
        contentType: z.string().min(1).max(100),
        size: z.number().int().nonnegative(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tripModel } = ctx.models;
      await assertTripMemberAccess(input.tripId, ctx.authUser.sub, tripModel);

      try {
        return await signDocumentUpload({
          tripId: input.tripId,
          filename: input.filename,
          contentType: input.contentType,
          size: input.size,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Не удалось подготовить загрузку документа';
        throw new TRPCError({ code: 'BAD_REQUEST', message });
      }
    }),
  getSignedReceiptImageUploadUrl: protectedProcedure
    .input(
      z.object({
        tripId: z.string(),
        filename: z.string().min(1).max(200),
        contentType: z.string().min(1).max(100),
        size: z.number().int().nonnegative(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tripModel } = ctx.models;
      await assertTripMemberAccess(input.tripId, ctx.authUser.sub, tripModel);

      try {
        return await signReceiptImageUpload({
          tripId: input.tripId,
          filename: input.filename,
          contentType: input.contentType,
          size: input.size,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Не удалось подготовить загрузку фото чека';
        throw new TRPCError({ code: 'BAD_REQUEST', message });
      }
    }),
});
