import type { Browser, BrowserContext } from 'playwright';

import { assertFetchablePublicUrl, normalizeUrl } from './link-preview-url';

const MAX_BODY_CHARS = 1_500_000;

function navTimeoutMs(): number {
  const raw = Number(process.env.LINK_PREVIEW_PLAYWRIGHT_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 3000 && raw <= 120_000) return raw;
  return 28_000;
}

function settleMs(): number {
  const raw = Number(process.env.LINK_PREVIEW_PLAYWRIGHT_SETTLE_MS);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 15_000) return raw;
  return 1800;
}

/** 0 = отключить; иначе макс. «глубина» скролла (px) для lazy‑картинок. */
function lazyScrollCapPx(): number {
  const raw = process.env.LINK_PREVIEW_PLAYWRIGHT_SCROLL_PX?.trim();
  if (raw === '0' || raw === 'false' || raw === 'off') return 0;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0 && n <= 24_000) return n;
  return 8000;
}

let browserPromise: Promise<Browser> | null = null;

function forgetSharedBrowser(): void {
  browserPromise = null;
}

function playwrightClosedError(message: string): boolean {
  return /has been closed|has been disconnected|browser has been closed|Target page.*closed/i.test(
    message,
  );
}

async function sharedBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      if (existing.isConnected()) return existing;
    } catch {
      /* прошлый launch упал */
    }
    forgetSharedBrowser();
  }

  const { chromium } = await import('playwright');
  browserPromise = chromium
    .launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    .then((b) => {
      b.on('disconnected', () => {
        forgetSharedBrowser();
      });
      return b;
    })
    .catch((err) => {
      forgetSharedBrowser();
      throw err;
    });

  return browserPromise;
}

/**
 * После переходов по страницам (редиректы) финальный URL заново проверяется против SSRF.
 */
export async function fetchHtmlViaPlaywright(rawUrl: string): Promise<{
  html: string;
  finalUrl: URL;
  visibleText: string;
}> {
  let url = normalizeUrl(rawUrl);
  url = await assertFetchablePublicUrl(url);

  const timeout = navTimeoutMs();

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    let context: BrowserContext | null = null;
    try {
      const browser = await sharedBrowser();
      context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        locale: 'en-US',
      });

      const page = await context.newPage();
      await page.goto(url.href, {
        timeout,
        /** `load` чаще успевает получить полноценный SSR/гидрацию, чем `domcontentloaded`. */
        waitUntil: 'load',
      });

      const settle = settleMs();
      if (settle > 0) {
        await new Promise((resolve) => setTimeout(resolve, settle));
      }

      const scrollCap = lazyScrollCapPx();
      if (scrollCap > 0) {
        try {
          await page.evaluate(async (maxScroll) => {
            const sleep = (ms: number) =>
              new Promise<void>((resolve) => {
                window.setTimeout(resolve, ms);
              });
            const h =
              typeof document.body?.scrollHeight === 'number'
                ? document.body.scrollHeight
                : maxScroll;
            const target = Math.min(h, maxScroll);
            let y = 0;
            while (y < target - 40) {
              window.scrollBy(0, Math.min(520, target - y));
              y += 520;
              await sleep(95);
            }
            window.scrollTo(0, 0);
            await sleep(120);
          }, scrollCap);
        } catch {
          /* скролл не критичен */
        }
      }

      const href = page.url();
      if (!/^https?:\/\//i.test(href)) {
        throw new Error('Страница завершилась не HTTP(S)-адресом');
      }

      const finalUrl = new URL(href);
      await assertFetchablePublicUrl(finalUrl);

      const visibleTextRaw = await page.evaluate(() => {
        const body = document.body;
        if (!body) return '';
        return body.innerText?.replace(/\s+/g, ' ').trim() ?? '';
      });

      let html = await page.content();
      if (html.length > MAX_BODY_CHARS) {
        html = html.slice(0, MAX_BODY_CHARS);
      }

      const visibleText =
        visibleTextRaw.length <= 120_000
          ? visibleTextRaw
          : visibleTextRaw.slice(0, 120_000);

      return { html, finalUrl, visibleText };
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === 0 && playwrightClosedError(msg)) {
        forgetSharedBrowser();
        continue;
      }
      throw err;
    } finally {
      if (context) {
        await context.close().catch(() => {});
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Не удалось открыть страницу в браузере');
}
