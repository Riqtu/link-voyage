import { TRPCError } from '@trpc/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import {
  assertDocumentObjectKeyForTrip,
  buildPublicDocumentUrl,
  deleteDocumentObject,
} from '../../s3';
import { assertTripMemberAccess } from '../helpers/trip-access';
import { protectedProcedure, router } from '../trpc';

export const tripDocRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { tripModel, tripDocModel } = ctx.models;
      await assertTripMemberAccess(input.tripId, ctx.authUser.sub, tripModel);

      const docs = await tripDocModel
        .find({ tripId: new Types.ObjectId(input.tripId) })
        .sort({ createdAt: -1 })
        .lean();

      return docs.map((d) => {
        const rawCreated = (d as { createdAt?: Date | undefined }).createdAt;
        return {
          id: d._id.toString(),
          tripId: d.tripId.toString(),
          title: d.title,
          description: d.description ?? '',
          fileUrl: buildPublicDocumentUrl(d.objectKey),
          filename: d.originalFilename,
          contentType: d.contentType,
          createdBy: d.createdBy.toString(),
          createdAt:
            rawCreated instanceof Date ? rawCreated.toISOString() : null,
        };
      });
    }),
  create: protectedProcedure
    .input(
      z.object({
        tripId: z.string(),
        title: z.string().min(2).max(160),
        description: z.string().max(2000).optional().default(''),
        objectKey: z.string().min(12).max(500),
        originalFilename: z.string().min(1).max(200),
        contentType: z.string().min(3).max(120),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tripModel, tripDocModel } = ctx.models;
      await assertTripMemberAccess(input.tripId, ctx.authUser.sub, tripModel);
      assertDocumentObjectKeyForTrip(input.tripId, input.objectKey);

      const trimmedContentType =
        input.contentType.split(';')[0]?.trim() ?? input.contentType;

      const doc = await tripDocModel.create({
        tripId: new Types.ObjectId(input.tripId),
        title: input.title.trim(),
        description: (input.description ?? '').trim(),
        objectKey: input.objectKey,
        originalFilename: input.originalFilename.trim(),
        contentType: trimmedContentType,
        createdBy: new Types.ObjectId(ctx.authUser.sub),
      });

      return {
        id: doc._id.toString(),
        fileUrl: buildPublicDocumentUrl(doc.objectKey),
      };
    }),
  update: protectedProcedure
    .input(
      z.object({
        docId: z.string(),
        title: z.string().min(2).max(160),
        description: z.string().max(2000).optional().default(''),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tripModel, tripDocModel } = ctx.models;
      const doc = await tripDocModel.findById(input.docId);
      if (!doc) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Документ не найден',
        });
      }
      await assertTripMemberAccess(
        doc.tripId.toString(),
        ctx.authUser.sub,
        tripModel,
      );

      doc.title = input.title.trim();
      doc.description = (input.description ?? '').trim();
      await doc.save();

      return { success: true as const };
    }),
  delete: protectedProcedure
    .input(z.object({ docId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { tripModel, tripDocModel } = ctx.models;
      const doc = await tripDocModel.findById(input.docId);
      if (!doc) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Документ не найден',
        });
      }
      await assertTripMemberAccess(
        doc.tripId.toString(),
        ctx.authUser.sub,
        tripModel,
      );

      const key = doc.objectKey;
      try {
        await deleteDocumentObject(key);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Не удалось удалить объект из хранилища';
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message });
      }
      await doc.deleteOne();

      return { success: true as const };
    }),
});
