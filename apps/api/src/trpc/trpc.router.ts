import { initTRPC, TRPCError } from '@trpc/server';
import { Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import superjson from 'superjson';
import { z } from 'zod';
import {
  accommodationPreviewImagesInputSchema,
  normalizePreviewImageItems,
} from '../accommodations/accommodation-preview-images';
import {
  hashPassword,
  signAccessToken,
  verifyPassword,
} from '../auth/auth.utils';
import {
  promoteListedAdminIfNeeded,
  resolveSystemRole,
} from '../auth/system-admin';
import { getRubRateFromCbr, getUsdRubRateFromCbr } from '../forex/cbr-usd-rub';
import {
  analyzeReceiptImageFromUrl,
  assertTrustedReceiptImageUrl,
} from '../gemini/analyze-receipt-image';
import {
  enrichAccommodationFromPastedHtml,
  enrichAccommodationFromUrl,
} from '../gemini/enrich-accommodation-from-url';
import { parseGalleryZonesFromPastedHtml } from '../gemini/parse-gallery-zones-from-html';
import { fetchLinkPreview } from '../link-preview/link-preview';
import {
  MAX_PASTED_LISTING_HTML_CHARS,
  MIN_PASTED_LISTING_HTML_CHARS,
} from '../link-preview/link-preview-from-paste';
import {
  assertDocumentObjectKeyForTrip,
  assertTrustedUserAvatarUrl,
  buildPublicDocumentUrl,
  deleteDocumentObject,
  signDocumentUpload,
  signImageUpload,
  signReceiptImageUpload,
  signUserAvatarUpload,
} from '../s3';
import {
  applyPackOrderMongoArray,
  applyPackReorderPeers,
  coercePackKind,
  collectDescendantIdsIncludingSelf,
  orderLeanRowsForDisplay,
  swapPackChecklistAdjacentPeer,
} from '../trips/pack-checklist-tree';
import { embedDefaultTripPackChecklist } from '../trips/pack-checklist.defaults';
import { ensurePersonalPackOnTrip } from '../trips/pack-checklist.personal';
import { formatUserDisplayName } from '../users/user-display-name';
import { TrpcContext } from './trpc.context';

function mapPackChecklistItem(sub: {
  _id: Types.ObjectId;
  title: string;
  done: boolean;
  sortOrder: number;
  kind?: 'line' | 'group';
  parentItemId?: Types.ObjectId;
  quantity?: number;
  quantityUnit?: string;
}) {
  const q =
    typeof sub.quantity === 'number' &&
    Number.isFinite(sub.quantity) &&
    coercePackKind(sub) === 'line'
      ? sub.quantity
      : null;
  const u =
    typeof sub.quantityUnit === 'string'
      ? sub.quantityUnit.trim() || null
      : null;
  return {
    id: sub._id.toString(),
    kind: coercePackKind(sub),
    title: sub.title,
    done: Boolean(sub.done),
    sortOrder: sub.sortOrder,
    parentItemId: sub.parentItemId?.toString() ?? null,
    quantity: q,
    quantityUnit: q != null ? u : null,
  };
}

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

async function assertIsSystemAdmin(
  authUserSub: string,
  userModel: TrpcContext['models']['userModel'],
) {
  const actor = await userModel.findById(authUserSub).lean();
  if (!actor) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Пользователь не найден',
    });
  }
  if (resolveSystemRole(actor) !== 'admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Недостаточно прав администратора',
    });
  }
}

/** Только пользователи с systemRole admin (или поднятые через ADMIN_EMAILS при входе). */
const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await assertIsSystemAdmin(ctx.authUser.sub, ctx.models.userModel);
  return next({ ctx });
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

function getWebOriginForInvite(): string {
  const rawOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  const firstOrigin = rawOrigin
    .split(',')
    .map((part) => part.trim())
    .find(Boolean);
  return firstOrigin ?? 'http://localhost:3000';
}

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
  previewImages: accommodationPreviewImagesInputSchema,
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

async function assertTripMemberUserId(
  tripId: string,
  userIdToCheck: string,
  tripModel: TrpcContext['models']['tripModel'],
) {
  const trip = await tripModel.findById(tripId).lean();
  if (!trip) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Поездка не найдена' });
  }
  const ok = trip.members.some((m) => m.userId.toString() === userIdToCheck);
  if (!ok) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Пользователь не входит в состав поездки',
    });
  }
}

type ReceiptLineForShare = {
  qty: number;
  lineTotal: number;
  participantUserIds?: string[];
  consumptions?: { userId: string; qty: number }[];
};

/** Консолидирует строку: consumptions имеют приоритет, иначе старый список с поровну по qty строки */
function effectiveConsumptionsFromLine(
  line: ReceiptLineForShare,
): { userId: string; qty: number }[] {
  const raw =
    Array.isArray(line.consumptions) &&
    line.consumptions.some((c) => Number(c.qty) > 0 && c.userId?.length > 0)
      ? line.consumptions.filter(
          (c) => typeof c.userId === 'string' && Number(c.qty) > 0,
        )
      : [];

  if (raw.length > 0) {
    const m = new Map<string, number>();
    for (const c of raw) {
      const q = Number(c.qty);
      m.set(c.userId, (m.get(c.userId) ?? 0) + q);
    }
    return [...m.entries()].map(([userId, qty]) => ({
      userId,
      qty: Math.round(qty * 1e6) / 1e6,
    }));
  }

  const pids = Array.isArray(line.participantUserIds)
    ? line.participantUserIds.filter(
        (x) => typeof x === 'string' && x.length > 0,
      )
    : [];
  if (pids.length === 0) return [];

  const n = pids.length;
  const lineQty = Math.max(Number(line.qty) || 1, 0);
  const each =
    Number.isFinite(lineQty) && n > 0
      ? Math.round((lineQty / n) * 1e6) / 1e6
      : 1 / Math.max(n, 1);
  return pids.map((userId) => ({ userId, qty: each }));
}

/** Каждая порция = lineTotal / lineQty; доля человека proportional к его qty (не к сумме набранным пока только часть линии). */
function computeReceiptShares(
  lineItems: ReceiptLineForShare[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of lineItems) {
    const shares = effectiveConsumptionsFromLine(line);
    const lineQty = Math.max(Number(line.qty) || 0, 0);
    if (lineQty <= RECEIPT_LINE_QTY_EPS || shares.length === 0) continue;
    const total = Number(line.lineTotal);
    if (!Number.isFinite(total) || total < 0) continue;
    for (const sh of shares) {
      const q = Number(sh.qty);
      if (!(q > 0 && Number.isFinite(q))) continue;
      out[sh.userId] = (out[sh.userId] ?? 0) + total * (q / lineQty);
    }
  }
  return out;
}

function receiptLineHasSelections(line: ReceiptLineForShare): boolean {
  return effectiveConsumptionsFromLine(line).length > 0;
}

const RECEIPT_LINE_QTY_EPS = 1e-4;

function toAuthClientUser(user: {
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
          user.lastName =
            input.lastName.length > 0 ? input.lastName : undefined;
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
  }),
  admin: t.router({
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
          user.lastName =
            input.lastName.length > 0 ? input.lastName : undefined;
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
            typeof user.avatarUrl === 'string' &&
            user.avatarUrl.trim().length > 0
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
            const email =
              typeof doc?.email === 'string' ? doc.email.trim() : '';
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
    packChecklist: t.router({
      list: protectedProcedure
        .input(z.object({ tripId: z.string() }))
        .query(async ({ ctx, input }) => {
          const { tripModel } = ctx.models;
          const tripId = input.tripId;
          if (!Types.ObjectId.isValid(tripId)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Некорректный идентификатор поездки',
            });
          }

          const viewerId = ctx.authUser.sub;
          const memberFilter = {
            _id: new Types.ObjectId(tripId),
            'members.userId': new Types.ObjectId(viewerId),
          };

          const trip = await tripModel.findOne(memberFilter);
          if (!trip) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Нет доступа к поездке',
            });
          }

          const { items: rows, needsSave } = ensurePersonalPackOnTrip(
            trip,
            viewerId,
          );
          if (needsSave) {
            await trip.save();
          }

          const flat = rows.map((r) => ({
            _id: r._id,
            title: r.title,
            done: Boolean(r.done),
            sortOrder: r.sortOrder,
            kind: r.kind,
            parentItemId: r.parentItemId,
            quantity: r.quantity,
            quantityUnit: r.quantityUnit,
          }));

          const items = orderLeanRowsForDisplay(flat);

          return {
            items: items.map(mapPackChecklistItem),
          };
        }),
      addItem: protectedProcedure
        .input(
          z.object({
            tripId: z.string(),
            title: z.string().min(1).max(200).trim(),
            kind: z.enum(['line', 'group']).optional().default('line'),
            parentItemId: z.string().optional(),
            quantity: z.number().int().min(1).max(99999).optional().nullable(),
            quantityUnit: z.string().max(12).trim().optional().nullable(),
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
          const isMember = trip.members.some(
            (m) => m.userId.toString() === ctx.authUser.sub,
          );
          if (!isMember) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Нет доступа к поездке',
            });
          }

          const { items: checklist } = ensurePersonalPackOnTrip(
            trip,
            ctx.authUser.sub,
          );

          const kind = input.kind;
          if (
            kind === 'group' &&
            input.parentItemId &&
            input.parentItemId.trim().length > 0
          ) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Секцию можно добавить только на верхний уровень',
            });
          }

          let parentOid: Types.ObjectId | undefined;
          if (
            kind === 'line' &&
            input.parentItemId &&
            input.parentItemId.trim().length > 0
          ) {
            const ps = input.parentItemId.trim();
            if (!Types.ObjectId.isValid(ps)) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'Некорректная секция',
              });
            }
            parentOid = new Types.ObjectId(ps);
            const parent = checklist.find((r) => r._id.equals(parentOid));
            if (!parent || coercePackKind(parent) !== 'group') {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'Подпункт можно добавить только в секцию',
              });
            }
          }

          let quantity: number | undefined;
          let quantityUnit: string | undefined;
          if (kind === 'line') {
            if (
              typeof input.quantity === 'number' &&
              Number.isFinite(input.quantity)
            ) {
              quantity = input.quantity;
            }
            if (
              quantity != null &&
              typeof input.quantityUnit === 'string' &&
              input.quantityUnit.trim().length > 0
            ) {
              quantityUnit = input.quantityUnit.trim();
            }
          } else if (input.quantity != null || input.quantityUnit) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'У секции нет количества',
            });
          }

          const newId = new Types.ObjectId();

          checklist.push({
            _id: newId,
            kind,
            title: input.title,
            done: false,
            sortOrder: 0,
            ...(parentOid ? { parentItemId: parentOid } : {}),
            ...(quantity != null ? { quantity } : {}),
            ...(quantityUnit != null ? { quantityUnit } : {}),
          } as never);

          applyPackOrderMongoArray(checklist);
          trip.markModified('packChecklistsByMember');

          await trip.save();
          const created = checklist.find((r) => r._id.equals(newId));
          if (!created) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Не удалось сохранить пункт',
            });
          }
          return { item: mapPackChecklistItem(created) };
        }),
      updateItem: protectedProcedure
        .input(
          z.object({
            tripId: z.string(),
            itemId: z.string(),
            title: z.string().min(1).max(200).trim().optional(),
            done: z.boolean().optional(),
            quantity: z.number().int().min(1).max(99999).optional().nullable(),
            quantityUnit: z.string().max(12).trim().optional().nullable(),
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
          const isMember = trip.members.some(
            (m) => m.userId.toString() === ctx.authUser.sub,
          );
          if (!isMember) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Нет доступа к поездке',
            });
          }

          const { items: checklist } = ensurePersonalPackOnTrip(
            trip,
            ctx.authUser.sub,
          );

          const row = checklist.find((r) => r._id.toString() === input.itemId);
          if (!row) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Пункт чеклиста не найден',
            });
          }
          const rk = coercePackKind(row);

          if (input.title !== undefined) {
            row.title = input.title;
          }

          if (input.done !== undefined) {
            if (rk !== 'group') {
              row.done = input.done;
            }
          }

          if ('quantity' in input || 'quantityUnit' in input) {
            if (rk === 'group') {
              row.quantity = undefined;
              row.quantityUnit = undefined;
            } else {
              if ('quantity' in input) {
                row.quantity =
                  typeof input.quantity === 'number'
                    ? input.quantity
                    : undefined;
              }
              if ('quantityUnit' in input) {
                const u =
                  typeof input.quantityUnit === 'string' &&
                  input.quantityUnit.trim().length > 0
                    ? input.quantityUnit.trim()
                    : undefined;
                row.quantityUnit = u;
              }
              if (!(typeof row.quantity === 'number')) {
                row.quantity = undefined;
                row.quantityUnit = undefined;
              }
            }
          }

          applyPackOrderMongoArray(checklist);
          trip.markModified('packChecklistsByMember');
          await trip.save();
          const fresh = checklist.find(
            (r) => r._id.toString() === input.itemId,
          );
          if (!fresh) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Не удалось обновить пункт',
            });
          }
          return { item: mapPackChecklistItem(fresh) };
        }),
      removeItem: protectedProcedure
        .input(
          z.object({
            tripId: z.string(),
            itemId: z.string(),
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
          const isMember = trip.members.some(
            (m) => m.userId.toString() === ctx.authUser.sub,
          );
          if (!isMember) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Нет доступа к поездке',
            });
          }

          if (!Types.ObjectId.isValid(input.itemId)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Некорректный пункт чеклиста',
            });
          }

          const { items: checklist } = ensurePersonalPackOnTrip(
            trip,
            ctx.authUser.sub,
          );

          const rm = collectDescendantIdsIncludingSelf(
            [...checklist],
            input.itemId,
          );
          if (!rm.has(input.itemId)) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Пункт чеклиста не найден',
            });
          }

          const indices = [...checklist.keys()]
            .filter((idx) => rm.has(checklist[idx]._id.toString()))
            .sort((a, b) => b - a);
          for (const i of indices) {
            checklist.splice(i, 1);
          }

          applyPackOrderMongoArray(checklist);
          trip.markModified('packChecklistsByMember');
          await trip.save();
          return { success: true as const };
        }),
      resetFromPreset: protectedProcedure
        .input(z.object({ tripId: z.string() }))
        .mutation(async ({ ctx, input }) => {
          if (!Types.ObjectId.isValid(input.tripId)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Некорректный идентификатор поездки',
            });
          }

          const { tripModel } = ctx.models;
          const trip = await tripModel.findById(input.tripId);
          if (!trip) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Поездка не найдена',
            });
          }
          const isMember = trip.members.some(
            (m) => m.userId.toString() === ctx.authUser.sub,
          );
          if (!isMember) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Нет доступа к поездке',
            });
          }

          ensurePersonalPackOnTrip(trip, ctx.authUser.sub);
          const freshDefault = embedDefaultTripPackChecklist();
          applyPackOrderMongoArray(freshDefault);
          const entry = trip.packChecklistsByMember.find(
            (p) => p.userId.toString() === ctx.authUser.sub,
          );
          if (!entry) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Не удалось найти личный чеклист',
            });
          }
          entry.items = freshDefault as never;
          trip.markModified('packChecklistsByMember');
          await trip.save();

          const raw = [...entry.items];
          const items = orderLeanRowsForDisplay(
            raw.map((r) => ({
              _id: r._id,
              title: r.title,
              done: Boolean(r.done),
              sortOrder: r.sortOrder,
              kind: r.kind,
              parentItemId: r.parentItemId,
              quantity: r.quantity,
              quantityUnit: r.quantityUnit,
            })),
          );
          return { items: items.map(mapPackChecklistItem) };
        }),
      moveItemRelative: protectedProcedure
        .input(
          z.object({
            tripId: z.string(),
            itemId: z.string(),
            direction: z.enum(['up', 'down']),
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
          const isMember = trip.members.some(
            (m) => m.userId.toString() === ctx.authUser.sub,
          );
          if (!isMember) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Нет доступа к поездке',
            });
          }

          if (!Types.ObjectId.isValid(input.itemId)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Некорректный пункт',
            });
          }

          const { items: checklist } = ensurePersonalPackOnTrip(
            trip,
            ctx.authUser.sub,
          );

          const { swapped } = swapPackChecklistAdjacentPeer(
            checklist,
            input.itemId,
            input.direction,
          );

          const flat = checklist.map((r) => ({
            _id: r._id,
            title: r.title,
            done: Boolean(r.done),
            sortOrder: r.sortOrder,
            kind: r.kind,
            parentItemId: r.parentItemId,
            quantity: r.quantity,
            quantityUnit: r.quantityUnit,
          }));
          const itemsOrdered =
            orderLeanRowsForDisplay(flat).map(mapPackChecklistItem);

          if (swapped) {
            trip.markModified('packChecklistsByMember');
            await trip.save();
          }

          return { moved: swapped, items: itemsOrdered };
        }),
      reorderPeers: protectedProcedure
        .input(
          z.object({
            tripId: z.string(),
            parentSectionId: z.string().nullable().optional(),
            orderedItemIds: z.array(z.string()).min(1),
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
          const isMember = trip.members.some(
            (m) => m.userId.toString() === ctx.authUser.sub,
          );
          if (!isMember) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Нет доступа к поездке',
            });
          }

          const { items: checklist } = ensurePersonalPackOnTrip(
            trip,
            ctx.authUser.sub,
          );

          const parentKey =
            typeof input.parentSectionId === 'string' &&
            input.parentSectionId.trim().length > 0
              ? input.parentSectionId.trim()
              : null;

          if (parentKey != null && !Types.ObjectId.isValid(parentKey)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Некорректная секция',
            });
          }

          const result = applyPackReorderPeers(
            checklist,
            parentKey,
            input.orderedItemIds,
          );
          if (!result.ok) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: result.message,
            });
          }

          trip.markModified('packChecklistsByMember');
          await trip.save();

          const flat = checklist.map((r) => ({
            _id: r._id,
            title: r.title,
            done: Boolean(r.done),
            sortOrder: r.sortOrder,
            kind: r.kind,
            parentItemId: r.parentItemId,
            quantity: r.quantity,
            quantityUnit: r.quantityUnit,
          }));
          return {
            items: orderLeanRowsForDisplay(flat).map(mapPackChecklistItem),
          };
        }),
      bulkSetLinesDone: protectedProcedure
        .input(
          z.object({
            tripId: z.string(),
            done: z.boolean(),
            scope: z.enum(['all_lines', 'section_lines']),
            sectionItemId: z.string().optional(),
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
          const isMember = trip.members.some(
            (m) => m.userId.toString() === ctx.authUser.sub,
          );
          if (!isMember) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Нет доступа к поездке',
            });
          }

          const { items: checklist } = ensurePersonalPackOnTrip(
            trip,
            ctx.authUser.sub,
          );

          if (input.scope === 'section_lines') {
            const sid =
              typeof input.sectionItemId === 'string'
                ? input.sectionItemId.trim()
                : '';
            if (!Types.ObjectId.isValid(sid)) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'Некорректная секция',
              });
            }
            const section = checklist.find((r) => r._id.toString() === sid);
            if (!section || coercePackKind(section) !== 'group') {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Секция не найдена',
              });
            }
            for (const row of checklist) {
              if (
                coercePackKind(row) === 'line' &&
                row.parentItemId &&
                row.parentItemId.equals(section._id)
              ) {
                row.done = input.done;
              }
            }
          } else {
            for (const row of checklist) {
              if (coercePackKind(row) === 'line') row.done = input.done;
            }
          }

          applyPackOrderMongoArray(checklist);
          trip.markModified('packChecklistsByMember');
          await trip.save();

          const flat = checklist.map((r) => ({
            _id: r._id,
            title: r.title,
            done: Boolean(r.done),
            sortOrder: r.sortOrder,
            kind: r.kind,
            parentItemId: r.parentItemId,
            quantity: r.quantity,
            quantityUnit: r.quantityUnit,
          }));
          return {
            items: orderLeanRowsForDisplay(flat).map(mapPackChecklistItem),
          };
        }),
      restoreDeletedItemsBatch: protectedProcedure
        .input(
          z.object({
            tripId: z.string(),
            ordered: z
              .array(
                z.discriminatedUnion('kind', [
                  z.object({
                    kind: z.literal('group'),
                    clientKey: z.string().min(1).max(64),
                    title: z.string().min(1).max(200).trim(),
                    done: z.boolean().optional(),
                  }),
                  z.object({
                    kind: z.literal('line'),
                    clientKey: z.string().min(1).max(64),
                    parentClientKey: z.string().min(1).max(64).optional(),
                    title: z.string().min(1).max(200).trim(),
                    done: z.boolean().optional(),
                    quantity: z
                      .number()
                      .int()
                      .min(1)
                      .max(99999)
                      .optional()
                      .nullable(),
                    quantityUnit: z
                      .string()
                      .max(12)
                      .trim()
                      .optional()
                      .nullable(),
                  }),
                ]),
              )
              .max(200),
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
          const isMember = trip.members.some(
            (m) => m.userId.toString() === ctx.authUser.sub,
          );
          if (!isMember) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Нет доступа к поездке',
            });
          }

          const { items: checklist } = ensurePersonalPackOnTrip(
            trip,
            ctx.authUser.sub,
          );

          const idByClient = new Map<string, Types.ObjectId>();
          for (const row of input.ordered) {
            idByClient.set(row.clientKey, new Types.ObjectId());
          }

          for (const row of input.ordered) {
            const _id = idByClient.get(row.clientKey);
            if (!_id) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'Дублирующийся clientKey',
              });
            }

            if (row.kind === 'group') {
              checklist.push({
                _id,
                kind: 'group',
                title: row.title,
                done: false,
                sortOrder: 0,
              } as never);
              continue;
            }

            let parentItemId: Types.ObjectId | undefined;
            if (row.parentClientKey) {
              const p = idByClient.get(row.parentClientKey);
              if (!p) {
                throw new TRPCError({
                  code: 'BAD_REQUEST',
                  message: 'Неизвестная секция для строки',
                });
              }
              parentItemId = p;
            }

            let quantity: number | undefined;
            let quantityUnit: string | undefined;
            if (
              typeof row.quantity === 'number' &&
              Number.isFinite(row.quantity)
            ) {
              quantity = row.quantity;
            }
            if (
              quantity != null &&
              typeof row.quantityUnit === 'string' &&
              row.quantityUnit.trim().length > 0
            ) {
              quantityUnit = row.quantityUnit.trim();
            }

            checklist.push({
              _id,
              kind: 'line',
              title: row.title,
              done: Boolean(row.done),
              sortOrder: 0,
              ...(parentItemId ? { parentItemId } : {}),
              ...(quantity != null ? { quantity } : {}),
              ...(quantityUnit != null ? { quantityUnit } : {}),
            } as never);
          }

          applyPackOrderMongoArray(checklist);
          trip.markModified('packChecklistsByMember');
          await trip.save();

          const flat = checklist.map((r) => ({
            _id: r._id,
            title: r.title,
            done: Boolean(r.done),
            sortOrder: r.sortOrder,
            kind: r.kind,
            parentItemId: r.parentItemId,
            quantity: r.quantity,
            quantityUnit: r.quantityUnit,
          }));
          return {
            items: orderLeanRowsForDisplay(flat).map(mapPackChecklistItem),
          };
        }),
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
        trip.packChecklistsByMember = (
          trip.packChecklistsByMember ?? []
        ).filter((p) => p.userId.toString() !== input.userId);
        trip.markModified('packChecklistsByMember');
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
  tripReceipt: t.router({
    list: protectedProcedure
      .input(z.object({ tripId: z.string() }))
      .query(async ({ ctx, input }) => {
        const { tripModel, tripReceiptModel, userModel } = ctx.models;
        await assertTripMemberAccess(input.tripId, ctx.authUser.sub, tripModel);

        const receipts = await tripReceiptModel
          .find({ tripId: new Types.ObjectId(input.tripId) })
          .sort({ createdAt: -1 })
          .lean();

        const payerIds = [
          ...new Set(receipts.map((r) => r.paidByUserId.toString())),
        ];
        const payers =
          payerIds.length > 0
            ? await userModel
                .find({
                  _id: { $in: payerIds.map((id) => new Types.ObjectId(id)) },
                })
                .select(['name', 'lastName'])
                .lean()
            : [];
        const paidByName = new Map(
          payers.map((u) => [
            u._id.toString(),
            formatUserDisplayName({
              name: u.name,
              lastName: u.lastName,
            }),
          ]),
        );

        return receipts.map((r) => {
          const lineItems = Array.isArray(r.lineItems) ? r.lineItems : [];
          const totalAmount = lineItems.reduce(
            (s, ln) => s + (Number.isFinite(ln.lineTotal) ? ln.lineTotal : 0),
            0,
          );
          return {
            id: r._id.toString(),
            tripId: r.tripId.toString(),
            title: r.title,
            description: r.description ?? '',
            paidByUserId: r.paidByUserId.toString(),
            paidByUserName:
              paidByName.get(r.paidByUserId.toString()) ?? 'Участник',
            currency: r.currency ?? 'RUB',
            imageUrl: r.imageUrl ?? null,
            lineItemCount: lineItems.length,
            totalAmount,
            createdAt:
              'createdAt' in r &&
              (r as { createdAt?: Date }).createdAt instanceof Date
                ? (r as { createdAt: Date }).createdAt.toISOString()
                : null,
          };
        });
      }),
    byId: protectedProcedure
      .input(z.object({ receiptId: z.string() }))
      .query(async ({ ctx, input }) => {
        const { tripModel, tripReceiptModel, userModel } = ctx.models;

        const rec = await tripReceiptModel.findById(input.receiptId).lean();
        if (!rec) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Чек не найден',
          });
        }

        await assertTripMemberAccess(
          rec.tripId.toString(),
          ctx.authUser.sub,
          tripModel,
        );

        const trip = await tripModel.findById(rec.tripId).lean();
        if (!trip) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Поездка не найдена',
          });
        }

        const memberObjectIds = trip.members.map((m) => m.userId);
        const users =
          memberObjectIds.length > 0
            ? await userModel
                .find({ _id: { $in: memberObjectIds } })
                .select(['name', 'lastName'])
                .lean()
            : [];

        const nameByUserId = new Map(
          users.map((u) => [
            u._id.toString(),
            formatUserDisplayName({
              name: u.name,
              lastName: u.lastName,
            }),
          ]),
        );

        const lineItemsRaw = Array.isArray(rec.lineItems) ? rec.lineItems : [];
        const externalParticipants = Array.isArray(rec.externalParticipants)
          ? rec.externalParticipants
              .map((p) => ({
                id: String(p.id ?? '').trim(),
                name: String(p.name ?? '').trim(),
              }))
              .filter((p) => p.id.length > 0 && p.name.length > 0)
          : [];
        const allowedReceiptParticipantIds = new Set([
          ...trip.members.map((m) => m.userId.toString()),
          ...externalParticipants.map((p) => p.id),
        ]);
        const lineItems = lineItemsRaw.map((ln) => {
          const id = ln.id;
          const name = ln.name;
          const qty = ln.qty ?? 1;
          const unitPrice = ln.unitPrice;
          const lineTotal = ln.lineTotal;
          const participantUserIds = Array.isArray(ln.participantUserIds)
            ? [...ln.participantUserIds]
                .map((pid) => String(pid))
                .filter((pid) => allowedReceiptParticipantIds.has(pid))
            : [];
          const consumptionsRaw = Array.isArray(ln.consumptions)
            ? ln.consumptions
                .map((c) => ({
                  userId: String(c.userId),
                  qty: Number(c.qty),
                }))
                .filter((c) => allowedReceiptParticipantIds.has(c.userId))
            : [];

          const shareRow: ReceiptLineForShare = {
            qty,
            lineTotal,
            participantUserIds,
            consumptions: consumptionsRaw,
          };

          const consumptions = effectiveConsumptionsFromLine(shareRow);
          const consumedQtyTotal = consumptions.reduce((s, c) => s + c.qty, 0);

          return {
            id,
            name,
            qty,
            unitPrice,
            lineTotal,
            participantUserIds:
              consumptions.length > 0 ? [] : participantUserIds,
            consumptions,
            consumedQtyTotal:
              Math.round(consumedQtyTotal * 1000 + Number.EPSILON) / 1000,
          };
        });

        const members = trip.members.map((member) => ({
          userId: member.userId.toString(),
          name: nameByUserId.get(member.userId.toString()) ?? 'Участник',
          isExternal: false as const,
        }));
        const membersAll = [
          ...members,
          ...externalParticipants.map((p) => ({
            userId: p.id,
            name: p.name,
            isExternal: true as const,
          })),
        ];

        const paidByUserName =
          nameByUserId.get(rec.paidByUserId.toString()) ?? 'Участник';

        const shareByMember = computeReceiptShares(lineItems);
        const totalAmount = lineItems.reduce((s, ln) => s + ln.lineTotal, 0);

        /** Есть хотя бы одна строка с отмеченными участниками */
        const anyLineSelections = lineItems.some(receiptLineHasSelections);
        /** Если никто ни в одной строке не отмечен — на фронте подскажем деление всего чека на N человек */
        const hypotheticalShareAllEqual =
          !anyLineSelections && membersAll.length > 0 && totalAmount > 0
            ? totalAmount / membersAll.length
            : null;

        const receiptParticipantIdSet = new Set(
          membersAll.map((m) => m.userId.toString()),
        );
        const reimbursedPayerUserIdsRaw = Array.isArray(
          rec.reimbursedPayerUserIds,
        )
          ? rec.reimbursedPayerUserIds.map((id) => String(id))
          : [];
        const reimbursedPayerUserIds = reimbursedPayerUserIdsRaw.filter((id) =>
          receiptParticipantIdSet.has(id),
        );

        return {
          id: rec._id.toString(),
          tripId: rec.tripId.toString(),
          title: rec.title,
          description: rec.description ?? '',
          paidByUserId: rec.paidByUserId.toString(),
          createdByUserId: rec.createdBy.toString(),
          paidByUserName,
          currency: rec.currency ?? 'RUB',
          imageUrl: rec.imageUrl ?? null,
          lineItems,
          members: membersAll,
          externalParticipants,
          shareByMember,
          reimbursedPayerUserIds,
          viewerId: ctx.authUser.sub,
          totalAmount,
          anyLineSelections,
          hypotheticalShareAllEqual,
        };
      }),
    create: protectedProcedure
      .input(
        z.object({
          tripId: z.string(),
          title: z.string().min(2).max(160),
          description: z.string().max(2000).optional().default(''),
          paidByUserId: z.string(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { tripModel, tripReceiptModel } = ctx.models;

        await assertTripMemberAccess(input.tripId, ctx.authUser.sub, tripModel);
        await assertTripMemberUserId(
          input.tripId,
          input.paidByUserId,
          tripModel,
        );

        const rec = await tripReceiptModel.create({
          tripId: new Types.ObjectId(input.tripId),
          title: input.title.trim(),
          description: (input.description ?? '').trim(),
          paidByUserId: new Types.ObjectId(input.paidByUserId),
          currency: 'RUB',
          lineItems: [],
          createdBy: new Types.ObjectId(ctx.authUser.sub),
        });

        return { id: rec._id.toString() };
      }),
    update: protectedProcedure
      .input(
        z.object({
          receiptId: z.string(),
          title: z.string().min(2).max(160),
          description: z.string().max(2000).optional().default(''),
          paidByUserId: z.string(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { tripModel, tripReceiptModel } = ctx.models;

        const rec = await tripReceiptModel.findById(input.receiptId);
        if (!rec) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Чек не найден',
          });
        }
        await assertTripMemberAccess(
          rec.tripId.toString(),
          ctx.authUser.sub,
          tripModel,
        );
        await assertTripMemberUserId(
          rec.tripId.toString(),
          input.paidByUserId,
          tripModel,
        );

        rec.title = input.title.trim();
        rec.description = (input.description ?? '').trim();
        rec.paidByUserId = new Types.ObjectId(input.paidByUserId);
        await rec.save();

        return { success: true as const };
      }),
    delete: protectedProcedure
      .input(z.object({ receiptId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { tripModel, tripReceiptModel } = ctx.models;
        const rec = await tripReceiptModel.findById(input.receiptId);
        if (!rec) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Чек не найден',
          });
        }
        await assertTripMemberAccess(
          rec.tripId.toString(),
          ctx.authUser.sub,
          tripModel,
        );

        await rec.deleteOne();

        return { success: true as const };
      }),
    setImageUrl: protectedProcedure
      .input(
        z.object({
          receiptId: z.string(),
          imageUrl: z.string().url().max(2048),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { tripModel, tripReceiptModel } = ctx.models;

        const rec = await tripReceiptModel.findById(input.receiptId);
        if (!rec) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Чек не найден',
          });
        }
        await assertTripMemberAccess(
          rec.tripId.toString(),
          ctx.authUser.sub,
          tripModel,
        );

        try {
          assertTrustedReceiptImageUrl(input.imageUrl, rec.tripId.toString());
        } catch (e) {
          const message =
            e instanceof Error ? e.message : 'Недопустимый URL изображения';
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message,
          });
        }

        rec.imageUrl = input.imageUrl.trim().slice(0, 2048);
        await rec.save();

        return { success: true as const };
      }),
    analyzeWithGemini: protectedProcedure
      .input(z.object({ receiptId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { tripModel, tripReceiptModel } = ctx.models;

        const rec = await tripReceiptModel.findById(input.receiptId);
        if (!rec) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Чек не найден',
          });
        }
        await assertTripMemberAccess(
          rec.tripId.toString(),
          ctx.authUser.sub,
          tripModel,
        );

        const imageUrl = rec.imageUrl;
        if (!imageUrl?.trim()) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Сначала загрузите фото чека',
          });
        }

        try {
          const analyzed = await analyzeReceiptImageFromUrl(
            imageUrl.trim(),
            rec.tripId.toString(),
          );

          rec.currency = analyzed.currency;
          rec.lineItems = analyzed.items.map((it) => ({
            id: it.id,
            name: it.name,
            qty: it.qty,
            unitPrice: it.unitPrice,
            lineTotal: it.lineTotal,
            participantUserIds: [],
            consumptions: [],
          }));
          await rec.save();

          return {
            success: true as const,
            lineCount: analyzed.items.length,
            currency: analyzed.currency,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Не удалось разобрать чек';
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message,
          });
        }
      }),
    updateLineItems: protectedProcedure
      .input(
        z.object({
          receiptId: z.string(),
          lineItems: z
            .array(
              z.object({
                id: z.string().min(8).max(80),
                name: z.string().min(1).max(200),
                qty: z.number().positive().max(999),
                unitPrice: z.number().nonnegative().optional(),
                lineTotal: z.number().nonnegative(),
                participantUserIds: z.array(z.string()).max(48).optional(),
                consumptions: z
                  .array(
                    z.object({
                      userId: z.string(),
                      qty: z.number().positive().max(9999),
                    }),
                  )
                  .max(48)
                  .optional(),
              }),
            )
            .max(120),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { tripModel, tripReceiptModel } = ctx.models;
        const rec = await tripReceiptModel.findById(input.receiptId);
        if (!rec) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Чек не найден',
          });
        }

        await assertTripMemberAccess(
          rec.tripId.toString(),
          ctx.authUser.sub,
          tripModel,
        );

        const trip = await tripModel.findById(rec.tripId).lean();
        if (!trip) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Поездка не найдена',
          });
        }
        const memberSet = new Set(trip.members.map((m) => m.userId.toString()));
        const externalSet = new Set(
          (Array.isArray(rec.externalParticipants)
            ? rec.externalParticipants
            : []
          )
            .map((p) => String(p.id ?? '').trim())
            .filter((id) => id.length > 0),
        );
        const allowedUserSet = new Set([...memberSet, ...externalSet]);

        rec.lineItems = input.lineItems.map((ln) => {
          const pids =
            ln.participantUserIds?.filter((pid) => allowedUserSet.has(pid)) ??
            [];

          let consumptionsRaw =
            ln.consumptions
              ?.filter((c) => allowedUserSet.has(c.userId))
              .map((c) => ({ userId: c.userId.trim(), qty: c.qty })) ?? [];

          if (consumptionsRaw.length === 0 && pids.length > 0) {
            return {
              id: ln.id,
              name: ln.name.trim(),
              qty: ln.qty,
              unitPrice: ln.unitPrice,
              lineTotal: ln.lineTotal,
              participantUserIds: pids,
              consumptions: [],
            };
          }

          const mQty = new Map<string, number>();
          for (const c of consumptionsRaw) {
            mQty.set(
              c.userId,
              Math.round(((mQty.get(c.userId) ?? 0) + c.qty) * 1e6) / 1e6,
            );
          }
          consumptionsRaw = [...mQty.entries()].map(([userId, qty]) => ({
            userId,
            qty,
          }));

          const sumQ = consumptionsRaw.reduce((s, c) => s + c.qty, 0);
          const lineQty = ln.qty;
          if (
            consumptionsRaw.length > 0 &&
            sumQ > lineQty + RECEIPT_LINE_QTY_EPS
          ) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Сумма долей (${sumQ}) по строке «${ln.name.slice(0, 40)}» больше количества (${lineQty})`,
            });
          }

          return {
            id: ln.id,
            name: ln.name.trim(),
            qty: ln.qty,
            unitPrice: ln.unitPrice,
            lineTotal: ln.lineTotal,
            participantUserIds: [],
            consumptions: consumptionsRaw,
          };
        });
        await rec.save();

        return { success: true as const };
      }),
    setLineConsumption: protectedProcedure
      .input(
        z.object({
          receiptId: z.string(),
          lineItemId: z.string(),
          userId: z.string().optional(),
          qty: z.number().finite().nonnegative(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { tripModel, tripReceiptModel } = ctx.models;

        const rec = await tripReceiptModel.findById(input.receiptId);
        if (!rec) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Чек не найден',
          });
        }

        await assertTripMemberAccess(
          rec.tripId.toString(),
          ctx.authUser.sub,
          tripModel,
        );

        const uid = ctx.authUser.sub;
        await assertTripMemberUserId(rec.tripId.toString(), uid, tripModel);
        const payerId = rec.paidByUserId.toString();
        const creatorId = rec.createdBy.toString();
        const canManage = uid === payerId || uid === creatorId;
        const targetUserId =
          input.userId && input.userId.length > 0 ? input.userId : uid;
        const trip = await tripModel.findById(rec.tripId).lean();
        if (!trip) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Поездка не найдена',
          });
        }
        const memberSet = new Set(trip.members.map((m) => m.userId.toString()));
        const externalSet = new Set(
          (Array.isArray(rec.externalParticipants)
            ? rec.externalParticipants
            : []
          )
            .map((p) => String(p.id ?? '').trim())
            .filter((id) => id.length > 0),
        );
        const allowedUserSet = new Set([...memberSet, ...externalSet]);
        if (!allowedUserSet.has(targetUserId)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Пользователь не найден среди участников этого чека',
          });
        }
        if (targetUserId !== uid && !canManage) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'Только оплативший или создатель чека может менять доли других участников',
          });
        }

        const line = rec.lineItems.find((l) => l.id === input.lineItemId);
        if (!line) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Строка чека не найдена',
          });
        }

        const lineQty = Math.max(Number(line.qty) || 0, 0);

        const row: ReceiptLineForShare = {
          qty: lineQty,
          lineTotal: line.lineTotal,
          participantUserIds: line.participantUserIds,
          consumptions:
            Array.isArray(line.consumptions) && line.consumptions.length > 0
              ? line.consumptions.map((c) => ({
                  userId: String(c.userId),
                  qty: Number(c.qty),
                }))
              : undefined,
        };

        let next = effectiveConsumptionsFromLine(row).filter(
          (c) => c.userId !== targetUserId,
        );

        if (input.qty > RECEIPT_LINE_QTY_EPS) {
          next.push({
            userId: targetUserId,
            qty: Math.round(Number(input.qty) * 1e6) / 1e6,
          });
        }

        const mQty = new Map<string, number>();
        for (const c of next) {
          const q = Number(c.qty);
          if (!(q > 0 && Number.isFinite(q))) continue;
          mQty.set(
            c.userId,
            Math.round(((mQty.get(c.userId) ?? 0) + q) * 1e6) / 1e6,
          );
        }

        next = [...mQty.entries()].map(([userId, qty]) => ({ userId, qty }));

        const sumQ = next.reduce((s, c) => s + c.qty, 0);

        if (input.qty > lineQty + RECEIPT_LINE_QTY_EPS) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Нельзя указать больше ${lineQty}: по чеку в этой строке столько порций.`,
          });
        }

        const isSingleQtyLine =
          Number.isFinite(lineQty) &&
          lineQty > 0 &&
          Math.abs(lineQty - 1) < 1e-3;
        if (isSingleQtyLine && next.length > 0) {
          const each = Math.round((lineQty / next.length) * 1e6) / 1e6;
          next = next.map((c) => ({ userId: c.userId, qty: each }));
          const adjustedSumQ = next.reduce((s, c) => s + c.qty, 0);
          const delta = Math.round((lineQty - adjustedSumQ) * 1e6) / 1e6;
          if (Math.abs(delta) > 1e-9) {
            const idx = next.findIndex((c) => c.userId === targetUserId);
            const fixIdx = idx >= 0 ? idx : 0;
            next[fixIdx] = {
              userId: next[fixIdx]!.userId,
              qty: Math.max(
                0,
                Math.round((next[fixIdx]!.qty + delta) * 1e6) / 1e6,
              ),
            };
          }
        } else if (next.length > 0 && sumQ > lineQty + RECEIPT_LINE_QTY_EPS) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Уже набрано ${sumQ.toFixed(3)}, а по чеку максимум ${lineQty}`,
          });
        }

        line.participantUserIds = [];
        line.consumptions = next.map((c) => ({ userId: c.userId, qty: c.qty }));

        rec.markModified('lineItems');
        await rec.save();

        return { success: true as const };
      }),
    toggleReimbursedPayer: protectedProcedure
      .input(z.object({ receiptId: z.string(), userId: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { tripModel, tripReceiptModel } = ctx.models;

        const rec = await tripReceiptModel.findById(input.receiptId);
        if (!rec) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Чек не найден',
          });
        }

        await assertTripMemberAccess(
          rec.tripId.toString(),
          ctx.authUser.sub,
          tripModel,
        );

        const uid = ctx.authUser.sub;

        await assertTripMemberUserId(rec.tripId.toString(), uid, tripModel);
        const payerId = rec.paidByUserId.toString();
        const creatorId = rec.createdBy.toString();
        const canManage = uid === payerId || uid === creatorId;
        const targetUserId =
          input.userId && input.userId.length > 0 ? input.userId : uid;
        const trip = await tripModel.findById(rec.tripId).lean();
        if (!trip) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Поездка не найдена',
          });
        }
        const memberSet = new Set(trip.members.map((m) => m.userId.toString()));
        const externalSet = new Set(
          (Array.isArray(rec.externalParticipants)
            ? rec.externalParticipants
            : []
          )
            .map((p) => String(p.id ?? '').trim())
            .filter((id) => id.length > 0),
        );
        const allowedUserSet = new Set([...memberSet, ...externalSet]);
        if (!allowedUserSet.has(targetUserId)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Пользователь не найден среди участников этого чека',
          });
        }
        if (targetUserId !== uid && !canManage) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'Только оплативший или создатель чека может отмечать переводы за других',
          });
        }
        if (targetUserId === payerId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Для оплатившего чек отметка «перевёл долю» не используется',
          });
        }

        const arr = (
          Array.isArray(rec.reimbursedPayerUserIds)
            ? rec.reimbursedPayerUserIds
            : []
        ).map(String);
        const j = arr.indexOf(targetUserId);
        if (j >= 0) {
          arr.splice(j, 1);
        } else {
          arr.push(targetUserId);
        }

        rec.reimbursedPayerUserIds = arr;
        await rec.save();

        return { success: true as const };
      }),
    addExternalParticipant: protectedProcedure
      .input(
        z.object({
          receiptId: z.string(),
          name: z.string().trim().min(2).max(80),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { tripModel, tripReceiptModel } = ctx.models;
        const rec = await tripReceiptModel.findById(input.receiptId);
        if (!rec) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Чек не найден',
          });
        }
        await assertTripMemberAccess(
          rec.tripId.toString(),
          ctx.authUser.sub,
          tripModel,
        );
        const payerId = rec.paidByUserId.toString();
        const creatorId = rec.createdBy.toString();
        if (ctx.authUser.sub !== payerId && ctx.authUser.sub !== creatorId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'Добавлять внешних участников может только оплативший или создатель чека',
          });
        }
        const normalizedName = input.name.trim().replace(/\s+/g, ' ');
        const ext = Array.isArray(rec.externalParticipants)
          ? rec.externalParticipants
          : [];
        if (
          ext.some(
            (p) =>
              String(p.name).toLowerCase() === normalizedName.toLowerCase(),
          )
        ) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Такой участник уже добавлен',
          });
        }
        const id = `ext_${new Types.ObjectId().toString()}`;
        rec.externalParticipants = [...ext, { id, name: normalizedName }];
        await rec.save();
        return { id, name: normalizedName };
      }),
    removeExternalParticipant: protectedProcedure
      .input(
        z.object({
          receiptId: z.string(),
          userId: z.string().min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { tripModel, tripReceiptModel } = ctx.models;
        const rec = await tripReceiptModel.findById(input.receiptId);
        if (!rec) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Чек не найден',
          });
        }
        await assertTripMemberAccess(
          rec.tripId.toString(),
          ctx.authUser.sub,
          tripModel,
        );
        const payerId = rec.paidByUserId.toString();
        const creatorId = rec.createdBy.toString();
        if (ctx.authUser.sub !== payerId && ctx.authUser.sub !== creatorId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'Удалять внешних участников может только оплативший или создатель чека',
          });
        }

        const ext = Array.isArray(rec.externalParticipants)
          ? rec.externalParticipants
          : [];
        const had = ext.some((p) => String(p.id) === input.userId);
        if (!had) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Внешний участник не найден',
          });
        }

        rec.externalParticipants = ext.filter(
          (p) => String(p.id) !== input.userId,
        );

        rec.reimbursedPayerUserIds = (
          Array.isArray(rec.reimbursedPayerUserIds)
            ? rec.reimbursedPayerUserIds
            : []
        )
          .map((id) => String(id))
          .filter((id) => id !== input.userId);

        rec.lineItems = (Array.isArray(rec.lineItems) ? rec.lineItems : []).map(
          (ln) => {
            const participantUserIds = Array.isArray(ln.participantUserIds)
              ? ln.participantUserIds
                  .map((id) => String(id))
                  .filter((id) => id !== input.userId)
              : [];
            const consumptions = Array.isArray(ln.consumptions)
              ? ln.consumptions
                  .map((c) => ({
                    userId: String(c.userId),
                    qty: Number(c.qty),
                  }))
                  .filter((c) => c.userId !== input.userId)
              : [];
            return {
              ...ln,
              participantUserIds,
              consumptions,
            };
          },
        );

        rec.markModified('lineItems');
        await rec.save();
        return { success: true as const };
      }),
  }),
  forex: t.router({
    rubRate: publicProcedure
      .input(z.object({ currency: z.string().trim().length(3) }))
      .query(async ({ input }) => {
        try {
          const { rubPerUnit, quoteDate, currency } = await getRubRateFromCbr(
            input.currency,
          );
          return {
            ok: true as const,
            currency,
            rubPerUnit,
            quoteDate,
            source: 'cbr_rf' as const,
          };
        } catch {
          return {
            ok: false as const,
            message: `Не удалось загрузить курс ${input.currency.toUpperCase()}/RUB`,
          };
        }
      }),
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
  }),
});

export type AppRouter = typeof appRouter;
