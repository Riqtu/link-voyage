import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { resolveSystemRole } from '../auth/system-admin';
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

export const router = t.router;

export { adminProcedure, protectedProcedure, publicProcedure, t };
