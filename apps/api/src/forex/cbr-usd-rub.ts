/**
 * Курс USD → RUB по данным ЦБ РФ через публичное зеркало JSON (ежедневные курсы).
 * Вызывается только с сервера (без проблем с CORS).
 */

type CbrDailyJson = {
  Date?: string;
  Valute?: {
    USD?: { Value?: number; Nominal?: number };
  };
};

type CacheEntry = {
  rate: number;
  quoteDate: string;
  expiresAtMs: number;
};

let cache: CacheEntry | null = null;

/** Курсы ЦБ меняются раз в рабочий день — кэш на пару часов снижает нагрузку. */
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

export async function getUsdRubRateFromCbr(): Promise<{
  /** Сколько рублей за 1 USD по курсу ЦБ */
  rubPerUsd: number;
  /** Дата/время котировки из ответа сервиса */
  quoteDate: string;
}> {
  const now = Date.now();
  if (cache && cache.expiresAtMs > now) {
    return {
      rubPerUsd: cache.rate,
      quoteDate: cache.quoteDate,
    };
  }

  const response = await fetch('https://www.cbr-xml-daily.ru/daily_json.js', {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`CBR ответил ${response.status}`);
  }

  const data = (await response.json()) as CbrDailyJson;
  const usd = data.Valute?.USD;
  const nominal = usd?.Nominal ?? 1;
  const value = usd?.Value;
  if (typeof value !== 'number' || !Number.isFinite(value) || nominal <= 0) {
    throw new Error('В ответе ЦБ нет курса USD');
  }

  const rateRubPerOneUsd = value / nominal;
  const quoteDate =
    typeof data.Date === 'string' && data.Date.trim() !== ''
      ? data.Date
      : new Date().toISOString();

  cache = {
    rate: rateRubPerOneUsd,
    quoteDate,
    expiresAtMs: now + CACHE_TTL_MS,
  };

  return {
    rubPerUsd: rateRubPerOneUsd,
    quoteDate,
  };
}
