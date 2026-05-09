import { TRPCError } from '@trpc/server';
import { Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { getWebOriginForInvite } from '../helpers/trip-access';
import { tripSettingsSchema } from '../helpers/schemas';
import { protectedProcedure, publicProcedure, router } from '../trpc';
import { packChecklistRouter } from './pack-checklist.router';

export const tripRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { tripModel } = ctx.models;
    const trips = await tripModel
      .find({ 'members.userId': new Types.ObjectId(ctx.authUser.sub) })
      .sort({ updatedAt: -1 });

    return trips.map((trip) => ({
      id: trip._id.toString(),
      title: trip.title,
      description: trip.description ?? '',
      membersCount: trip.members.length,
    }));
  }),
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(2).max(120),
        description: z.string().max(500).optional(),
        peopleCount: tripSettingsSchema.shape.peopleCount.optional(),
        startDate: tripSettingsSchema.shape.startDate.optional(),
        endDate: tripSettingsSchema.shape.endDate.optional(),
        timezone: tripSettingsSchema.shape.timezone.optional(),
        housingRequirements:
          tripSettingsSchema.shape.housingRequirements.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tripModel } = ctx.models;
      const trip = await tripModel.create({
        title: input.title,
        description: input.description,
        members: [
          { userId: new Types.ObjectId(ctx.authUser.sub), role: 'owner' },
        ],
        invites: [],
        ...(input.peopleCount !== undefined
          ? { peopleCount: input.peopleCount }
          : {}),
        ...(input.startDate ? { startDate: new Date(input.startDate) } : {}),
        ...(input.endDate ? { endDate: new Date(input.endDate) } : {}),
        ...(input.timezone ? { timezone: input.timezone } : {}),
        ...(input.housingRequirements
          ? { housingRequirements: input.housingRequirements }
          : {}),
      });

      return { id: trip._id.toString(), title: trip.title };
    }),
  byId: protectedProcedure
    .input(z.object({ tripId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { tripModel, userModel } = ctx.models;
      const trip = await tripModel.findById(input.tripId).lean();
      if (!trip) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Поездка не найдена',
        });
      }

      const viewerMembership = trip.members.find(
        (member) => member.userId.toString() === ctx.authUser.sub,
      );
      if (!viewerMembership) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Нет доступа к поездке',
        });
      }

      const typedTrip = trip;
      const peopleCount =
        typeof typedTrip.peopleCount === 'number' && typedTrip.peopleCount >= 1
          ? typedTrip.peopleCount
          : 4;

      const memberObjectIds = trip.members.map((m) => m.userId);
      const users =
        memberObjectIds.length > 0
          ? await userModel
              .find({ _id: { $in: memberObjectIds } })
              .select(['name', 'lastName', 'email', 'avatarUrl'])
              .lean()
          : [];
      const userById = new Map(
        users.map((u) => [u._id.toString(), u] as const),
      );

      return {
        id: trip._id.toString(),
        title: trip.title,
        description: trip.description ?? '',
        peopleCount,
        startDate: typedTrip.startDate
          ? new Date(typedTrip.startDate).toISOString()
          : null,
        endDate: typedTrip.endDate
          ? new Date(typedTrip.endDate).toISOString()
          : null,
        timezone:
          typeof typedTrip.timezone === 'string' && typedTrip.timezone
            ? typedTrip.timezone
            : 'Europe/Moscow',
        housingRequirements: Array.isArray(typedTrip.housingRequirements)
          ? typedTrip.housingRequirements
          : [],
        viewerRole: viewerMembership.role,
        members: trip.members.map((member) => {
          const uid = member.userId.toString();
          const doc = userById.get(uid) as
            | {
                name?: string;
                lastName?: string;
                email?: string;
                avatarUrl?: string;
              }
            | undefined;
          const firstName =
            typeof doc?.name === 'string' && doc.name.trim()
              ? doc.name.trim()
              : 'Участник';
          const lastName =
            typeof doc?.lastName === 'string' ? doc.lastName.trim() : '';
          const email = typeof doc?.email === 'string' ? doc.email.trim() : '';
          const avatarRaw = doc?.avatarUrl;
          const avatarUrl =
            typeof avatarRaw === 'string' && avatarRaw.trim().length > 0
              ? avatarRaw.trim()
              : null;

          return {
            userId: uid,
            role: member.role,
            firstName,
            lastName,
            email,
            avatarUrl,
            displayName:
              lastName.length > 0
                ? `${firstName} ${lastName}`.trim()
                : firstName,
          };
        }),
      };
    }),
  /** Публичный контекст для страницы жилья: расчёт ночей/«за человека» и право редактировать */
  forAccommodationsPage: publicProcedure
    .input(z.object({ tripId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { tripModel } = ctx.models;
      const trip = await tripModel.findById(input.tripId).lean();
      if (!trip) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Поездка не найдена',
        });
      }

      const viewerId = ctx.authUser?.sub;
      const canCollaborate =
        typeof viewerId === 'string' &&
        trip.members.some((m) => m.userId.toString() === viewerId);

      const peopleCount =
        typeof trip.peopleCount === 'number' && trip.peopleCount >= 1
          ? trip.peopleCount
          : 4;

      const housingRequirements = Array.isArray(trip.housingRequirements)
        ? trip.housingRequirements
        : [];

      return {
        canCollaborate,
        peopleCount,
        startDate: trip.startDate
          ? new Date(trip.startDate).toISOString()
          : null,
        endDate: trip.endDate ? new Date(trip.endDate).toISOString() : null,
        housingRequirements,
      };
    }),
  updateSettings: protectedProcedure
    .input(z.object({ tripId: z.string() }).merge(tripSettingsSchema))
    .mutation(async ({ ctx, input }) => {
      const { tripModel } = ctx.models;
      const trip = await tripModel.findById(input.tripId);
      if (!trip) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Поездка не найдена',
        });
      }

      const isMember = trip.members.some(
        (member) => member.userId.toString() === ctx.authUser.sub,
      );
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Нет доступа к поездке',
        });
      }

      trip.peopleCount = input.peopleCount;
      trip.timezone = input.timezone;
      trip.housingRequirements = input.housingRequirements;
      if ('startDate' in input) {
        trip.startDate =
          input.startDate != null ? new Date(input.startDate) : undefined;
      }
      if ('endDate' in input) {
        trip.endDate =
          input.endDate != null ? new Date(input.endDate) : undefined;
      }
      await trip.save();

      return {
        success: true as const,
        peopleCount: trip.peopleCount,
        startDate: trip.startDate ? trip.startDate.toISOString() : null,
        endDate: trip.endDate ? trip.endDate.toISOString() : null,
        timezone: trip.timezone,
        housingRequirements: trip.housingRequirements,
      };
    }),
  createInvite: protectedProcedure
    .input(z.object({ tripId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { tripModel } = ctx.models;
      const trip = await tripModel.findById(input.tripId);
      if (!trip) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Поездка не найдена',
        });
      }

      const isMember = trip.members.some(
        (member) => member.userId.toString() === ctx.authUser.sub,
      );
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Нет доступа к поездке',
        });
      }

      const code = randomBytes(16).toString('hex');
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
      trip.invites.push({
        code,
        createdAt: new Date(),
        expiresAt,
        used: false,
      });
      await trip.save();

      return {
        code,
        inviteUrl: `${getWebOriginForInvite()}/join/${code}`,
        expiresAt,
      };
    }),
  acceptInvite: protectedProcedure
    .input(z.object({ code: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      const { tripModel } = ctx.models;
      const trip = await tripModel.findOne({ 'invites.code': input.code });
      if (!trip) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Инвайт не найден',
        });
      }

      const invite = trip.invites.find((item) => item.code === input.code);
      if (!invite || invite.used || invite.expiresAt < new Date()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Инвайт недействителен',
        });
      }

      const alreadyMember = trip.members.some(
        (member) => member.userId.toString() === ctx.authUser.sub,
      );
      if (!alreadyMember) {
        trip.members.push({
          userId: new Types.ObjectId(ctx.authUser.sub),
          role: 'member',
        });
      }

      invite.used = true;
      await trip.save();
      return { tripId: trip._id.toString(), title: trip.title };
    }),
  packChecklist: packChecklistRouter,
  removeMember: protectedProcedure
    .input(
      z.object({
        tripId: z.string(),
        userId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tripModel } = ctx.models;
      const trip = await tripModel.findById(input.tripId);
      if (!trip) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Поездка не найдена',
        });
      }

      const actor = trip.members.find(
        (m) => m.userId.toString() === ctx.authUser.sub,
      );
      if (!actor || actor.role !== 'owner') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Только организатор может удалять участников',
        });
      }

      const target = trip.members.find(
        (m) => m.userId.toString() === input.userId,
      );
      if (!target) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Участник не найден в этой поездке',
        });
      }
      if (target.role === 'owner') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Нельзя удалить организатора поездки',
        });
      }

      trip.members = trip.members.filter(
        (m) => m.userId.toString() !== input.userId,
      );
      trip.packChecklistsByMember = (trip.packChecklistsByMember ?? []).filter(
        (p) => p.userId.toString() !== input.userId,
      );
      trip.markModified('packChecklistsByMember');
      await trip.save();
      return { success: true as const };
    }),
});
