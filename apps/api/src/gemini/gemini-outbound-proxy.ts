import { ProxyAgent, fetch as undiciFetch } from 'undici';

/** Явная переменная (предпочтительно только для Gemini, не затрагивая другие исходящие запросы) */
export function geminiOutboundProxyUrl(): string | undefined {
  const geminiOnly = process.env.GEMINI_HTTP_PROXY?.trim();
  if (geminiOnly) return geminiOnly;
  /** Стандартные имена подходящих прокси; применимы только когда вызываем runGeminiThroughOptionalProxy */
  return (
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim() ||
    undefined
  );
}

function buildProxyFetch(agent: ProxyAgent): typeof globalThis.fetch {
  return (async (
    input: Parameters<typeof globalThis.fetch>[0],
    init?: RequestInit,
  ): Promise<Response> =>
    undiciFetch(input as Parameters<typeof undiciFetch>[0], {
      ...(init as Parameters<typeof undiciFetch>[1]),
      dispatcher: agent,
    }) as unknown as Promise<Response>) as unknown as typeof globalThis.fetch;
}

/** Исходящий HTTP(S)-прокси (CONNECT), например VPS в регионе, где Gemini API разрешён. */
let memoAgent: ProxyAgent | undefined;

function getMemoAgent(proxyUrl: string): ProxyAgent {
  if (!memoAgent) memoAgent = new ProxyAgent(proxyUrl);
  return memoAgent;
}

/**
 * Последовательно выполняет колбэк с подменой `globalThis.fetch` на версию через прокси.
 * Так обходит региональную блокировку API без патча `@google/generative-ai`.
 *
 * Если `GEMINI_HTTP_PROXY` / `HTTPS_PROXY` / `HTTP_PROXY` не заданы — просто вызывает `fn()`.
 *
 * ⚠️ Параллельные два вызова к Gemini упорядочиваются очередью, чтобы две подмены fetch не пересекались.
 */
let geminiOutboundChain: Promise<unknown> = Promise.resolve();

export function runGeminiThroughOptionalProxy<T>(
  fn: () => Promise<T>,
): Promise<T> {
  const proxyUrl = geminiOutboundProxyUrl();
  if (!proxyUrl) {
    return fn();
  }

  const proxyFetch = buildProxyFetch(getMemoAgent(proxyUrl));

  const deferred = geminiOutboundChain.then(async () => {
    const prevFetch = globalThis.fetch;
    globalThis.fetch = proxyFetch;
    try {
      return await fn();
    } finally {
      globalThis.fetch = prevFetch;
    }
  }) as Promise<T>;

  geminiOutboundChain = deferred.then(
    () => undefined,
    () => undefined,
  );
  return deferred;
}
