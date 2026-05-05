import { initTRPC, TRPCError } from '@trpc/server';
import { Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import superjson from 'superjson';
import { z } from 'zod';
import {
  hashPassword,
  signAccessToken,
  verifyPassword,
} from '../auth/auth.utils';
import { getUsdRubRateFromCbr } from '../forex/cbr-usd-rub';
import { enrichAccommodationFromUrl } from '../gemini/enrich-accommodation-from-url';
import { fetchLinkPreview } from '../link-preview/link-preview';
import {
  assertDocumentObjectKeyForTrip,
  buildPublicDocumentUrl,
  deleteDocumentObject,
  signDocumentUpload,
  signImageUpload,
} from '../s3';
import { TrpcContext } from './trpc.context';

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.authUser) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Требуется авторизация',
    });
  }
  return next({ ctx: { ...ctx, authUser: ctx.authUser } });
});

const authInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
});

/** ISO-строка даты или null (сброс); при отсутствии ключа в запросе дату не трогаем */
const tripDateSettingSchema = z
  .union([z.string().datetime(), z.null()])
  .optional();

const tripSettingsSchema = z.object({
  peopleCount: z.number().int().min(1).max(99),
  startDate: tripDateSettingSchema,
  endDate: tripDateSettingSchema,
  timezone: z.string().min(2).max(80).default('Europe/Moscow'),
  housingRequirements: z.array(z.string().min(1).max(40)).max(20).default([]),
});

const accommodationInputSchema = z.object({
  title: z.string().min(2).max(160),
  provider: z.string().max(120).optional(),
  sourceUrl: z.string().url().optional(),
  locationLabel: z.string().max(120).optional(),
  coordinates: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
  price: z.number().positive().optional(),
  pricingMode: z.enum(['total', 'perNight', 'perPerson']).default('total'),
  currency: z.string().min(3).max(3).default('EUR'),
  rating: z.number().min(0).max(10).optional(),
  freeCancellation: z.boolean().default(false),
  amenities: z.array(z.string().min(1).max(30)).max(20).default([]),
  notes: z.string().max(500).optional(),
  previewDescription: z.string().max(8000).optional(),
  previewImages: z.array(z.string().url()).max(8).optional(),
});

async function assertTripMemberAccess(
  tripId: string,
  userId: string,
  tripModel: TrpcContext['models']['tripModel'],
) {
  const trip = await tripModel.findById(tripId).lean();
  if (!trip) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Поездка не найдена' });
  }
  const isMember = trip.members.some(
    (member) => member.userId.toString() === userId,
  );
  if (!isMember) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Нет доступа к поездке',
    });
  }
}

async function assertTripExists(
  tripId: string,
  tripModel: TrpcContext['models']['tripModel'],
) {
  const trip = await tripModel.findById(tripId).lean();
  if (!trip) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Поездка не найдена' });
  }
}

export const appRouter = t.router({
  health: publicProcedure.query(() => ({
    status: 'ok',
    service: 'api',
  })),
  auth: t.router({
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

        const token = signAccessToken({
          sub: user._id.toString(),
          email: user.email,
          name: user.name,
        });

        return {
          token,
          user: { id: user._id.toString(), email: user.email, name: user.name },
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

        const token = signAccessToken({
          sub: user._id.toString(),
          email: user.email,
          name: user.name,
        });

        return {
          token,
          user: { id: user._id.toString(), email: user.email, name: user.name },
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
      return { id: user._id.toString(), email: user.email, name: user.name };
    }),
  }),
  trip: t.router({
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
          typeof typedTrip.peopleCount === 'number' &&
          typedTrip.peopleCount >= 1
            ? typedTrip.peopleCount
            : 4;

        const memberObjectIds = trip.members.map((m) => m.userId);
        const users =
          memberObjectIds.length > 0
            ? await userModel
                .find({ _id: { $in: memberObjectIds } })
                .select(['name'])
                .lean()
            : [];
        const nameByUserId = new Map(
          users.map((user) => [user._id.toString(), user.name as string]),
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
          members: trip.members.map((member) => ({
            userId: member.userId.toString(),
            role: member.role,
            name: nameByUserId.get(member.userId.toString()) ?? 'Участник',
          })),
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
          inviteUrl: `${process.env.WEB_ORIGIN ?? 'http://localhost:3000'}/join/${code}`,
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
        await trip.save();
        return { success: true as const };
      }),
  }),
  accommodation: t.router({
    geocodeByQuery: protectedProcedure
      .input(
        z.object({
          query: z.string().min(3).max(200),
          limit: z.number().int().min(1).max(8).default(5),
        }),
      )
      .mutation(async ({ input }) => {
        const apiKey = process.env.GOOGLE_GEOCODING_API_KEY;
        if (!apiKey) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Не настроен GOOGLE_GEOCODING_API_KEY',
          });
        }

        const url = new URL(
          'https://maps.googleapis.com/maps/api/geocode/json',
        );
        url.searchParams.set('address', input.query);
        url.searchParams.set('key', apiKey);
        url.searchParams.set('language', 'ru');

        const response = await fetch(url.toString());
        if (!response.ok) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Не удалось получить координаты по адресу',
          });
        }

        const raw = (await response.json()) as {
          status?: string;
          error_message?: string;
          results?: Array<{
            formatted_address?: string;
            geometry?: { location?: { lat?: number; lng?: number } };
          }>;
        };
        if (
          raw.status &&
          raw.status !== 'OK' &&
          raw.status !== 'ZERO_RESULTS'
        ) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: raw.error_message || 'Google Geocoding вернул ошибку',
          });
        }

        return (raw.results ?? [])
          .slice(0, input.limit)
          .map((item) => ({
            label: item.formatted_address ?? '',
            lat: item.geometry?.location?.lat ?? Number.NaN,
            lng: item.geometry?.location?.lng ?? Number.NaN,
          }))
          .filter(
            (item) =>
              item.label &&
              Number.isFinite(item.lat) &&
              Number.isFinite(item.lng) &&
              item.lat >= -90 &&
              item.lat <= 90 &&
              item.lng >= -180 &&
              item.lng <= 180,
          );
      }),
    previewFromUrl: protectedProcedure
      .input(z.object({ url: z.string().min(10).max(2048) }))
      .mutation(async ({ input }) => {
        try {
          return await fetchLinkPreview(input.url);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Не удалось разобрать ссылку';
          throw new TRPCError({ code: 'BAD_REQUEST', message });
        }
      }),
    enrichFromGeminiUrl: protectedProcedure
      .input(z.object({ url: z.string().min(10).max(2048) }))
      .mutation(async ({ input }) => {
        try {
          return await enrichAccommodationFromUrl(input.url);
        } catch (error) {
          const rawMessage =
            error instanceof Error ? error.message : String(error);
          if (rawMessage.includes('GEMINI_API_KEY')) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message:
                'На сервере не настроен GEMINI_API_KEY. Добавьте ключ API Google AI.',
            });
          }
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: rawMessage || 'Не удалось обработать ссылку через Gemini',
          });
        }
      }),
    list: publicProcedure
      .input(
        z.object({
          tripId: z.string(),
          search: z.string().optional(),
          minPrice: z.number().optional(),
          maxPrice: z.number().optional(),
          status: z.enum(['shortlisted', 'rejected', 'booked']).optional(),
          freeCancellationOnly: z.boolean().optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const { tripModel, accommodationModel } = ctx.models;
        await assertTripExists(input.tripId, tripModel);

        const selfId = ctx.authUser?.sub;

        const andParts: Record<string, unknown>[] = [
          { tripId: new Types.ObjectId(input.tripId) },
        ];
        if (input.status) andParts.push({ status: input.status });
        if (input.freeCancellationOnly) {
          andParts.push({ freeCancellation: true });
        }
        if (input.search) {
          andParts.push({
            title: { $regex: input.search, $options: 'i' },
          });
        }
        if (input.minPrice !== undefined || input.maxPrice !== undefined) {
          const range: Record<string, number> = {};
          if (input.minPrice !== undefined) range.$gte = input.minPrice;
          if (input.maxPrice !== undefined) range.$lte = input.maxPrice;
          /* legacy: записи могли сохраниться с полем pricePerNight до миграции */
          andParts.push({
            $or: [{ price: range }, { pricePerNight: range }],
          });
        }

        const query = andParts.length === 1 ? andParts[0] : { $and: andParts };

        const options = await accommodationModel
          .find(query)
          // Stable ordering: keep cards in creation order so edits do not "jump" items.
          .sort({ createdAt: -1, _id: -1 })
          .lean();

        return options.map((item) => {
          const legacy = item as typeof item & { pricePerNight?: number };
          const resolvedPrice =
            typeof item.price === 'number'
              ? item.price
              : typeof legacy.pricePerNight === 'number'
                ? legacy.pricePerNight
                : null;

          const upVotes = item.votes.filter(
            (vote) => vote.value === 'up',
          ).length;
          const downVotes = item.votes.filter(
            (vote) => vote.value === 'down',
          ).length;
          return {
            id: item._id.toString(),
            tripId: item.tripId.toString(),
            title: item.title,
            provider: item.provider ?? '',
            sourceUrl: item.sourceUrl ?? '',
            locationLabel: item.locationLabel ?? '',
            coordinates: item.coordinates
              ? {
                  lat: item.coordinates.lat,
                  lng: item.coordinates.lng,
                }
              : null,
            price: resolvedPrice,
            pricingMode:
              item.pricingMode === 'perNight' ||
              item.pricingMode === 'perPerson'
                ? item.pricingMode
                : 'total',
            currency: item.currency,
            rating: item.rating ?? null,
            freeCancellation: item.freeCancellation,
            amenities: item.amenities,
            status: item.status,
            noLongerAvailable: item.noLongerAvailable === true,
            notes: item.notes ?? '',
            previewDescription: item.previewDescription ?? '',
            previewImages: item.previewImages ?? [],
            createdBy: item.createdBy.toString(),
            upVotes,
            downVotes,
            userVote:
              selfId !== undefined
                ? (item.votes.find((vote) => vote.userId.toString() === selfId)
                    ?.value ?? null)
                : null,
          };
        });
      }),
    create: protectedProcedure
      .input(z.object({ tripId: z.string() }).merge(accommodationInputSchema))
      .mutation(async ({ ctx, input }) => {
        const { tripModel, accommodationModel } = ctx.models;
        await assertTripMemberAccess(input.tripId, ctx.authUser.sub, tripModel);

        const option = await accommodationModel.create({
          tripId: new Types.ObjectId(input.tripId),
          title: input.title,
          provider: input.provider,
          sourceUrl: input.sourceUrl,
          locationLabel: input.locationLabel,
          coordinates: input.coordinates,
          price: input.price,
          pricingMode: input.pricingMode,
          currency: input.currency.toUpperCase(),
          rating: input.rating,
          freeCancellation: input.freeCancellation,
          amenities: input.amenities,
          notes: input.notes,
          previewDescription: input.previewDescription,
          previewImages: input.previewImages ?? [],
          createdBy: new Types.ObjectId(ctx.authUser.sub),
          status: 'shortlisted',
          noLongerAvailable: false,
          votes: [],
        });

        return { id: option._id.toString(), title: option.title };
      }),
    update: protectedProcedure
      .input(z.object({ optionId: z.string() }).merge(accommodationInputSchema))
      .mutation(async ({ ctx, input }) => {
        const { tripModel, accommodationModel } = ctx.models;
        const option = await accommodationModel.findById(input.optionId);
        if (!option) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Вариант жилья не найден',
          });
        }
        await assertTripMemberAccess(
          option.tripId.toString(),
          ctx.authUser.sub,
          tripModel,
        );

        option.title = input.title;
        option.provider = input.provider;
        option.sourceUrl = input.sourceUrl;
        option.locationLabel = input.locationLabel;
        option.coordinates = input.coordinates;
        option.price = input.price;
        option.pricingMode = input.pricingMode;
        option.currency = input.currency.toUpperCase();
        option.rating = input.rating;
        option.freeCancellation = input.freeCancellation;
        option.amenities = input.amenities;
        option.notes = input.notes;
        option.previewDescription = input.previewDescription;
        option.previewImages = input.previewImages ?? [];
        await option.save();

        return { success: true as const, id: option._id.toString() };
      }),
    delete: protectedProcedure
      .input(z.object({ optionId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { tripModel, accommodationModel, accommodationCommentModel } =
          ctx.models;
        const option = await accommodationModel.findById(input.optionId);
        if (!option) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Вариант жилья не найден',
          });
        }
        await assertTripMemberAccess(
          option.tripId.toString(),
          ctx.authUser.sub,
          tripModel,
        );
        await accommodationCommentModel.deleteMany({
          accommodationId: option._id,
        });
        await option.deleteOne();
        return { success: true as const };
      }),
    updateStatus: protectedProcedure
      .input(
        z.object({
          optionId: z.string(),
          status: z.enum(['shortlisted', 'rejected', 'booked']),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { tripModel, accommodationModel } = ctx.models;
        const option = await accommodationModel.findById(input.optionId);
        if (!option) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Вариант жилья не найден',
          });
        }
        await assertTripMemberAccess(
          option.tripId.toString(),
          ctx.authUser.sub,
          tripModel,
        );
        option.status = input.status;
        await option.save();
        return { success: true };
      }),
    setNoLongerAvailable: protectedProcedure
      .input(
        z.object({
          optionId: z.string(),
          noLongerAvailable: z.boolean(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { tripModel, accommodationModel } = ctx.models;
        const option = await accommodationModel.findById(input.optionId);
        if (!option) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Вариант жилья не найден',
          });
        }
        await assertTripMemberAccess(
          option.tripId.toString(),
          ctx.authUser.sub,
          tripModel,
        );
        option.noLongerAvailable = input.noLongerAvailable;
        await option.save();
        return { success: true as const };
      }),
    vote: protectedProcedure
      .input(
        z.object({
          optionId: z.string(),
          value: z.enum(['up', 'down']),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { tripModel, accommodationModel } = ctx.models;
        const option = await accommodationModel.findById(input.optionId);
        if (!option) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Вариант жилья не найден',
          });
        }
        await assertTripMemberAccess(
          option.tripId.toString(),
          ctx.authUser.sub,
          tripModel,
        );

        const existingVote = option.votes.find(
          (vote) => vote.userId.toString() === ctx.authUser.sub,
        );
        if (existingVote) {
          existingVote.value = input.value;
        } else {
          option.votes.push({
            userId: new Types.ObjectId(ctx.authUser.sub),
            value: input.value,
          });
        }

        await option.save();
        return { success: true };
      }),
    commentsForTrip: publicProcedure
      .input(z.object({ tripId: z.string() }))
      .query(async ({ ctx, input }) => {
        const { tripModel, accommodationCommentModel, userModel } = ctx.models;
        await assertTripExists(input.tripId, tripModel);

        const comments = await accommodationCommentModel
          .find({ tripId: new Types.ObjectId(input.tripId) })
          .sort({ createdAt: 1 })
          .lean();

        const userIds = [...new Set(comments.map((c) => c.userId.toString()))];
        const users =
          userIds.length > 0
            ? await userModel
                .find({
                  _id: { $in: userIds.map((id) => new Types.ObjectId(id)) },
                })
                .select(['name'])
                .lean()
            : [];

        const nameById = new Map(users.map((u) => [u._id.toString(), u.name]));

        type Row = {
          id: string;
          body: string;
          authorId: string;
          authorName: string;
          createdAt: string;
          canDelete: boolean;
        };

        const byOption: Record<string, Row[]> = {};
        const selfId = ctx.authUser?.sub;

        for (const c of comments) {
          const oid = c.accommodationId.toString();
          const row: Row = {
            id: c._id.toString(),
            body: c.body,
            authorId: c.userId.toString(),
            authorName: nameById.get(c.userId.toString()) ?? 'Участник',
            createdAt: (() => {
              const at = (c as { createdAt?: Date }).createdAt;
              return at instanceof Date
                ? at.toISOString()
                : new Date().toISOString();
            })(),
            canDelete: selfId !== undefined && c.userId.toString() === selfId,
          };

          const list = byOption[oid];
          if (list) list.push(row);
          else byOption[oid] = [row];
        }

        return byOption;
      }),
    addAccommodationComment: protectedProcedure
      .input(
        z.object({
          optionId: z.string(),
          body: z.string().max(2000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const trimmed = input.body.trim();
        if (!trimmed) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Пустой комментарий',
          });
        }

        const { tripModel, accommodationModel, accommodationCommentModel } =
          ctx.models;
        const option = await accommodationModel.findById(input.optionId);
        if (!option) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Вариант жилья не найден',
          });
        }

        await assertTripMemberAccess(
          option.tripId.toString(),
          ctx.authUser.sub,
          tripModel,
        );

        const doc = await accommodationCommentModel.create({
          tripId: option.tripId,
          accommodationId: option._id,
          userId: new Types.ObjectId(ctx.authUser.sub),
          body: trimmed,
        });

        return { id: doc._id.toString() };
      }),
    deleteAccommodationComment: protectedProcedure
      .input(z.object({ commentId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { tripModel, accommodationCommentModel } = ctx.models;

        const comment = await accommodationCommentModel.findById(
          input.commentId,
        );
        if (!comment) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Комментарий не найден',
          });
        }

        await assertTripMemberAccess(
          comment.tripId.toString(),
          ctx.authUser.sub,
          tripModel,
        );

        if (comment.userId.toString() !== ctx.authUser.sub) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Можно удалить только свой комментарий',
          });
        }

        await comment.deleteOne();

        return { success: true as const };
      }),
  }),
  tripPoint: t.router({
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
        point.plannedAt = input.plannedAt
          ? new Date(input.plannedAt)
          : undefined;
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
  }),
  tripDoc: t.router({
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
  }),
  forex: t.router({
    usdRubRate: publicProcedure.query(async () => {
      try {
        const { rubPerUsd, quoteDate } = await getUsdRubRateFromCbr();
        return {
          ok: true as const,
          rubPerUsd,
          quoteDate,
          source: 'cbr_rf' as const,
        };
      } catch {
        return {
          ok: false as const,
          message: 'Не удалось загрузить курс USD/RUB',
        };
      }
    }),
  }),
  s3: t.router({
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
  }),
});

export type AppRouter = typeof appRouter;
