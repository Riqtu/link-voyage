import { TRPCError } from '@trpc/server';
import { TrpcContext } from '../trpc.context';

export async function assertTripMemberAccess(
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

export async function assertTripExists(
  tripId: string,
  tripModel: TrpcContext['models']['tripModel'],
) {
  const trip = await tripModel.findById(tripId).lean();
  if (!trip) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Поездка не найдена' });
  }
}

export async function assertTripMemberUserId(
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

export function getWebOriginForInvite(): string {
  const rawOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  const firstOrigin = rawOrigin
    .split(',')
    .map((part) => part.trim())
    .find(Boolean);
  return firstOrigin ?? 'http://localhost:3000';
}
