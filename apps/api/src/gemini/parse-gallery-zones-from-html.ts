import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import {
  type AccommodationPreviewImageItem,
  normalizePreviewImageItems,
  sanitizeZone,
} from '../accommodations/accommodation-preview-images';
import { ACCOMMODATION_PREVIEW_IMAGES_MAX } from '../accommodations/accommodation.constants';
import { galleryImageHintsForGeminiFromHtml } from '../link-preview/link-preview';
import {
  MAX_PASTED_LISTING_HTML_CHARS,
  MIN_PASTED_LISTING_HTML_CHARS,
  PASTED_HTML_FALLBACK_BASE_HREF,
} from '../link-preview/link-preview-from-paste';

import { runGeminiThroughOptionalProxy } from './gemini-outbound-proxy';

const geminiGallerySchema = z.object({
  items: z.array(
    z.object({
      index: z.number().finite(),
      zone: z.string().max(80).optional(),
    }),
  ),
});

function parseJsonLenientGemini(raw: string): unknown {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenceMatch?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    const i0 = body.indexOf('{');
    const i1 = body.lastIndexOf('}');
    if (i0 >= 0 && i1 > i0) {
      return JSON.parse(body.slice(i0, i1 + 1)) as unknown;
    }
    throw new Error('Не JSON');
  }
}

/** HTML из DevTools (галерея / lightbox): URL вырезаются локально, зоны — Gemini. */
export async function parseGalleryZonesFromPastedHtml(
  rawHtml: string,
  pageUrlForBase?: string | null,
): Promise<AccommodationPreviewImageItem[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY не задан');

  const trimmed = rawHtml.trim();
  if (trimmed.length < MIN_PASTED_LISTING_HTML_CHARS) {
    throw new Error(
      `Слишком мало HTML (минимум ${MIN_PASTED_LISTING_HTML_CHARS} символов после trim)`,
    );
  }
  if (trimmed.length > MAX_PASTED_LISTING_HTML_CHARS) {
    throw new Error('HTML слишком большой');
  }

  const baseRaw = (
    pageUrlForBase?.trim() || PASTED_HTML_FALLBACK_BASE_HREF
  ).trim();
  let validatedBase: string;
  try {
    const u = new URL(baseRaw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new Error('bad protocol');
    }
    validatedBase = u.href;
  } catch {
    throw new Error(
      'Укажите полный URL страницы галереи (для абсолютных ссылок на фото)',
    );
  }

  const { urls, numberedBlock } = galleryImageHintsForGeminiFromHtml(
    trimmed,
    validatedBase,
  );

  if (urls.length === 0) {
    throw new Error(
      'В HTML не найдено ни одной подходящей ссылки на изображение (увеличьте фрагмент или проверьте URL страницы)',
    );
  }

  const modelId = process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash-exp';
  const genAI = new GoogleGenerativeAI(apiKey);
  const systemInstruction = `
Ты размечаешь фото объекта жилья для карточки поездки.
Единственный источник ссылок — блок IMAGE_INDICES_AND_URL ниже (индекс + URL и подписи DOM).
Не придумывай и не добавляй другие URL. Для понятных кадров задай короткий «zone» на русском или английском:
Спальня 1, Спальня 2, Гостиная, Кухня, Ванная, Терраса, Бассейн, Вид, Другое и т.п.
Если зона не ясна — опусти поле zone.
Формат ответа: один JSON {"items":[{"index":1,"zone":"..."}, ...]}, индекс с 1 по N строго по списку, без дубликатов index.`;

  const payload = `
Всего кандидатов: ${urls.length} (не больше ${ACCOMMODATION_PREVIEW_IMAGES_MAX} попадёт в карточку по порядку).

IMAGE_INDICES_AND_URL:
${numberedBlock.slice(0, 120_000)}
`;

  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction,
    generationConfig: {
      temperature: 0.15,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    },
  });

  const result = await runGeminiThroughOptionalProxy(() =>
    model.generateContent(payload),
  );
  const text = result.response.text()?.trim();
  if (!text) throw new Error('Gemini вернул пустой ответ');

  let assignments: z.infer<typeof geminiGallerySchema>;
  try {
    assignments = geminiGallerySchema.parse(parseJsonLenientGemini(text));
  } catch {
    throw new Error('Не удалось разобрать ответ Gemini (зоны фото)');
  }

  const zoneByIndex = new Map<number, string>();
  const maxIx = urls.length;
  for (const row of assignments.items) {
    const ix = Math.trunc(Number(row.index));
    if (!Number.isFinite(ix) || ix < 1 || ix > maxIx) continue;
    const z = sanitizeZone(row.zone);
    if (z) zoneByIndex.set(ix, z);
  }

  const out: AccommodationPreviewImageItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (seen.has(url)) continue;
    seen.add(url);
    const zone = zoneByIndex.get(i + 1);
    out.push(zone ? { url, zone } : { url });
    if (out.length >= ACCOMMODATION_PREVIEW_IMAGES_MAX) break;
  }

  return normalizePreviewImageItems(out);
}
