/**
 * Курсы валют ЦБ РФ через публичное зеркало JSON (ежедневные курсы).
 * Вызывается только с сервера (без проблем с CORS).
 */

type CbrValute = { Value?: number; Nominal?: number };
type CbrDailyJson = {
  Date?: string;
  Valute?: Record<string, CbrValute>;
};

type CacheEntry = {
  data: CbrDailyJson;
  fetchedAtMs: number;
  expiresAtMs: number;
};

let cache: CacheEntry | null = null;

/** Курсы ЦБ меняются раз в рабочий день — кэш на пару часов снижает нагрузку. */
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

async function fetchCbrDailyJson(): Promise<CbrDailyJson> {
  const now = Date.now();
  if (cache && cache.expiresAtMs > now) return cache.data;

  const response = await fetch('https://www.cbr-xml-daily.ru/daily_json.js', {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`CBR ответил ${response.status}`);
  }

  const data = (await response.json()) as CbrDailyJson;
  cache = { data, fetchedAtMs: now, expiresAtMs: now + CACHE_TTL_MS };
  return data;
}

export async function getRubRateFromCbr(currency: string): Promise<{
  /** Сколько рублей за 1 единицу валюты */
  rubPerUnit: number;
  /** ISO-код валюты, для которой получен курс */
  currency: string;
  /** Дата/время котировки из ответа сервиса */
  quoteDate: string;
}> {
  const normalized = currency.trim().toUpperCase();
  const data = await fetchCbrDailyJson();
  const quoteDate =
    typeof data.Date === 'string' && data.Date.trim() !== ''
      ? data.Date
      : new Date().toISOString();

  if (normalized === 'RUB') {
    return { rubPerUnit: 1, currency: 'RUB', quoteDate };
  }

  const val = data.Valute?.[normalized];
  const nominal = val?.Nominal ?? 1;
  const value = val?.Value;
  if (typeof value !== 'number' || !Number.isFinite(value) || nominal <= 0) {
    throw new Error(`В ответе ЦБ нет курса ${normalized}`);
  }

  return {
    rubPerUnit: value / nominal,
    currency: normalized,
    quoteDate,
  };
}

export async function getUsdRubRateFromCbr(): Promise<{
  rubPerUsd: number;
  quoteDate: string;
}> {
  const r = await getRubRateFromCbr('USD');
  return { rubPerUsd: r.rubPerUnit, quoteDate: r.quoteDate };
}
