import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { runGeminiThroughOptionalProxy } from './gemini-outbound-proxy';

import type { LinkPreviewResult } from '../link-preview/link-preview';
import { fetchLinkPreview } from '../link-preview/link-preview';

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
  title: z.string().min(2).max(160).optional(),
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
  currency: z.string().min(3).max(3).optional(),
  rating: z.number().min(0).max(10).optional(),
  freeCancellation: z.boolean().optional(),
  amenities: z.array(z.string().min(1).max(40)).max(20).optional(),
  notes: z.string().max(500).optional(),
  previewDescription: z.string().max(8000).optional(),
  /** Только URL из блока KNOWN_IMAGE_URLS; не выдумывай ссылки */
  previewImages: z.array(z.string().max(2048)).max(8).optional(),
});

function parseJsonStrict(raw: string): unknown {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  const body = fenceMatch ? fenceMatch[1]?.trim() : trimmed;
  if (!body) {
    throw new Error('Gemini вернул пустой ответ');
  }
  return JSON.parse(body) as unknown;
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
  if (!preferred?.length) return known.slice(0, 8);
  const knownSet = new Set(known);
  const picked: string[] = [];
  for (const candidate of preferred) {
    try {
      const u = String(candidate).trim();
      new URL(u);
      if (!knownSet.has(u)) continue;
      if (!picked.includes(u)) picked.push(u);
      if (picked.length >= 8) return picked;
    } catch {
      /* skip invalid */
    }
  }
  for (const u of known) {
    if (!picked.includes(u)) picked.push(u);
    if (picked.length >= 8) break;
  }
  return picked.slice(0, 8);
}

export async function enrichAccommodationFromUrl(
  rawUrl: string,
): Promise<AccommodationGeminiEnrichment> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY не задан');
  }

  const preview: LinkPreviewResult = await fetchLinkPreview(rawUrl);

  const descriptionChunk = preview.description.slice(0, 10_000);
  const imagesBlock =
    preview.images.length > 0
      ? preview.images.map((href, idx) => `${idx + 1}. ${href}`).join('\n')
      : '(нет распознанных og:image URL)';

  const modelId = process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash-exp';

  const genAI = new GoogleGenerativeAI(apiKey);
  const systemInstruction = `
Ты помощник для сравнения вариантов жилья (отели, апартаменты, Airbnb).
Тебе даны: URL страницы, уже известные метаданные (title, описание сайта), текст описания (Open Graph и т.п.) и точный список URL картинок (только они допустимы в previewImages).
Задача: извлеки информацию объявления в один JSON-объект с опциональными полями:
title, provider, locationLabel, coordinates {lat,lng}, price, pricingMode, currency, rating, freeCancellation,
amenities (массив коротких тегов), notes (строка до 500 символов), previewDescription, previewImages.

Правила:
- Ничего не выдумывай: только то, что вытекает из переданных данных.
- previewImages: только URL из блока KNOWN_IMAGE_URLS, лучший порядок для карточки. Не добавляй другие URL.
- rating по шкале 0–10, если указано; иначе опусти.
- price только явное положительное число из текста или метаданных; диапазон без одного числа — опусти.
- pricingMode: total / perNight / perPerson по смыслу.
- currency три буквы ISO.
- amenities: только явно упомянутые удобства, короткие теги.
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
      maxOutputTokens: 2048,
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

  let parsed: z.infer<typeof geminiJsonSchema>;
  try {
    parsed = geminiJsonSchema.parse(parseJsonStrict(text));
  } catch {
    throw new Error('Не удалось разобрать ответ Gemini');
  }

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

  return {
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
    amenities: normalizeAmenities(parsed.amenities),
    notes,
    previewDescription,
    previewImages,
  };
}
