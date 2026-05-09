import { TRPCError } from '@trpc/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { normalizePreviewImageItems } from '../../accommodations/accommodation-preview-images';
import {
  enrichAccommodationFromPastedHtml,
  enrichAccommodationFromUrl,
} from '../../gemini/enrich-accommodation-from-url';
import { parseGalleryZonesFromPastedHtml } from '../../gemini/parse-gallery-zones-from-html';
import { fetchLinkPreview } from '../../link-preview/link-preview';
import {
  MAX_PASTED_LISTING_HTML_CHARS,
  MIN_PASTED_LISTING_HTML_CHARS,
} from '../../link-preview/link-preview-from-paste';
import { formatUserDisplayName } from '../../users/user-display-name';
import { accommodationInputSchema } from '../helpers/schemas';
import {
  assertTripExists,
  assertTripMemberAccess,
} from '../helpers/trip-access';
import { protectedProcedure, publicProcedure, router } from '../trpc';

export const accommodationRouter = router({
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

      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
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
          place_id?: string;
          formatted_address?: string;
          geometry?: { location?: { lat?: number; lng?: number } };
        }>;
      };
      if (raw.status && raw.status !== 'OK' && raw.status !== 'ZERO_RESULTS') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: raw.error_message || 'Google Geocoding вернул ошибку',
        });
      }

      return (raw.results ?? [])
        .slice(0, input.limit)
        .map((item) => ({
          placeId: item.place_id,
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
  enrichFromGeminiHtml: protectedProcedure
    .input(
      z.object({
        html: z
          .string()
          .min(MIN_PASTED_LISTING_HTML_CHARS)
          .max(MAX_PASTED_LISTING_HTML_CHARS),
        pageUrl: z.string().url().max(2048).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await enrichAccommodationFromPastedHtml(
          input.html,
          input.pageUrl,
        );
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
          message:
            rawMessage ||
            'Не удалось разобрать HTML через Gemini. Проверьте объём текста и URL страницы для картинок.',
        });
      }
    }),
  galleryZonesFromGeminiHtml: protectedProcedure
    .input(
      z.object({
        html: z
          .string()
          .min(MIN_PASTED_LISTING_HTML_CHARS)
          .max(MAX_PASTED_LISTING_HTML_CHARS),
        pageUrl: z.string().url().max(2048).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const images = await parseGalleryZonesFromPastedHtml(
          input.html,
          input.pageUrl,
        );
        return { images };
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
          message:
            rawMessage ||
            'Не удалось извлечь фото из HTML. Укажите URL страницы и фрагмент с галереей.',
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
      const { tripModel, accommodationModel, userModel } = ctx.models;
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

      const voterIds = [
        ...new Set(
          options.flatMap((item) =>
            item.votes.map((vote) => vote.userId.toString()),
          ),
        ),
      ];
      const voterUsers =
        voterIds.length > 0
          ? await userModel
              .find({
                _id: { $in: voterIds.map((id) => new Types.ObjectId(id)) },
              })
              .select(['name', 'lastName'])
              .lean()
          : [];
      const voterNameById = new Map(
        voterUsers.map((u) => [
          u._id.toString(),
          formatUserDisplayName({
            name: u.name,
            lastName: u.lastName,
          }),
        ]),
      );

      return options.map((item) => {
        const legacy = item as typeof item & { pricePerNight?: number };
        const resolvedPrice =
          typeof item.price === 'number'
            ? item.price
            : typeof legacy.pricePerNight === 'number'
              ? legacy.pricePerNight
              : null;

        const upVotes = item.votes.filter((vote) => vote.value === 'up').length;
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
            item.pricingMode === 'perNight' || item.pricingMode === 'perPerson'
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
          previewImages: normalizePreviewImageItems(item.previewImages ?? []),
          createdBy: item.createdBy.toString(),
          upVotes,
          downVotes,
          votes: item.votes.map((vote) => ({
            userId: vote.userId.toString(),
            userName: voterNameById.get(vote.userId.toString()) ?? 'Участник',
            value: vote.value,
          })),
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
        previewImages: normalizePreviewImageItems(input.previewImages ?? []),
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
      option.previewImages = normalizePreviewImageItems(
        input.previewImages ?? [],
      );
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

      const existingVoteIndex = option.votes.findIndex(
        (vote) => vote.userId.toString() === ctx.authUser.sub,
      );
      const existingVote =
        existingVoteIndex >= 0 ? option.votes[existingVoteIndex] : undefined;
      if (existingVote) {
        if (existingVote.value === input.value) {
          // Повторный клик по тому же голосу = снять голос
          option.votes.splice(existingVoteIndex, 1);
        } else {
          existingVote.value = input.value;
        }
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
              .select(['name', 'lastName', 'avatarUrl'])
              .lean()
          : [];

      const authorById = new Map(
        users.map((u) => {
          const uid = u._id.toString();
          const avatarRaw = (u as { avatarUrl?: string }).avatarUrl;
          const authorAvatarUrl =
            typeof avatarRaw === 'string' && avatarRaw.trim().length > 0
              ? avatarRaw.trim()
              : null;
          return [
            uid,
            {
              authorName: formatUserDisplayName({
                name: u.name,
                lastName: u.lastName,
              }),
              authorAvatarUrl,
            },
          ] as const;
        }),
      );

      type Row = {
        id: string;
        body: string;
        authorId: string;
        authorName: string;
        authorAvatarUrl: string | null;
        createdAt: string;
        canDelete: boolean;
      };

      const byOption: Record<string, Row[]> = {};
      const selfId = ctx.authUser?.sub;
      const fallbackAuthor = {
        authorName: 'Участник',
        authorAvatarUrl: null as string | null,
      };

      for (const c of comments) {
        const oid = c.accommodationId.toString();
        const author = authorById.get(c.userId.toString()) ?? fallbackAuthor;
        const row: Row = {
          id: c._id.toString(),
          body: c.body,
          authorId: c.userId.toString(),
          authorName: author.authorName,
          authorAvatarUrl: author.authorAvatarUrl,
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

      const comment = await accommodationCommentModel.findById(input.commentId);
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
});
