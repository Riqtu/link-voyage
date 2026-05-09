import { TRPCError } from '@trpc/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import {
  applyPackOrderMongoArray,
  applyPackReorderPeers,
  coercePackKind,
  collectDescendantIdsIncludingSelf,
  orderLeanRowsForDisplay,
  swapPackChecklistAdjacentPeer,
} from '../../trips/pack-checklist-tree';
import { embedDefaultTripPackChecklist } from '../../trips/pack-checklist.defaults';
import { ensurePersonalPackOnTrip } from '../../trips/pack-checklist.personal';
import { mapPackChecklistItem } from '../helpers/pack-mapper';
import { protectedProcedure, router } from '../trpc';

export const packChecklistRouter = router({
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
      });

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
              typeof input.quantity === 'number' ? input.quantity : undefined;
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
      const fresh = checklist.find((r) => r._id.toString() === input.itemId);
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
      entry.items = freshDefault;
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
                quantityUnit: z.string().max(12).trim().optional().nullable(),
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
        if (typeof row.quantity === 'number' && Number.isFinite(row.quantity)) {
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
});
