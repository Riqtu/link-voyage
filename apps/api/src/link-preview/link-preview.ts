import * as cheerio from 'cheerio';

import { assertFetchablePublicUrl, normalizeUrl } from './link-preview-url';

const MAX_BODY_CHARS = 1_500_000;
const FETCH_TIMEOUT_MS = 12_000;

/** Пул изображений с превью страницы (Gemini режет до лимита карточки ACCOMMODATION_PREVIEW_IMAGES_MAX). */
export const LINK_PREVIEW_IMAGE_URL_POOL_MAX = 52;

export type LinkPreviewResult = {
  canonicalUrl: string;
  title: string;
  description: string;
  siteName: string;
  images: string[];
  /** Удобства из schema.org JSON-LD (amenityFeature и т.п.), без галлюцинаций. */
  structuredAmenities?: string[];
  /**
   * URL после SSRF-проверки, как его вставил пользователь (до редиректов).
   * Нужен для Trip/Ctrip: canonical может стать `/passport/...`, хотя запрос был на `/hotels/detail`.
   */
  sourceRequestUrl?: string;
};

function withSourceRequest(
  preview: LinkPreviewResult,
  sourceHref: string,
): LinkPreviewResult {
  return { ...preview, sourceRequestUrl: sourceHref };
}

/** Если превью похоже на вход или поставщику — ошибка пользователю (публичный URL карточки). */
export const LINK_PREVIEW_EXPECT_PUBLIC_LISTING_MESSAGE =
  'Страница похожа на вход или панель партнёра, а не публичную карточку жилья. Откройте в браузере обычную страницу отеля или объекта (как её видят гости) и вставьте именно её адрес.';

/** auto = http‑запрос, при слабом превью — Playwright; force = только Playwright */
type PlaywrightMode = 'off' | 'auto' | 'force';

function parsePlaywrightMode(): PlaywrightMode {
  const v = process.env.LINK_PREVIEW_PLAYWRIGHT?.trim().toLowerCase();
  if (!v || v === '0' || v === 'false' || v === 'off') return 'off';
  if (v === 'force' || v === 'always') return 'force';
  return 'auto';
}

function isWeakPreview(preview: LinkPreviewResult): boolean {
  return preview.description.trim().length < 140 || preview.images.length === 0;
}

const LOGIN_OR_PORTAL_PATH_RE =
  /\/(login|signin|sign-in|sign_up|signup|oauth|openid|authorize|sso|session|accounts(?:\/|$)|account\/login|auth\/|merchant|supplier|partner(?:\/|$)|hoteliers|hotelier|hotelplatform|supply|backstage|extranet|ecrm|management|backend|passport)(\/|$)/i;

/**
 * URL после редиректов ведёт в зону входа / кабинета поставщика.
 * Только pathname: в query (например trip.com `hoteluniquekey=...` в base64) бывают случайные `/sso`, `/session` и т.п.
 */
function urlPathLikelyLoginOrPartnerPortal(canonicalHref: string): boolean {
  try {
    const u = new URL(canonicalHref);
    return LOGIN_OR_PORTAL_PATH_RE.test(u.pathname.toLowerCase());
  } catch {
    return false;
  }
}

/** Поддомены Trip/CTrip, где живёт партнёрка/CRM, не гостевые карточки отелей. */
const TRIP_FAMILY_SUPPLIER_SUBDOMAINS = new Set([
  'hoteliers',
  'supplier',
  'suppliers',
  'partners',
  'merchant',
  'merchants',
  'ebooking',
  'crm',
  'extranet',
  'hotelplatform',
  'passport',
]);

function looksLikeTripOrCtripHostname(href: string): boolean {
  try {
    const host = new URL(href).hostname.replace(/^www\./i, '').toLowerCase();
    return (
      host === 'trip.com' ||
      host.endsWith('.trip.com') ||
      host === 'ctrip.com' ||
      host.endsWith('.ctrip.com')
    );
  } catch {
    return false;
  }
}

function linkPreviewNonPublicError(preview: LinkPreviewResult): Error {
  let message = LINK_PREVIEW_EXPECT_PUBLIC_LISTING_MESSAGE;
  if (
    looksLikeTripOrCtripHostname(preview.sourceRequestUrl ?? '') ||
    looksLikeTripOrCtripHostname(preview.canonicalUrl)
  ) {
    message +=
      ' У Trip.com/Ctrip без гостевых cookies часто открывается вход (например passport), а не текст карточки: приватное окно, другая локаль сайта или копирование URL пока в строке ещё страница отеля, а не логин.';
  }
  return new Error(message);
}

/**
 * Гостевая страница отеля/объекта на trip.com или ctrip.com (не партнёрский портал).
 * На таких URL в мета/футере часто есть «войдите», «личный кабинет» — не считаем их страницей входа.
 */
function isLikelyTripFamilyGuestHotelListingUrl(
  canonicalHref: string,
): boolean {
  try {
    const u = new URL(canonicalHref);
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    const isTrip = host === 'trip.com' || host.endsWith('.trip.com');
    const isCtrip = host === 'ctrip.com' || host.endsWith('.ctrip.com');
    if (!isTrip && !isCtrip) return false;

    const tail = isTrip ? '.trip.com' : '.ctrip.com';
    if (host !== tail.slice(1) && host.endsWith(tail)) {
      const sub = host.slice(0, -tail.length);
      if (TRIP_FAMILY_SUPPLIER_SUBDOMAINS.has(sub)) return false;
    }

    const p = u.pathname;
    const q = u.search.toLowerCase();

    if (/\/hotels\b/i.test(p)) return true;
    if (/\/share\//i.test(p)) return true;
    // Короткие deeplink-слуги: www.trip.com/w/TOKEN, trip.com/zh-cn/w/TOKEN
    if (/(?:\/|^)[a-z]{2}(?:-[a-z]{2})?\/w\/[\w.-]{3,}\/?$/i.test(p))
      return true;
    if (/\/w\/[\w.-]{3,}\/?$/i.test(p)) return true;
    if (/\bhoteluniquekey=/.test(q)) return true;
    if (/\bhotelid=/.test(q) || /\bhotelcode=/.test(q) || /\bhotel_id=/.test(q))
      return true;
    if (/\/hotel\/[^/?#]+/i.test(p) && !/\/hoteliers?\b/i.test(p)) return true;

    return false;
  } catch {
    return false;
  }
}

/** Текст/заголовок как у типичной страницы входа, а не карточки объекта. */
function previewCopyLooksLikeAuthOrManagementShell(
  preview: LinkPreviewResult,
): boolean {
  const t = `${preview.title}\n${preview.siteName}\n${preview.description}`
    .slice(0, 12_000)
    .toLowerCase();

  const strongRuEn = [
    'страница входа',
    'страницу входа',
    'требуется авторизация',
    'управления бронированиями',
    'управление бронированиями',
    'личный кабинет',
    'вход в аккаунт',
    'войдите в аккаунт',
    'supplier login',
    'partner portal',
    'hotel management portal',
  ];

  if (strongRuEn.some((p) => t.includes(p))) return true;

  if (
    /\bauthorization required\b|\bmust (?:log|sign) in\b|\byou must be logged in\b/i.test(
      t,
    )
  )
    return true;

  if (
    /\bsign in to your account\b|\blog in to your account\b|\bportal login\b/i.test(
      t,
    )
  )
    return true;

  let weak = 0;
  const weakPieces = [
    'sign in',
    'log in',
    'login page',
    'авторизац',
    'authenticate',
  ];
  for (const p of weakPieces) if (t.includes(p)) weak += 1;
  const management =
    /\b(manager|merchant|supplier|partner)\b.*\b(login|sign in)\b|\b(login|sign in)\b.*\b(manager|merchant|supplier)\b/i.test(
      t,
    );
  /** Иначе в query (Trip `hoteluniquekey`) ловится фрагмент `login` как «слово». */
  let loginInCanonicalPath = false;
  try {
    loginInCanonicalPath = /\b(login|signin)\b/i.test(
      new URL(preview.canonicalUrl).pathname,
    );
  } catch {
    /* ignore */
  }
  if ((weak >= 2 && loginInCanonicalPath) || management) return true;

  return false;
}

/** Редирект на SSO не отменяет гостевой URL, который пользователь действительно вставил. */
function userPasteLooksLikeTripFamilyGuestHotel(
  preview: LinkPreviewResult,
): boolean {
  if (!preview.sourceRequestUrl?.trim()) return false;
  return isLikelyTripFamilyGuestHotelListingUrl(
    preview.sourceRequestUrl.trim(),
  );
}

/** Playwright мог уехать на логин/CRM; слиять с основным текстом опасно. */
export function isLikelyNonPublicListingPreview(
  preview: LinkPreviewResult,
): boolean {
  if (userPasteLooksLikeTripFamilyGuestHotel(preview)) return false;

  if (urlPathLikelyLoginOrPartnerPortal(preview.canonicalUrl)) return true;

  if (isLikelyTripFamilyGuestHotelListingUrl(preview.canonicalUrl))
    return false;

  return previewCopyLooksLikeAuthOrManagementShell(preview);
}

function assertLikelyPublicListingPreview(
  result: LinkPreviewResult,
): LinkPreviewResult {
  if (!isLikelyNonPublicListingPreview(result)) return result;
  throw linkPreviewNonPublicError(result);
}

function looksLikeGenericHostnameTitle(
  title: string,
  canonicalUrl: string,
): boolean {
  const t = title.trim();
  if (t.length < 4) return true;
  try {
    const host = new URL(canonicalUrl).hostname.replace(/^www\./i, '');
    return (
      t.replace(/^www\./i, '') === host ||
      t.toLowerCase() === host.toLowerCase()
    );
  } catch {
    return false;
  }
}

/**
 * После Playwright HTTP часто даёт длинный текст без og:image, а браузер — картинки с «пустым» SPA.
 * Нельзя выбирать один вариант по score: объединяем изображения и берём лучшее описание.
 */
function mergeHttpAndBrowserPreviews(
  http: LinkPreviewResult,
  browser: LinkPreviewResult,
): LinkPreviewResult {
  const browserBad = isLikelyNonPublicListingPreview(browser);
  const httpBad = isLikelyNonPublicListingPreview(http);
  if (browserBad && httpBad) throw linkPreviewNonPublicError(browser);
  if (browserBad && !httpBad) return http;
  if (httpBad && !browserBad) return browser;

  const hDesc = http.description.trim();
  const bDesc = browser.description.trim();

  let description: string;
  if (bDesc.length > hDesc.length + 40) {
    description = browser.description;
  } else if (hDesc.length > bDesc.length + 40) {
    description = http.description;
  } else if (hDesc.length >= 160 && bDesc.length >= 160) {
    description =
      hDesc.length >= bDesc.length ? http.description : browser.description;
  } else if (bDesc.length >= 140) {
    description = browser.description;
  } else if (hDesc.length >= 140) {
    description = http.description;
  } else {
    description =
      `${http.description}${hDesc && bDesc ? '\n\n' : ''}${browser.description}`.trim();
  }

  const httpTitleOk = !looksLikeGenericHostnameTitle(
    http.title,
    http.canonicalUrl,
  );
  const browserTitleOk = !looksLikeGenericHostnameTitle(
    browser.title,
    browser.canonicalUrl,
  );
  let title = http.title;
  if (
    browserTitleOk &&
    (!httpTitleOk || browser.title.trim().length > http.title.trim().length + 6)
  ) {
    title = browser.title;
  } else if (httpTitleOk) {
    title = http.title;
  } else {
    title =
      browser.title.trim().length >= http.title.trim().length
        ? browser.title
        : http.title;
  }

  const siteName = (http.siteName.trim() || browser.siteName.trim()).slice(
    0,
    120,
  );

  const images = rankAndDedupeGalleryUrls([...browser.images, ...http.images]);

  const structuredAmenities = dedupeStructuredLabels(
    [
      ...(http.structuredAmenities ?? []),
      ...(browser.structuredAmenities ?? []),
    ],
    30,
  );

  return {
    canonicalUrl: browser.canonicalUrl || http.canonicalUrl,
    title: title.slice(0, 500),
    description: description.slice(0, 8000),
    siteName,
    images,
    structuredAmenities:
      structuredAmenities.length > 0 ? structuredAmenities : undefined,
    sourceRequestUrl: http.sourceRequestUrl ?? browser.sourceRequestUrl,
  };
}

function resolveHref(
  base: string | URL,
  maybeRelative?: string,
): string | null {
  if (!maybeRelative?.trim()) return null;
  try {
    const resolved = new URL(maybeRelative.trim(), base);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:')
      return null;
    return resolved.href;
  } catch {
    return null;
  }
}

function looksLikeNoiseImageUrl(href: string): boolean {
  try {
    const u = new URL(href);
    const combined = `${u.hostname}${u.pathname}`.toLowerCase();
    if (combined.includes('favicon')) return true;
    if (combined.includes('gravatar.com')) return true;
    if (u.pathname.toLowerCase().endsWith('.ico')) return true;
    if (/spacer|blank|1x1|telemetry|facebook\.com\/tr/i.test(combined))
      return true;
    if (/\/analytics\//i.test(u.pathname)) return true;
    return false;
  } catch {
    return true;
  }
}

/** UI‑иконки, бейджи и мелкий декор — не фото объявления. */
function isLikelyUiIconUrl(href: string): boolean {
  try {
    const u = new URL(href);
    const l = `${u.href}`.toLowerCase();
    if (l.endsWith('.svg')) return true;
    if (
      /[._-]icon\b|\/icons?\/|\bicons\/|sprite|badge|emoji|\/pin[s]?\//i.test(l)
    )
      return true;
    if (
      /\b(16|20|24|32|36|40|48|52|56|60|64|72)x(16|20|24|32|36|40|48|52|56|60|64|72|96)\b/i.test(
        l,
      )
    )
      return true;
    if (
      /logo|brand-mark|avatar|profile_photo|\/host\/|marker|map-pin|stars?\b|trust|verification|verified/i.test(
        l,
      ) &&
      !/\/pictures\/|\/photos\/|gallery|carousel|listing|property|upload/i.test(
        l,
      )
    )
      return true;
    if (/amenit|facility[_-]?icon|ui-icons|material-symbols/i.test(l))
      return true;
    if (looksLikeFooterPartnerOrAwardGraphicUrl(l)) return true;
    return false;
  } catch {
    return true;
  }
}

/** Награды, соцсети, партнёрские и футерные логотипы (часто попадают в DOM). */
function looksLikeFooterPartnerOrAwardGraphicUrl(hrefLower: string): boolean {
  return (
    /tripadvisor|trustpilot|ifdesign|gooddesign|reddotaward|award[-_/]?\d|\/award\/|partner[-_]logo|footer[-_]logo|social[-_]icon|img\.vk\.|\/vk-|vk\.com\/|trusted[-_]by|verification[-_]badge/i.test(
      hrefLower,
    ) || /\bgoog[_-]?logo|google\s*partner\b/i.test(hrefLower)
  );
}

function shouldDropGalleryCandidateUrl(href: string): boolean {
  return looksLikeNoiseImageUrl(href) || isLikelyUiIconUrl(href);
}

/** Выше — больше похоже на фото галереи, не на иконку. */
function photoGalleryScore(href: string): number {
  let s = 0;
  const l = href.toLowerCase();
  if (shouldDropGalleryCandidateUrl(href)) return -999;
  if (/\.(jpe?g|webp|avif)(\?|$)/.test(pathnameOfUrl(href))) s += 28;
  if (/\.png(\?|$)/.test(pathnameOfUrl(href))) s += 10;
  if (
    /im\/pictures|\/photos?\/|listing[_-]?photo|gallery|carousel|slideshow|hero|thumbor|cloudinary|imgix|picsum|upload|property|\/rooms?\/|accommodation/i.test(
      l,
    )
  )
    s += 42;
  if (/\bw[_=]?([0-9]{3,})\b|[/_-]\d{3,5}x\d{3,5}([_-]|\.)/i.test(l)) s += 22;
  if (/optimized|medium|large|original|fullscreen/i.test(l)) s += 8;
  if (/nano|sprite|sprite-sheet|microthumb|nanoimg/i.test(l)) s -= 45;
  return s;
}

function pathnameOfUrl(href: string): string {
  try {
    return new URL(href).pathname.toLowerCase();
  } catch {
    return '';
  }
}

function finalizeGalleryImageUrls(
  meta: string[],
  ld: string[],
  dom: string[],
): string[] {
  const metaOk = meta.filter((u) => !shouldDropGalleryCandidateUrl(u));
  const ldOk = [
    ...new Set(ld.filter((u) => !shouldDropGalleryCandidateUrl(u))),
  ].sort((a, b) => photoGalleryScore(b) - photoGalleryScore(a));
  const domOk = [
    ...new Set(dom.filter((u) => !shouldDropGalleryCandidateUrl(u))),
  ].sort((a, b) => photoGalleryScore(b) - photoGalleryScore(a));
  const ordered = [...metaOk, ...ldOk, ...domOk];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of ordered) {
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= LINK_PREVIEW_IMAGE_URL_POOL_MAX) break;
  }
  return out;
}

/** Объединённые списки HTTP+Playwright без разделения meta/LD/dom. */
function rankAndDedupeGalleryUrls(urls: string[]): string[] {
  const ok = urls.filter((u) => !shouldDropGalleryCandidateUrl(u));
  const sorted = [...new Set(ok)].sort(
    (a, b) => photoGalleryScore(b) - photoGalleryScore(a),
  );
  return sorted.slice(0, LINK_PREVIEW_IMAGE_URL_POOL_MAX);
}

function dedupeStructuredLabels(labels: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels) {
    const t = raw.trim().slice(0, 64);
    if (t.length < 2 || t.length > 60) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function extractAmenityFeatureList(
  raw: unknown,
  out: string[],
  depth: number,
): void {
  if (depth > 22 || out.length > 48) return;
  if (!raw) return;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (t.length >= 2 && t.length <= 64 && !/^https?:/i.test(t)) out.push(t);
    return;
  }
  if (Array.isArray(raw)) {
    for (const x of raw) extractAmenityFeatureList(x, out, depth + 1);
    return;
  }
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (typeof o.name === 'string') {
      const name = o.name.trim().slice(0, 52);
      if (name.length >= 2) {
        const val = o.value;
        if (
          val === true ||
          val === 'true' ||
          val === 'yes' ||
          val === undefined ||
          val === null
        )
          out.push(name);
        else if (typeof val === 'string' && val.trim().length <= 40) {
          const vs = val.trim();
          if (!/^https?:/i.test(vs)) out.push(`${name}: ${vs}`.slice(0, 64));
        }
      }
    }
    for (const k of ['itemListElement', 'element', 'includesObject']) {
      if (o[k] !== undefined) extractAmenityFeatureList(o[k], out, depth + 1);
    }
    if (typeof o.item === 'string') {
      const atType = o['@type'];
      const typeStr =
        typeof atType === 'string'
          ? atType
          : typeof atType === 'number' || typeof atType === 'boolean'
            ? String(atType)
            : '';
      if (typeStr.toLowerCase().includes('listitem')) {
        const it = o.item.trim();
        if (it.length >= 2 && it.length <= 64) out.push(it);
      }
    }
  }
}

function extractAdditionalPropertiesLd(
  raw: unknown,
  out: string[],
  depth: number,
): void {
  if (depth > 22 || out.length > 48) return;
  if (!raw) return;
  if (Array.isArray(raw)) {
    for (const x of raw) extractAdditionalPropertiesLd(x, out, depth + 1);
    return;
  }
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (typeof o.name === 'string' && typeof o.value === 'string') {
      const n = o.name.trim();
      const v = o.value.trim();
      if (
        n.length >= 2 &&
        n.length <= 48 &&
        v.length <= 36 &&
        !/^https?:/i.test(v)
      )
        out.push(`${n}: ${v}`.slice(0, 64));
    }
  }
}

function visitLdGraphForAmenities(
  node: unknown,
  out: string[],
  depth: number,
): void {
  if (depth > 26 || out.length > 56) return;
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const x of node) visitLdGraphForAmenities(x, out, depth + 1);
    return;
  }
  const o = node as Record<string, unknown>;
  if (o.amenityFeature !== undefined) {
    extractAmenityFeatureList(o.amenityFeature, out, depth + 1);
  }
  if (Array.isArray(o.amenities)) {
    extractAmenityFeatureList(o.amenities, out, depth + 1);
  }
  if (o.additionalProperty !== undefined) {
    extractAdditionalPropertiesLd(o.additionalProperty, out, depth + 1);
  }
  if (Array.isArray(o['@graph'])) {
    visitLdGraphForAmenities(o['@graph'], out, depth + 1);
  }
  if (o.mainEntity !== undefined) {
    visitLdGraphForAmenities(o.mainEntity, out, depth + 1);
  }
  if (o.containsPlace !== undefined) {
    visitLdGraphForAmenities(o.containsPlace, out, depth + 1);
  }
}

function collectJsonLdStructuredAmenities($: cheerio.CheerioAPI): string[] {
  const raw: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).contents().text()?.trim();
    if (!text) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return;
    }
    visitLdGraphForAmenities(parsed, raw, 0);
  });
  return dedupeStructuredLabels(raw, 30);
}

/** Первый кандидат из `srcset` (до пробела‑множителя). */
function firstCandidateFromSrcset(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const chunk = raw.split(',')[0]?.trim();
  const urlPart = chunk?.split(/\s+/)[0]?.trim();
  return urlPart || null;
}

function extractImageUrlsFromLdField(
  raw: unknown,
  out: string[],
  depth: number,
): void {
  if (depth > 24 || out.length > 64) return;
  if (!raw || raw === null) return;
  if (typeof raw === 'string') {
    if (/^https?:\/\//i.test(raw.trim())) out.push(raw.trim());
    return;
  }
  if (Array.isArray(raw)) {
    for (const item of raw) extractImageUrlsFromLdField(item, out, depth + 1);
    return;
  }
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (typeof o.url === 'string') out.push(o.url.trim());
    if (typeof o.contentUrl === 'string') out.push(o.contentUrl.trim());
    if (o.image !== undefined)
      extractImageUrlsFromLdField(o.image, out, depth + 1);
  }
}

function collectJsonLdImageCandidates(
  $: cheerio.CheerioAPI,
  base: string,
): string[] {
  const raw: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).contents().text()?.trim();
    if (!text) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return;
    }
    const visit = (node: unknown, depth: number): void => {
      if (depth > 30) return;
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const item of node) visit(item, depth + 1);
        return;
      }
      const o = node as Record<string, unknown>;
      if (o.image !== undefined) extractImageUrlsFromLdField(o.image, raw, 0);
      for (const v of Object.values(o)) {
        if (v && typeof v === 'object') visit(v, depth + 1);
      }
    };
    visit(parsed, 0);
  });
  const resolved: string[] = [];
  for (const u of raw) {
    const href = resolveHref(base, u);
    if (href && !shouldDropGalleryCandidateUrl(href)) resolved.push(href);
  }
  return resolved;
}

function parseImgDimension(raw: string | undefined): number | undefined {
  if (!raw?.trim()) return undefined;
  const n = Number.parseInt(raw.replace(/px$/i, '').trim(), 10);
  return Number.isFinite(n) ? n : undefined;
}

function collectDomImageCandidates(
  $: cheerio.CheerioAPI,
  base: string,
): string[] {
  const found: string[] = [];

  const pushResolved = (raw: string | null | undefined) => {
    const href = resolveHref(base, raw ?? undefined);
    if (href && !shouldDropGalleryCandidateUrl(href)) found.push(href);
  };

  $('link[rel="image_src"]').each((_, el) => {
    pushResolved($(el).attr('href'));
  });

  $('img').each((_, el) => {
    const $el = $(el);
    const cls = $el.attr('class') ?? '';
    if (/\bicon|sprite|badge|avatar|emoji|logo-mark|symbol\b/i.test(cls))
      return;
    const alt = ($el.attr('alt') ?? '').trim().toLowerCase();
    if (
      alt.length > 0 &&
      alt.length <= 32 &&
      /\b(icon|logo|symbol|badge)\b/.test(alt)
    )
      return;
    const w = parseImgDimension($el.attr('width'));
    const h = parseImgDimension($el.attr('height'));
    if (w !== undefined && h !== undefined && w <= 96 && h <= 96) return;

    const fromSrc =
      $el.attr('src') ||
      $el.attr('data-src') ||
      $el.attr('data-lazy-src') ||
      $el.attr('data-original') ||
      $el.attr('data-url');
    pushResolved(fromSrc);
    pushResolved(firstCandidateFromSrcset($el.attr('srcset')));
    pushResolved(firstCandidateFromSrcset($el.attr('data-srcset')));
  });

  $('picture source[srcset]').each((_, el) => {
    pushResolved(firstCandidateFromSrcset($(el).attr('srcset')));
  });

  return found;
}

export function extractLinkPreviewFromHtml(
  rawHtml: string,
  finalHref: string,
  visibleText?: string,
): LinkPreviewResult {
  const base = finalHref;

  const $ = cheerio.load(rawHtml);

  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('meta[name="twitter:title"]').attr('content')?.trim() ||
    $('title').first().text().trim() ||
    new URL(base).hostname;

  const siteName =
    $('meta[property="og:site_name"]').attr('content')?.trim() || '';

  const metaDescription =
    $('meta[property="og:description"]').attr('content')?.trim() ||
    $('meta[name="twitter:description"]').attr('content')?.trim() ||
    $('meta[name="description"]').attr('content')?.trim() ||
    '';

  const vt = visibleText?.trim();
  let description = metaDescription;
  const metaLen = metaDescription.trim().length;
  if (vt && vt.length > 80) {
    if (metaLen < 140) {
      description = vt;
    } else if (vt.length > metaLen * 1.08) {
      description = `${metaDescription}\n\n${vt}`.trim();
    } else if (
      !metaDescription.includes(vt.slice(0, Math.min(72, vt.length)))
    ) {
      description = `${metaDescription}\n\n${vt}`.trim();
    }
  }

  const metaImages: string[] = [];
  $('meta[property="og:image"]').each((_, el) => {
    const resolved = resolveHref(base, $(el).attr('content'));
    if (resolved) metaImages.push(resolved);
  });
  $('meta[name="twitter:image"]').each((_, el) => {
    const resolved = resolveHref(base, $(el).attr('content'));
    if (resolved) metaImages.push(resolved);
  });
  $('meta[name="twitter:image:src"]').each((_, el) => {
    const resolved = resolveHref(base, $(el).attr('content'));
    if (resolved) metaImages.push(resolved);
  });

  const ldImages = collectJsonLdImageCandidates($, base);
  const domImages = collectDomImageCandidates($, base);
  const images = finalizeGalleryImageUrls(metaImages, ldImages, domImages);

  const structuredAmenitiesRaw = collectJsonLdStructuredAmenities($);
  const structuredAmenities =
    structuredAmenitiesRaw.length > 0 ? structuredAmenitiesRaw : undefined;

  return {
    canonicalUrl: base,
    title: title.slice(0, 500),
    description: description.slice(0, 8000),
    siteName: siteName.slice(0, 120),
    images,
    structuredAmenities,
  };
}

/** Плоский список URL + блок «индекс + подпись DOM» для зон через Gemini при вставке HTML галереи. */
export function galleryImageHintsForGeminiFromHtml(
  rawHtml: string,
  baseHref: string,
): { urls: string[]; numberedBlock: string } {
  const preview = extractLinkPreviewFromHtml(rawHtml, baseHref);
  const urls = preview.images;
  const $ = cheerio.load(rawHtml);
  const hintByUrl = new Map<string, string>();

  $('img').each((_, el) => {
    const $el = $(el);
    const cand = [
      $el.attr('src'),
      $el.attr('data-src'),
      $el.attr('data-lazy-src'),
      $el.attr('data-original'),
      firstCandidateFromSrcset($el.attr('srcset')),
      firstCandidateFromSrcset($el.attr('data-srcset')),
    ];
    const snippet = [
      ($el.attr('alt') ?? '').trim(),
      ($el.attr('aria-label') ?? '').trim(),
      ($el.attr('title') ?? '').trim(),
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 220);
    if (!snippet) return;
    for (const raw of cand) {
      const resolved = resolveHref(baseHref, raw ?? undefined);
      if (!resolved || !urls.includes(resolved)) continue;
      if (!hintByUrl.has(resolved)) hintByUrl.set(resolved, snippet);
      break;
    }
  });

  const lines = urls.map(
    (u, i) => `${i + 1}. ${u}\n   DOM_hints: ${hintByUrl.get(u) ?? '—'}`,
  );
  return { urls, numberedBlock: lines.join('\n\n') };
}

async function fetchLinkPreviewViaHttp(url: URL): Promise<LinkPreviewResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url.href, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'AbortError') {
      throw new Error('Таймаут загрузки страницы');
    }
    throw new Error('Не удалось загрузить страницу по ссылке');
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Страница ответила кодом ${response.status}`);
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_BODY_CHARS + 100_000) {
    throw new Error('Слишком большая страница');
  }

  const rawText = await response.text();
  if (rawText.length > MAX_BODY_CHARS) {
    throw new Error('Слишком большой HTML');
  }

  const finalUrl = new URL(response.url);
  await assertFetchablePublicUrl(finalUrl);

  return extractLinkPreviewFromHtml(rawText, finalUrl.href);
}

async function fetchLinkPreviewViaPlaywright(
  rawUrl: string,
): Promise<LinkPreviewResult> {
  const { fetchHtmlViaPlaywright } =
    await import('./link-preview-playwright.js');
  const { html, finalUrl, visibleText } = await fetchHtmlViaPlaywright(rawUrl);
  return extractLinkPreviewFromHtml(html, finalUrl.href, visibleText);
}

export async function fetchLinkPreview(
  rawUrl: string,
): Promise<LinkPreviewResult> {
  let url = normalizeUrl(rawUrl);
  url = await assertFetchablePublicUrl(url);
  const sourceHref = url.href;

  const mode = parsePlaywrightMode();

  if (mode === 'force') {
    return assertLikelyPublicListingPreview(
      withSourceRequest(
        await fetchLinkPreviewViaPlaywright(rawUrl),
        sourceHref,
      ),
    );
  }

  let httpPreview: LinkPreviewResult | undefined;
  let httpError: Error | undefined;
  try {
    httpPreview = await fetchLinkPreviewViaHttp(url);
  } catch (err) {
    httpError = err instanceof Error ? err : new Error(String(err));
  }

  if (mode === 'off') {
    if (httpPreview)
      return assertLikelyPublicListingPreview(
        withSourceRequest(httpPreview, sourceHref),
      );
    throw httpError ?? new Error('Не удалось загрузить превью');
  }

  const shouldTryBrowser =
    !httpPreview || (httpPreview && isWeakPreview(httpPreview));

  if (!shouldTryBrowser) {
    return assertLikelyPublicListingPreview(
      withSourceRequest(httpPreview!, sourceHref),
    );
  }

  try {
    const browserPreview = await fetchLinkPreviewViaPlaywright(rawUrl);
    if (!httpPreview)
      return assertLikelyPublicListingPreview(
        withSourceRequest(browserPreview, sourceHref),
      );

    const merged = mergeHttpAndBrowserPreviews(
      withSourceRequest(httpPreview, sourceHref),
      withSourceRequest(browserPreview, sourceHref),
    );
    return assertLikelyPublicListingPreview(
      withSourceRequest(merged, sourceHref),
    );
  } catch (browserErr) {
    if (httpPreview)
      return assertLikelyPublicListingPreview(
        withSourceRequest(httpPreview, sourceHref),
      );
    throw httpError ?? browserErr;
  }
}
