// Node implementation of `zitejs/pdf`: renders HTML to PDF with headless Chromium and stores it in UPLOAD_DIR.
import path from 'node:path';
import { existsSync } from 'node:fs';

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? './uploads');

/** CHROMIUM_PATH wins; otherwise the first installed Chrome/Chromium among the usual Ubuntu locations. */
const CANDIDATES = ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
export function chromePath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const found = CANDIDATES.find((p) => existsSync(p));
  if (!found) throw new Error(`Chrome/Chromium not found. Install it or set CHROMIUM_PATH (checked: ${CANDIDATES.join(', ')})`);
  return found;
}

export const ZitePdf = {
  async renderHtml({ html, filename = 'document.pdf' }: { html: string; filename?: string }) {
    const puppeteer = await import('puppeteer-core');
    const browser = await puppeteer.launch({
      executablePath: chromePath(),
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const buf = await page.pdf({ printBackground: true, preferCSSPageSize: true, format: 'A4' });
      // Stored behind the authenticated download route; the requesting user is recorded as owner.
      const { saveFile, FILE_PREFIX } = await import('../files');
      const { requestCtx } = await import('../bootstrap');
      const { authenticate } = await import('../../../apps/app/src/lib/server');
      const token = requestCtx.getStore()?.token;
      const owner = token ? await authenticate(token).then((a) => a.profile.id).catch(() => null) : null;
      const key = await saveFile(Buffer.from(buf), filename.replace(/[^\w.-]/g, '_'), owner, 'application/pdf');
      return { url: FILE_PREFIX + key, filename };
    } finally {
      await browser.close();
    }
  },
};
