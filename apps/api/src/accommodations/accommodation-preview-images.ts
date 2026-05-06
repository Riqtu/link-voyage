import { z } from 'zod';
import { ACCOMMODATION_PREVIEW_IMAGES_MAX } from './accommodation.constants';

/** Элемент галереи в карточке жилья (URL фото и опциональная «зона» типа Спальня 1). */
export type AccommodationPreviewImageItem = {
  url: string;
  zone?: string;
};

const previewZoneMax = 80;
const previewUrlMax = 2048;

/** Ввод API / сохранение */
export const accommodationPreviewImageInputItemSchema = z.object({
  url: z.string().url().max(previewUrlMax),
  zone: z.string().max(previewZoneMax).optional(),
});

export const accommodationPreviewImagesInputSchema = z
  .array(accommodationPreviewImageInputItemSchema)
  .max(ACCOMMODATION_PREVIEW_IMAGES_MAX)
  .optional();

export function sanitizeZone(raw?: string | null): string | undefined {
  const t = raw?.trim();
  if (!t) return undefined;
  return t.slice(0, previewZoneMax);
}

/** Нормализация записей из Mongo (устаревший string[] или объекты). */
export function normalizePreviewImageItems(
  raw: unknown,
): AccommodationPreviewImageItem[] {
  if (!Array.isArray(raw)) return [];
  const out: AccommodationPreviewImageItem[] = [];
  const seenUrl = new Set<string>();
  for (const el of raw) {
    if (typeof el === 'string') {
      const u = el.trim();
      if (!/^https?:\/\//i.test(u) || u.length > previewUrlMax) continue;
      if (seenUrl.has(u)) continue;
      seenUrl.add(u);
      out.push({ url: u });
      if (out.length >= ACCOMMODATION_PREVIEW_IMAGES_MAX) break;
      continue;
    }
    if (!el || typeof el !== 'object' || Array.isArray(el)) continue;
    const o = el as Record<string, unknown>;
    const u = typeof o.url === 'string' ? o.url.trim() : '';
    if (!/^https?:\/\//i.test(u) || u.length > previewUrlMax) continue;
    if (seenUrl.has(u)) continue;
    seenUrl.add(u);
    const zoneRaw = typeof o.zone === 'string' ? o.zone : undefined;
    out.push({
      url: u,
      zone: sanitizeZone(zoneRaw),
    });
    if (out.length >= ACCOMMODATION_PREVIEW_IMAGES_MAX) break;
  }
  return out;
}

export function flattenPreviewUrls(
  items: AccommodationPreviewImageItem[],
): string[] {
  return items.map((i) => i.url);
}

export function previewItemsFromUrlsOnly(
  urls: string[],
): AccommodationPreviewImageItem[] {
  return normalizePreviewImageItems(urls);
}
