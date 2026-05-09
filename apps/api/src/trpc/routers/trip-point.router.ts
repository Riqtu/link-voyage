import { TRPCError } from '@trpc/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { assertTripMemberAccess } from '../helpers/trip-access';
import { protectedProcedure, router } from '../trpc';

export const tripPointRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { tripModel, tripPointModel } = ctx.models;
      await assertTripMemberAccess(input.tripId, ctx.authUser.sub, tripModel);

      const points = await tripPointModel
        .find({ tripId: new Types.ObjectId(input.tripId) })
        .sort({ createdAt: 1 })
        .lean();

      return points.map((point) => ({
        id: point._id.toString(),
        tripId: point.tripId.toString(),
        title: point.title,
        description: point.description ?? '',
        category: point.category,
        coordinates: point.coordinates,
        imageUrl:
          typeof point.imageUrl === 'string' && point.imageUrl.trim().length > 0
            ? point.imageUrl.trim()
            : null,
        plannedAt: point.plannedAt
          ? new Date(point.plannedAt).toISOString()
          : null,
        createdBy: point.createdBy.toString(),
      }));
    }),
  create: protectedProcedure
    .input(
      z.object({
        tripId: z.string(),
        title: z.string().min(1).max(120),
        description: z.string().max(400).optional(),
        category: z
          .enum(['stay', 'food', 'sight', 'transport', 'other'])
          .default('sight'),
        coordinates: z.object({
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
        }),
        imageUrl: z.string().url().max(2048).optional(),
        plannedAt: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tripModel, tripPointModel } = ctx.models;
      await assertTripMemberAccess(input.tripId, ctx.authUser.sub, tripModel);

      const point = await tripPointModel.create({
        tripId: new Types.ObjectId(input.tripId),
        title: input.title,
        description: input.description,
        category: input.category,
        coordinates: input.coordinates,
        imageUrl: input.imageUrl?.trim(),
        plannedAt: input.plannedAt ? new Date(input.plannedAt) : undefined,
        createdBy: new Types.ObjectId(ctx.authUser.sub),
      });

      return { id: point._id.toString(), title: point.title };
    }),
  update: protectedProcedure
    .input(
      z.object({
        pointId: z.string(),
        title: z.string().min(1).max(120),
        description: z.string().max(400).optional(),
        category: z.enum(['stay', 'food', 'sight', 'transport', 'other']),
        coordinates: z.object({
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
        }),
        imageUrl: z.string().url().max(2048).optional(),
        plannedAt: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tripModel, tripPointModel } = ctx.models;
      const point = await tripPointModel.findById(input.pointId);
      if (!point) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Точка не найдена',
        });
      }
      await assertTripMemberAccess(
        point.tripId.toString(),
        ctx.authUser.sub,
        tripModel,
      );

      point.title = input.title;
      point.description = input.description;
      point.category = input.category;
      point.coordinates = input.coordinates;
      point.imageUrl = input.imageUrl?.trim();
      point.plannedAt = input.plannedAt ? new Date(input.plannedAt) : undefined;
      await point.save();

      return { success: true as const };
    }),
  delete: protectedProcedure
    .input(z.object({ pointId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { tripModel, tripPointModel } = ctx.models;
      const point = await tripPointModel.findById(input.pointId);
      if (!point) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Точка не найдена',
        });
      }
      await assertTripMemberAccess(
        point.tripId.toString(),
        ctx.authUser.sub,
        tripModel,
      );
      await point.deleteOne();
      return { success: true as const };
    }),
});
