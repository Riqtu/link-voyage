import { z } from 'zod';
import {
  getRubRateFromCbr,
  getUsdRubRateFromCbr,
} from '../../forex/cbr-usd-rub';
import { publicProcedure, router } from '../trpc';

export const forexRouter = router({
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
});
