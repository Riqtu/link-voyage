import { ACCOMMODATION_PREVIEW_IMAGES_MAX } from "@/lib/accommodation-constants";
import type { AccommodationPreviewImage } from "@/lib/trpc";

/** Секции миниатюр в модалке галереи: порядок зон как при первом появлении в списке. */
export function groupPreviewImagesByZone(
  images: AccommodationPreviewImage[],
): { label: string; indices: number[] }[] {
  const order: string[] = [];
  const byZone = new Map<string, number[]>();
  images.forEach((img, idx) => {
    const raw = img.zone?.trim();
    const key = raw && raw.length > 0 ? raw : "__none__";
    if (!byZone.has(key)) {
      byZone.set(key, []);
      order.push(key);
    }
    byZone.get(key)!.push(idx);
  });
  return order.map((k) => ({
    label: k === "__none__" ? "Без подписи" : k,
    indices: byZone.get(k)!,
  }));
}

export function mergePreviewImageItems(
  existing: AccommodationPreviewImage[],
  incoming: AccommodationPreviewImage[],
): AccommodationPreviewImage[] {
  const seen = new Set(existing.map((x) => x.url));
  const out: AccommodationPreviewImage[] = [...existing];
  for (const item of incoming) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    const z = item.zone?.trim();
    out.push({
      url: item.url,
      ...(z ? { zone: z } : {}),
    });
    if (out.length >= ACCOMMODATION_PREVIEW_IMAGES_MAX) break;
  }
  return out;
}

export function sanitizePreviewImagesForSave(
  items: AccommodationPreviewImage[],
): AccommodationPreviewImage[] {
  return items.map(({ url, zone }) => ({
    url,
    ...(zone?.trim() ? { zone: zone.trim() } : {}),
  }));
}
