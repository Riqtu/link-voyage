import * as cheerio from 'cheerio';

import {
  extractLinkPreviewFromHtml,
  type LinkPreviewResult,
} from './link-preview';

/** Согласовано с link-preview.ts MAX_BODY_CHARS */
export const MAX_PASTED_LISTING_HTML_CHARS = 1_500_000;

/** Минимум символов HTML при вставке из DevTools (карточка / галерея). */
export const MIN_PASTED_LISTING_HTML_CHARS = 200;

/** Если URL страницы не указан — условный origin для относительных src (Trip-сайты и др.) */
export const PASTED_HTML_FALLBACK_BASE_HREF = 'https://www.trip.com/';

function normalizeVisibleText(raw: string): string {
  return raw
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Разбор HTML, вставленного из DevTools (фрагмент или целая страница): убираем интерактив,
 * тянем видимый текст и те же meta/JSON-LD/img, что и для обычного превью.
 *
 * @param pageUrlForRelativeResolve — URL вкладки (для `src`/`og:url` относительных путей); иначе trip.com по умолчанию
 */
export function linkPreviewFromPastedListingHtml(
  rawHtml: string,
  pageUrlForRelativeResolve?: string | null,
): LinkPreviewResult {
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
    pageUrlForRelativeResolve?.trim() || PASTED_HTML_FALLBACK_BASE_HREF
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
      'Укажите полный URL страницы объявления — нужен для относительных ссылок на картинки',
    );
  }

  const $forText = cheerio.load(trimmed);
  $forText('script, style, noscript, iframe, template, svg').remove();
  const visibleText = normalizeVisibleText($forText.root().text()).slice(
    0,
    80_000,
  );

  const preview = extractLinkPreviewFromHtml(
    trimmed,
    validatedBase,
    visibleText.length >= 120 ? visibleText : undefined,
  );

  const withSource: LinkPreviewResult = {
    ...preview,
    sourceRequestUrl:
      pageUrlForRelativeResolve?.trim() || preview.sourceRequestUrl,
  };

  const desc = withSource.description.trim();
  if (desc.length < 120 && visibleText.length >= 200) {
    return {
      ...withSource,
      description: visibleText.slice(0, 8000),
    };
  }

  return withSource;
}
