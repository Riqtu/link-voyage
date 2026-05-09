import { z } from 'zod';
import { accommodationPreviewImagesInputSchema } from '../../accommodations/accommodation-preview-images';

export const authInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
});

/** ISO-строка даты или null (сброс); при отсутствии ключа в запросе дату не трогаем */
const tripDateSettingSchema = z
  .union([z.string().datetime(), z.null()])
  .optional();

export const tripSettingsSchema = z.object({
  peopleCount: z.number().int().min(1).max(99),
  startDate: tripDateSettingSchema,
  endDate: tripDateSettingSchema,
  timezone: z.string().min(2).max(80).default('Europe/Moscow'),
  housingRequirements: z.array(z.string().min(1).max(40)).max(20).default([]),
});

export const accommodationInputSchema = z.object({
  title: z.string().min(2).max(160),
  provider: z.string().max(120).optional(),
  sourceUrl: z.string().url().optional(),
  locationLabel: z.string().max(120).optional(),
  coordinates: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
  price: z.number().positive().optional(),
  pricingMode: z.enum(['total', 'perNight', 'perPerson']).default('total'),
  currency: z.string().min(3).max(3).default('EUR'),
  rating: z.number().min(0).max(10).optional(),
  freeCancellation: z.boolean().default(false),
  amenities: z.array(z.string().min(1).max(30)).max(20).default([]),
  notes: z.string().max(500).optional(),
  previewDescription: z.string().max(8000).optional(),
  previewImages: accommodationPreviewImagesInputSchema,
});
