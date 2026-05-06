import dns from 'node:dns/promises';
import net from 'node:net';

export function normalizeUrl(raw: string): URL {
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

export async function assertFetchablePublicUrl(candidate: URL): Promise<URL> {
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
