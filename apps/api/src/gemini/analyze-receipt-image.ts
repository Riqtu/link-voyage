import { GoogleGenerativeAI } from '@google/generative-ai';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const geminiReceiptSchema = z.object({
  currency: z.string().min(3).max(3).optional(),
  lines: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        quantity: z.number().finite().positive().max(999).optional(),
        unitPrice: z.number().finite().nonnegative().optional(),
        lineTotal: z.number().finite().nonnegative(),
      }),
    )
    .min(1)
    .max(80),
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

function parseJsonStrict(raw: string): unknown {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  const body = fenceMatch ? fenceMatch[1]?.trim() : trimmed;
  if (!body) {
    throw new Error('Gemini вернул пустой ответ');
  }
  return JSON.parse(body) as unknown;
}

export type NormalizedReceiptLine = {
  id: string;
  name: string;
  qty: number;
  unitPrice?: number;
  lineTotal: number;
};

export type AnalyzeReceiptImageResult = {
  currency: string;
  items: NormalizedReceiptLine[];
};

/** Публичное фото только из нашего bucket и пути чеков поездки */
export function assertTrustedReceiptImageUrl(
  url: string,
  tripId: string,
): void {
  const endpointRaw = process.env.AWS_S3_ENDPOINT ?? '';
  const bucket = process.env.AWS_S3_BUCKET ?? '';
  if (!endpointRaw || !bucket) {
    throw new Error('S3 не настроен (AWS_S3_*)');
  }
  const endpoint = endpointRaw.replace(/\/$/, '');
  const expectedPrefix = `${endpoint}/${bucket}/trips/${tripId}/receipts/`;
  const normalizedUrl = decodeURI(url.trim());
  if (!normalizedUrl.startsWith(expectedPrefix)) {
    throw new Error(
      'URL изображения не принадлежит фото чеков этой поездки в S3',
    );
  }
}

function normalizeMime(
  ct: string | null,
): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  const v = ct?.split(';')[0]?.trim().toLowerCase();
  if (v === 'image/png') return 'image/png';
  if (v === 'image/webp') return 'image/webp';
  if (v === 'image/gif') return 'image/gif';
  return 'image/jpeg';
}

export async function analyzeReceiptImageFromUrl(
  imageUrl: string,
  tripId: string,
): Promise<AnalyzeReceiptImageResult> {
  assertTrustedReceiptImageUrl(imageUrl, tripId);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY не задан');
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 25_000);
  let response: Response;
  try {
    response = await fetch(imageUrl, { signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new Error(`Не удалось скачать изображение: ${response.status}`);
  }
  const buf = Buffer.from(await response.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) {
    throw new Error('Изображение слишком большое (макс. 10MB)');
  }
  const mime = normalizeMime(response.headers.get('content-type'));

  const modelId = process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash';

  const genAI = new GoogleGenerativeAI(apiKey);
  const systemInstruction = `
Ты анализируешь фото чека из ресторана или магазина.
Верни ТОЛЬКО валидный JSON (без пояснений) со структурой:
{ "currency"?: строка ISO 4217 ровно 3 буквы (например RUB, EUR, USD — если понятно),
  "lines": [ { "name": краткое название позиции, "quantity"?: число >=1 если видно количество, иначе 1),
              "unitPrice"?: число за единицу если есть,
              "lineTotal": полная сумма по строке (обязательно, число >=0) } ] }

Правила:
- Пиши name по-русски или как на чеке, без выдуманных позиций.
- Не включай промежуточные итоги «Предоплата», «Сервис», «Налог» отдельно, только если они реально строки чека; иначе включи только блюда/товары и явные сборы если есть отдельной строкей.
- Если видна только общая сумма без строк — один объект в lines с name "Всего" и этой суммой.
- Числа десятичные с точкой. Не добавляй валютные символы в числа.
- Минимум одна строка в lines.
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

  const prompt =
    'Распознай позиции и суммы по этому изображению чека по правилам выше.';

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: mime,
        data: buf.toString('base64'),
      },
    },
    { text: prompt },
  ]);

  const text = result.response.text()?.trim();
  if (!text) {
    throw new Error('Gemini вернул пустой ответ');
  }

  let parsedRaw: z.infer<typeof geminiReceiptSchema>;
  try {
    parsedRaw = geminiReceiptSchema.parse(parseJsonStrict(text));
  } catch {
    throw new Error('Не удалось разобрать ответ Gemini по чеку');
  }

  const currencyUpper = parsedRaw.currency
    ? parsedRaw.currency.trim().toUpperCase().slice(0, 3)
    : 'RUB';
  const currency = /^[A-Z]{3}$/.test(currencyUpper) ? currencyUpper : 'RUB';

  const items: NormalizedReceiptLine[] = parsedRaw.lines.map((ln) => {
    const qty = ln.quantity ?? 1;
    const safeQty =
      Number.isFinite(qty) && qty >= 1
        ? Math.min(999, Math.round(qty * 1000) / 1000)
        : 1;
    return {
      id: randomUUID(),
      name: ln.name.trim().slice(0, 200),
      qty: safeQty,
      unitPrice:
        ln.unitPrice !== undefined && Number.isFinite(ln.unitPrice)
          ? ln.unitPrice
          : undefined,
      lineTotal: ln.lineTotal,
    };
  });

  return { currency, items };
}
