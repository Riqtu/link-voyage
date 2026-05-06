import { GoogleGenerativeAI } from '@google/generative-ai';
import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { runGeminiThroughOptionalProxy } from './gemini-outbound-proxy';

import { ACCOMMODATION_PREVIEW_IMAGES_MAX } from '../accommodations/accommodation.constants';
import type { LinkPreviewResult } from '../link-preview/link-preview';
import { fetchLinkPreview } from '../link-preview/link-preview';
import { linkPreviewFromPastedListingHtml } from '../link-preview/link-preview-from-paste';

const geminiEnrichLogger = new Logger('GeminiEnrich');

export type GeminiEnrichLogMode = 'off' | 'summary' | 'debug';

export function geminiEnrichLogMode(): GeminiEnrichLogMode {
  const v = process.env.GEMINI_ENRICH_LOG?.trim().toLowerCase() ?? '';
  if (
    !v ||
    v === '0' ||
    v === 'off' ||
    v === 'false' ||
    v === 'no' ||
    v === 'none'
  ) {
    return 'off';
  }
  if (
    v === 'debug' ||
    v === '2' ||
    v === 'full' ||
    v === 'verbose' ||
    v === 'all'
  ) {
    return 'debug';
  }
  return 'summary';
}

function truncateForLog(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  const head = Math.max(512, Math.floor(maxChars * 0.72));
  const tail = maxChars - head - 32;
  if (tail < 128)
    return `${s.slice(0, maxChars - 24)}\n… [ещё ${s.length - (maxChars - 24)} симв.]`;
  return `${s.slice(0, head)}\n… [пропуск ${s.length - head - tail} симв.] …\n${s.slice(-tail)}`;
}

export type AccommodationGeminiEnrichment = {
  canonicalUrl: string;
  title: string;
  provider: string;
  sourceUrl?: string;
  locationLabel?: string;
  coordinates?: { lat: number; lng: number };
  price?: number;
  pricingMode: 'total' | 'perNight' | 'perPerson';
  currency: string;
  rating?: number;
  freeCancellation: boolean;
  amenities: string[];
  notes?: string;
  previewDescription: string;
  previewImages: string[];
};

const geminiJsonSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  provider: z.string().max(120).optional(),
  locationLabel: z.string().max(120).optional(),
  coordinates: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
  price: z.number().positive().optional(),
  pricingMode: z.enum(['total', 'perNight', 'perPerson']).optional(),
  currency: z.string().min(1).max(8).optional(),
  rating: z.number().min(0).max(10).optional(),
  freeCancellation: z.boolean().optional(),
  amenities: z.array(z.string().min(1).max(40)).max(20).optional(),
  notes: z.string().max(500).optional(),
  previewDescription: z.string().max(8000).optional(),
  /** Только URL из блока KNOWN_IMAGE_URLS; не выдумывай ссылки */
  previewImages: z
    .array(z.string().max(2048))
    .max(ACCOMMODATION_PREVIEW_IMAGES_MAX)
    .optional(),
});

function stripTrailingCommasJson(json: string): string {
  return json.replace(/,\s*([}\]])/g, '$1');
}

/**
 * Достаёт первый валидный JSON-объект из ответа (кодовый блок, префиксный текст, обрезка).
 */
function parseJsonLenient(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Gemini вернул пустой ответ');
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const unfenced = fenceMatch?.[1]?.trim() ?? trimmed;
  if (!unfenced) {
    throw new Error('Gemini вернул пустой ответ');
  }

  const tryParse = (s: string): unknown => JSON.parse(s) as unknown;

  try {
    return tryParse(unfenced);
  } catch {
    /* continue */
  }
  try {
    return tryParse(stripTrailingCommasJson(unfenced));
  } catch {
    /* continue */
  }

  const i0 = unfenced.indexOf('{');
  const i1 = unfenced.lastIndexOf('}');
  if (i0 >= 0 && i1 > i0) {
    const slice = unfenced.slice(i0, i1 + 1);
    try {
      return tryParse(slice);
    } catch {
      /* continue */
    }
    try {
      return tryParse(stripTrailingCommasJson(slice));
    } catch {
      /* continue */
    }
  }

  throw new Error('Ответ не является JSON-объектом');
}

function toFiniteNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number.parseFloat(v.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function normalizePricingMode(
  v: unknown,
): 'total' | 'perNight' | 'perPerson' | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v)
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  if (s === 'total' || s === 'all') return 'total';
  if (s === 'pernight' || s === 'nightly' || s === 'perday' || s === 'night')
    return 'perNight';
  if (s === 'perperson' || s === 'perguest' || s === 'person' || s === 'guest')
    return 'perPerson';
  return undefined;
}

/** Приводит типичные «почти JSON» поля модели к виду, ожидаемому Zod. */
function normalizeGeminiJsonShape(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return input;
  }
  const o: Record<string, unknown> = { ...(input as Record<string, unknown>) };

  const pm = normalizePricingMode(o.pricingMode);
  if (pm === undefined) delete o.pricingMode;
  else o.pricingMode = pm;

  if (o.rating !== undefined && o.rating !== null) {
    const n = toFiniteNumber(o.rating);
    if (n === undefined) delete o.rating;
    else o.rating = Math.min(10, Math.max(0, n));
  }

  if (o.price !== undefined && o.price !== null) {
    if (typeof o.price === 'string') {
      const cleaned = String(o.price)
        .replace(/[^\d.,-]/g, '')
        .replace(',', '.');
      const n = Number.parseFloat(cleaned);
      if (!Number.isFinite(n) || n <= 0) delete o.price;
      else o.price = n;
    } else if (
      typeof o.price === 'number' &&
      (!Number.isFinite(o.price) || o.price <= 0)
    ) {
      delete o.price;
    }
  }

  if (o.coordinates !== undefined && o.coordinates !== null) {
    if (typeof o.coordinates !== 'object' || Array.isArray(o.coordinates)) {
      delete o.coordinates;
    } else {
      const c = o.coordinates as Record<string, unknown>;
      const lat = toFiniteNumber(c.lat);
      const lng = toFiniteNumber(c.lng);
      if (
        lat === undefined ||
        lng === undefined ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        delete o.coordinates;
      } else {
        o.coordinates = { lat, lng };
      }
    }
  }

  const boolish = (v: unknown): boolean | undefined => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return /^(true|yes|да|y|1)$/i.test(v.trim());
    return undefined;
  };
  if ('freeCancellation' in o) {
    const b = boolish(o.freeCancellation);
    if (b === undefined) delete o.freeCancellation;
    else o.freeCancellation = b;
  }

  const strScalar = (key: keyof typeof o | string, maxLen: number): void => {
    const val = o[key as string];
    if (val === undefined || val === null) return;
    if (typeof val === 'string') {
      o[key as string] = val.trim().slice(0, maxLen);
      return;
    }
    if (typeof val === 'number' && Number.isFinite(val)) {
      o[key as string] = String(val).slice(0, maxLen);
    }
  };

  strScalar('title', 160);
  strScalar('provider', 120);
  strScalar('locationLabel', 120);
  strScalar('notes', 500);
  strScalar('previewDescription', 8000);

  if (typeof o.currency === 'string') {
    const up = o.currency.trim().toUpperCase().slice(0, 8);
    o.currency = up.length >= 1 ? up : undefined;
    if (!o.currency) delete o.currency;
  }

  if (Array.isArray(o.amenities)) {
    o.amenities = o.amenities
      .map((x) =>
        String(x ?? '')
          .trim()
          .slice(0, 40),
      )
      .filter((x) => x.length > 0)
      .slice(0, 20);
    if ((o.amenities as unknown[]).length === 0) delete o.amenities;
  }

  if (Array.isArray(o.previewImages)) {
    o.previewImages = o.previewImages
      .map((x) =>
        String(x ?? '')
          .trim()
          .slice(0, 2048),
      )
      .filter((x) => x.length > 0)
      .slice(0, ACCOMMODATION_PREVIEW_IMAGES_MAX);
    if ((o.previewImages as unknown[]).length === 0) delete o.previewImages;
  }

  for (const k of [
    'title',
    'provider',
    'locationLabel',
    'notes',
    'previewDescription',
  ] as const) {
    const v = o[k];
    if (typeof v === 'string' && !v.trim()) delete o[k];
  }
  if (typeof o.currency === 'string' && !o.currency.trim()) delete o.currency;

  return o;
}

type GeminiParsedShape = z.infer<typeof geminiJsonSchema>;

/** Если после нормализации Zod всё ещего ругается — безопасно вытащить допустимое подмножество. */
function buildGeminiFallback(o: Record<string, unknown>): GeminiParsedShape {
  const pickStr = (k: string, max: number): string | undefined => {
    const v = o[k];
    if (v === undefined || v === null) return undefined;
    const s = typeof v === 'string' ? v.trim() : String(v).trim();
    const t = s.slice(0, max);
    return t.length >= 1 ? t : undefined;
  };

  const out: GeminiParsedShape = {};

  const title = pickStr('title', 160);
  if (title) out.title = title;

  const provider = pickStr('provider', 120);
  if (provider) out.provider = provider;

  const locationLabel = pickStr('locationLabel', 120);
  if (locationLabel) out.locationLabel = locationLabel;

  const notes = pickStr('notes', 500);
  if (notes) out.notes = notes;

  const previewDescription = pickStr('previewDescription', 8000);
  if (previewDescription) out.previewDescription = previewDescription;

  const pm = normalizePricingMode(o.pricingMode);
  if (pm) out.pricingMode = pm;

  const curr = pickStr('currency', 8);
  if (curr) out.currency = curr.slice(0, 8);

  const price =
    typeof o.price === 'number' && o.price > 0
      ? o.price
      : toFiniteNumber(o.price);
  if (price !== undefined && price > 0) out.price = price;

  if (typeof o.rating === 'number' && o.rating >= 0 && o.rating <= 10) {
    out.rating = o.rating;
  } else {
    const r = toFiniteNumber(o.rating);
    if (r !== undefined) out.rating = Math.min(10, Math.max(0, r));
  }

  if (
    o.coordinates &&
    typeof o.coordinates === 'object' &&
    !Array.isArray(o.coordinates)
  ) {
    const c = o.coordinates as Record<string, unknown>;
    const lat = toFiniteNumber(c.lat);
    const lng = toFiniteNumber(c.lng);
    if (
      lat !== undefined &&
      lng !== undefined &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      out.coordinates = { lat, lng };
    }
  }

  if (typeof o.freeCancellation === 'boolean') {
    out.freeCancellation = o.freeCancellation;
  } else if (typeof o.freeCancellation === 'string') {
    out.freeCancellation = /^(true|yes|да|y|1)$/i.test(
      o.freeCancellation.trim(),
    );
  }

  if (Array.isArray(o.amenities)) {
    const am = o.amenities
      .map((x) =>
        String(x ?? '')
          .trim()
          .slice(0, 40),
      )
      .filter((x) => x.length > 0)
      .slice(0, 20);
    if (am.length > 0) out.amenities = am;
  }

  if (Array.isArray(o.previewImages)) {
    const imgs = o.previewImages
      .map((x) =>
        String(x ?? '')
          .trim()
          .slice(0, 2048),
      )
      .filter((x) => x.length > 0)
      .slice(0, ACCOMMODATION_PREVIEW_IMAGES_MAX);
    if (imgs.length > 0) out.previewImages = imgs;
  }

  return out;
}

export type GeminiEnrichmentParseMeta = {
  parsePath: 'zod' | 'fallback';
  zodIssues?: string;
};

function parseGeminiEnrichmentJson(text: string): {
  data: GeminiParsedShape;
  meta: GeminiEnrichmentParseMeta;
} {
  let raw: unknown;
  try {
    raw = parseJsonLenient(text);
  } catch (e) {
    throw new Error('Не удалось разобрать ответ Gemini', { cause: e });
  }

  if (Array.isArray(raw) && raw.length > 0) {
    const head = raw[0];
    if (head && typeof head === 'object' && !Array.isArray(head)) {
      raw = head;
    }
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Не удалось разобрать ответ Gemini', {
      cause: new Error('Ожидался JSON-объект'),
    });
  }

  const normalized = normalizeGeminiJsonShape(raw) as Record<string, unknown>;
  const parsed = geminiJsonSchema.safeParse(normalized);
  if (parsed.success) {
    return { data: parsed.data, meta: { parsePath: 'zod' } };
  }
  const zodIssues = parsed.error.issues
    .slice(0, 20)
    .map((issue) =>
      issue.path?.length
        ? `${issue.path.join('.')}: ${issue.message}`
        : `(root): ${issue.message}`,
    )
    .join('; ');
  return {
    data: buildGeminiFallback(normalized),
    meta: { parsePath: 'fallback', zodIssues },
  };
}

function sanitizeCurrency(raw?: string): string | undefined {
  if (!raw) return undefined;
  const up = raw.trim().toUpperCase().slice(0, 3);
  if (/^[A-Z]{3}$/.test(up)) return up;
  return undefined;
}

function normalizeAmenities(raw?: string[]): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const t = String(item).trim().slice(0, 30);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length >= 20) break;
  }
  return out;
}

/** Если Gemini не вернул notes — краткая выдержка для команды без дублирования заголовка карточки. */
function deriveNotesFallback(
  fullDescription: string,
  cardPreviewText: string,
): string | undefined {
  const raw = fullDescription.trim();
  if (raw.length < 40) return undefined;
  const head = cardPreviewText.slice(0, 380).trim().toLowerCase();
  if (!head) return undefined;

  const parts = raw
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 18);
  const picked: string[] = [];
  for (const sentence of parts) {
    const key = sentence.slice(0, 48).toLowerCase();
    if (head.includes(key)) continue;
    picked.push(sentence);
    if (picked.length >= 3) break;
  }
  if (picked.length === 0) {
    const half = raw.slice(Math.floor(raw.length * 0.38)).trim();
    if (half.length < 35) return undefined;
    const tailKey = half.slice(0, 56).toLowerCase();
    if (head.includes(tailKey.slice(0, 40))) return undefined;
    return half.slice(0, 500);
  }
  const joined = picked.join(' ').replace(/\s+/g, ' ').trim();
  return joined.slice(0, 500);
}

function mergePreviewImagesOrder(
  known: string[],
  preferred?: string[],
): string[] {
  if (!preferred?.length)
    return known.slice(0, ACCOMMODATION_PREVIEW_IMAGES_MAX);
  const knownSet = new Set(known);
  const picked: string[] = [];
  for (const candidate of preferred) {
    try {
      const u = String(candidate).trim();
      new URL(u);
      if (!knownSet.has(u)) continue;
      if (!picked.includes(u)) picked.push(u);
      if (picked.length >= ACCOMMODATION_PREVIEW_IMAGES_MAX) return picked;
    } catch {
      /* skip invalid */
    }
  }
  for (const u of known) {
    if (!picked.includes(u)) picked.push(u);
    if (picked.length >= ACCOMMODATION_PREVIEW_IMAGES_MAX) break;
  }
  return picked.slice(0, ACCOMMODATION_PREVIEW_IMAGES_MAX);
}

/**
 * Обогащение Gemini по уже собранному превью (по ссылке или из вставленного HTML).
 */
export async function enrichAccommodationFromPreview(
  preview: LinkPreviewResult,
): Promise<AccommodationGeminiEnrichment> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY не задан');
  }

  const descriptionChunk = preview.description.slice(0, 10_000);
  const imagesBlock =
    preview.images.length > 0
      ? preview.images.map((href, idx) => `${idx + 1}. ${href}`).join('\n')
      : '(нет распознанных og:image URL)';

  const structuredAmenities = preview.structuredAmenities ?? [];
  const structuredAmenitiesBlock =
    structuredAmenities.length > 0
      ? structuredAmenities.map((a, i) => `${i + 1}. ${a}`).join('\n')
      : '(нет — выведи удобства только из DESCRIPTION_TEXT, если они явно названы)';

  const modelId = process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash-exp';

  const enrichMaxTokensRaw =
    process.env.GEMINI_ENRICH_MAX_OUTPUT_TOKENS?.trim() ?? '';
  const enrichMaxParsed = enrichMaxTokensRaw
    ? Number.parseInt(enrichMaxTokensRaw, 10)
    : 4096;
  const enrichMaxOutputTokens =
    Number.isFinite(enrichMaxParsed) &&
    enrichMaxParsed >= 1024 &&
    enrichMaxParsed <= 8192
      ? enrichMaxParsed
      : 4096;

  const genAI = new GoogleGenerativeAI(apiKey);
  const systemInstruction = `
Ты помощник для сравнения вариантов жилья (отели, апартаменты, Airbnb).
Тебе даны: источник/URL (может быть фрагмент со страницы), метаданные (title, site name), текст описания, список URL изображений,
и при наличии — STRUCTURED_AMENITIES_FROM_PAGE (удобства из структурированной разметки страницы).
Задача: извлеки информацию объявления в один JSON-объект с опциональными полями:
title, provider, locationLabel, coordinates {lat,lng}, price, pricingMode, currency, rating, freeCancellation,
amenities (массив коротких тегов), notes (строка до 500 символов), previewDescription, previewImages.

Правила:
- Ничего не выдумывай: только то, что вытекает из переданных данных.
- previewImages: только URL из блока KNOWN_IMAGE_URLS, лучший порядок до ${ACCOMMODATION_PREVIEW_IMAGES_MAX} шт. для карточки. Не добавляй другие URL.
- rating по шкале 0–10, если указано; иначе опусти.
- price только явное положительное число из текста или метаданных; диапазон без одного числа — опусти.
- pricingMode: total / perNight / perPerson по смыслу.
- currency три буквы ISO.
- amenities: обязательно включи все пункты из STRUCTURED_AMENITIES_FROM_PAGE (если блок не пустой), приведя к коротким тегам;
  дополни из DESCRIPTION_TEXT только явно названные удобства; не дублируй.
- locationLabel если есть район/адрес строкой без надёжных координат; coordinates только при явных lat/lng в данных.
- notes (важно): краткие заметки для команды планирования из DESCRIPTION_TEXT — правила дома, залог/депозит,
  лимиты гостей, шумность/этаж, нюансы заселения/выезда, курение/животные, минимальный срок, то что не разложено
  в amenities и не дублирует дословно весь текст. Если таких фактов нет — опусти notes.
  Не копируй целиком длинное описание: для полного текста служит previewDescription.
- previewDescription: сжатое или структурированное описание для карточки из того же текста (можно чуть отредактировать),
  без выдуманных деталей.
`;

  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: enrichMaxOutputTokens,
      responseMimeType: 'application/json',
    },
  });

  const userPayload = `
URL: ${preview.canonicalUrl}
OG_TITLE: ${preview.title.slice(0, 500)}
SITE_NAME: ${preview.siteName}
DESCRIPTION_TEXT:
"""
${descriptionChunk}
"""

STRUCTURED_AMENITIES_FROM_PAGE:
${structuredAmenitiesBlock}

KNOWN_IMAGE_URLS:
${imagesBlock}
`;

  const result = await runGeminiThroughOptionalProxy(() =>
    model.generateContent(userPayload),
  );
  const text = result.response.text();
  if (!text.trim()) {
    throw new Error('Gemini вернул пустой ответ');
  }

  const logMode = geminiEnrichLogMode();

  let parseBundle: ReturnType<typeof parseGeminiEnrichmentJson>;
  try {
    parseBundle = parseGeminiEnrichmentJson(text);
  } catch (err) {
    if (logMode !== 'off') {
      geminiEnrichLogger.warn(
        `JSON Gemini не распарсен: url=${truncateForLog(preview.canonicalUrl, 240)} вход=${text.length} симв.`,
      );
      if (logMode === 'debug') {
        geminiEnrichLogger.warn(
          `Сырой ответ (усечённо):\n${truncateForLog(text, 8000)}`,
        );
      }
    }
    throw err;
  }

  const parsed = parseBundle.data;

  const currency = sanitizeCurrency(parsed.currency) ?? 'EUR';

  const pricingMode = parsed.pricingMode ?? 'total';

  const title =
    (parsed.title && parsed.title.length >= 2
      ? parsed.title
      : preview.title.trim()) || preview.canonicalUrl;

  const provider =
    (parsed.provider ?? preview.siteName).trim().slice(0, 120) || '';

  const previewDescription = (
    parsed.previewDescription ?? preview.description
  ).slice(0, 8000);

  const previewImages = mergePreviewImagesOrder(
    preview.images,
    parsed.previewImages,
  );

  let rating: number | undefined;
  if (parsed.rating !== undefined && Number.isFinite(parsed.rating)) {
    rating = parsed.rating;
  }

  const modelNotesRaw = parsed.notes?.trim();
  const modelNotes =
    modelNotesRaw && modelNotesRaw.length > 0
      ? modelNotesRaw.slice(0, 500)
      : undefined;
  const notesFallback = deriveNotesFallback(
    descriptionChunk,
    previewDescription,
  );
  const notes = modelNotes ?? notesFallback;

  const enrichment: AccommodationGeminiEnrichment = {
    canonicalUrl: preview.canonicalUrl,
    title: title.slice(0, 160),
    provider,
    sourceUrl: preview.canonicalUrl,
    locationLabel: parsed.locationLabel?.slice(0, 120),
    coordinates: parsed.coordinates,
    price: parsed.price,
    pricingMode,
    currency,
    rating,
    freeCancellation: parsed.freeCancellation ?? false,
    amenities: normalizeAmenities([
      ...structuredAmenities,
      ...(parsed.amenities ?? []),
    ]),
    notes,
    previewDescription,
    previewImages,
  };

  if (logMode !== 'off') {
    geminiEnrichLogger.log(
      `ответ Gemini: parse=${parseBundle.meta.parsePath} url=${truncateForLog(preview.canonicalUrl, 220)} симв.входа=${text.length} описание=${previewDescription.length} картинки=${previewImages.length} amenities=${enrichment.amenities.length}`,
    );
    if (
      parseBundle.meta.parsePath === 'fallback' &&
      parseBundle.meta.zodIssues
    ) {
      geminiEnrichLogger.warn(
        `Zod после нормализации (fallback): ${truncateForLog(parseBundle.meta.zodIssues, 1600)}`,
      );
    }
    if (logMode === 'debug') {
      geminiEnrichLogger.log(
        `сырой текст модели (${text.length}):\n${truncateForLog(text, 8000)}`,
      );
      geminiEnrichLogger.log(
        `итог для карточки: ${truncateForLog(
          JSON.stringify(
            {
              title: enrichment.title,
              provider: enrichment.provider,
              pricingMode: enrichment.pricingMode,
              currency: enrichment.currency,
              price: enrichment.price,
              rating: enrichment.rating,
              freeCancellation: enrichment.freeCancellation,
              locationLabel: enrichment.locationLabel,
              coordinates: enrichment.coordinates,
              amenitiesPreview: enrichment.amenities.slice(0, 12),
              previewImages: enrichment.previewImages,
              notesPreview:
                enrichment.notes && truncateForLog(enrichment.notes, 400),
              previewDescriptionPreview: truncateForLog(
                enrichment.previewDescription,
                520,
              ),
              modelFields: Object.keys(parsed).filter(
                (k) => parsed[k as keyof GeminiParsedShape] !== undefined,
              ),
            },
            null,
            0,
          ),
          6000,
        )}`,
      );
    }
  }

  return enrichment;
}

export async function enrichAccommodationFromUrl(
  rawUrl: string,
): Promise<AccommodationGeminiEnrichment> {
  const preview = await fetchLinkPreview(rawUrl);
  return enrichAccommodationFromPreview(preview);
}

/**
 * Если сайт режет наш fetch (Trip.com passport и т.д.) — можно вставить HTML из DevTools
 * и указать URL страницы объявления для относительных картинок.
 */
export async function enrichAccommodationFromPastedHtml(
  rawHtml: string,
  pageUrlForBase?: string | null,
): Promise<AccommodationGeminiEnrichment> {
  const preview = linkPreviewFromPastedListingHtml(rawHtml, pageUrlForBase);
  return enrichAccommodationFromPreview(preview);
}
