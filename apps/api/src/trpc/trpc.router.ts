import { accommodationRouter } from './routers/accommodation.router';
import { adminRouter } from './routers/admin.router';
import { authRouter } from './routers/auth.router';
import { forexRouter } from './routers/forex.router';
import { s3Router } from './routers/s3.router';
import { tripDocRouter } from './routers/trip-doc.router';
import { tripPointRouter } from './routers/trip-point.router';
import { tripReceiptRouter } from './routers/trip-receipt.router';
import { tripRouter } from './routers/trip.router';
import { publicProcedure, router } from './trpc';

export const appRouter = router({
  health: publicProcedure.query(() => ({
    status: 'ok',
    service: 'api',
  })),
  auth: authRouter,
  admin: adminRouter,
  trip: tripRouter,
  accommodation: accommodationRouter,
  tripPoint: tripPointRouter,
  tripDoc: tripDocRouter,
  tripReceipt: tripReceiptRouter,
  forex: forexRouter,
  s3: s3Router,
});

export type AppRouter = typeof appRouter;
