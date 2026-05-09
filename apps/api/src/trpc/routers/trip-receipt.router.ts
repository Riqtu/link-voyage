import { TRPCError } from '@trpc/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import {
  analyzeReceiptImageFromUrl,
  assertTrustedReceiptImageUrl,
} from '../../gemini/analyze-receipt-image';
import { formatUserDisplayName } from '../../users/user-display-name';
import {
  RECEIPT_LINE_QTY_EPS,
  type ReceiptLineForShare,
  computeReceiptShares,
  effectiveConsumptionsFromLine,
  receiptLineHasSelections,
} from '../helpers/receipt-share';
import {
  assertTripMemberAccess,
  assertTripMemberUserId,
} from '../helpers/trip-access';
import { protectedProcedure, router } from '../trpc';

export const tripReceiptRouter = router({
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
          participantUserIds: consumptions.length > 0 ? [] : participantUserIds,
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
      await assertTripMemberUserId(input.tripId, input.paidByUserId, tripModel);

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
          ln.participantUserIds?.filter((pid) => allowedUserSet.has(pid)) ?? [];

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
        Number.isFinite(lineQty) && lineQty > 0 && Math.abs(lineQty - 1) < 1e-3;
      if (isSingleQtyLine && next.length > 0) {
        const each = Math.round((lineQty / next.length) * 1e6) / 1e6;
        next = next.map((c) => ({ userId: c.userId, qty: each }));
        const adjustedSumQ = next.reduce((s, c) => s + c.qty, 0);
        const delta = Math.round((lineQty - adjustedSumQ) * 1e6) / 1e6;
        if (Math.abs(delta) > 1e-9) {
          const idx = next.findIndex((c) => c.userId === targetUserId);
          const fixIdx = idx >= 0 ? idx : 0;
          next[fixIdx] = {
            userId: next[fixIdx].userId,
            qty: Math.max(
              0,
              Math.round((next[fixIdx].qty + delta) * 1e6) / 1e6,
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
          message: 'Для оплатившего чек отметка «перевёл долю» не используется',
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
          (p) => String(p.name).toLowerCase() === normalizedName.toLowerCase(),
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
});
