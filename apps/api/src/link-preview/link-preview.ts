import dns from 'node:dns/promises';
import net from 'node:net';

import * as cheerio from 'cheerio';

const MAX_BODY_CHARS = 1_500_000;
const FETCH_TIMEOUT_MS = 12_000;

function normalizeUrl(raw: string): URL {
  const trimmed = raw.trim();
  try {
    return new URL(trimmed);
  } catch {
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      throw new Error('Некорректная ссылка');
    }
  }
}

function isBlockedIpv4(hostname: string): boolean {
  if (!net.isIPv4(hostname)) return false;
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part)))
    return true;
  const [a, b] = parts;
  if (a === 127 || a === 10) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isBlockedIpv6(hostname: string): boolean {
  if (!net.isIPv6(hostname)) return false;
  const lower = hostname.toLowerCase();
  if (lower === '::1') return true;
  if (lower.startsWith('fe80:')) return true;
  const first = lower.split(':')[0];
  const prefix = /^fc|^fd/i;
  return prefix.test(first);
}

function isBlockedResolvedAddress(address: string): boolean {
  if (net.isIPv4(address)) return isBlockedIpv4(address);
  if (!net.isIPv6(address)) return true;
  const lower = address.toLowerCase();
  if (lower.startsWith('::ffff:')) {
    const tail = lower.slice(8);
    if (net.isIPv4(tail)) return isBlockedIpv4(tail);
  }
  return isBlockedIpv6(address);
}

async function assertFetchablePublicUrl(candidate: URL): Promise<URL> {
  if (candidate.username || candidate.password) {
    throw new Error('Ссылки с авторизацией недопустимы');
  }
  if (candidate.protocol !== 'http:' && candidate.protocol !== 'https:') {
    throw new Error('Разрешены только http/https');
  }

  const host = candidate.hostname.replace(/^\[|\]$/g, '');
  const lowerHost = candidate.hostname.toLowerCase();

  if (lowerHost === 'localhost' || lowerHost.endsWith('.localhost')) {
    throw new Error('Локальные адреса недопустимы');
  }

  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    if (isBlockedIpv4(host)) throw new Error('Приватные адреса недопустимы');
    return candidate;
  }
  if (ipVersion === 6) {
    if (lowerHost.startsWith('::ffff:') && net.isIPv4(lowerHost.slice(8))) {
      if (isBlockedIpv4(lowerHost.slice(8))) {
        throw new Error('Приватные адреса недопустимы');
      }
      return candidate;
    }
    if (isBlockedIpv6(host)) throw new Error('Приватные адреса недопустимы');
    return candidate;
  }

  try {
    const lookups = await dns.lookup(host, { all: true });
    if (lookups.some(({ address }) => isBlockedResolvedAddress(address))) {
      throw new Error('Приватный адрес в DNS недопустим');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Приватный')) {
      throw error;
    }
    throw new Error('Не удалось проверить хост ссылки');
  }

  return candidate;
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

function uniqStrings(items: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

export type LinkPreviewResult = {
  canonicalUrl: string;
  title: string;
  description: string;
  siteName: string;
  images: string[];
};

export async function fetchLinkPreview(
  rawUrl: string,
): Promise<LinkPreviewResult> {
  let url = normalizeUrl(rawUrl);
  url = await assertFetchablePublicUrl(url);

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
          'Mozilla/5.0 (compatible; LinkVoyagePreview/1.0; +https://link-voyage.local)',
        Accept: 'text/html,application/xhtml+xml',
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
  const base = finalUrl.href;

  const $ = cheerio.load(rawText);

  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('meta[name="twitter:title"]').attr('content')?.trim() ||
    $('title').first().text().trim() ||
    finalUrl.hostname;

  const siteName =
    $('meta[property="og:site_name"]').attr('content')?.trim() || '';

  const description =
    $('meta[property="og:description"]').attr('content')?.trim() ||
    $('meta[name="twitter:description"]').attr('content')?.trim() ||
    $('meta[name="description"]').attr('content')?.trim() ||
    '';

  const imageCandidates: string[] = [];
  $('meta[property="og:image"]').each((_, el) => {
    const content = $(el).attr('content');
    const resolved = resolveHref(base, content);
    if (resolved) imageCandidates.push(resolved);
  });
  $('meta[name="twitter:image"]').each((_, el) => {
    const content = $(el).attr('content');
    const resolved = resolveHref(base, content);
    if (resolved) imageCandidates.push(resolved);
  });
  $('meta[name="twitter:image:src"]').each((_, el) => {
    const content = $(el).attr('content');
    const resolved = resolveHref(base, content);
    if (resolved) imageCandidates.push(resolved);
  });

  const images = uniqStrings(imageCandidates, 8);

  return {
    canonicalUrl: base,
    title: title.slice(0, 500),
    description: description.slice(0, 8000),
    siteName: siteName.slice(0, 120),
    images,
  };
}
