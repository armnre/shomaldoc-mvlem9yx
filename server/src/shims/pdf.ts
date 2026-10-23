// Node implementation of `zitejs/pdf`: renders HTML to PDF with headless Chromium and stores it in UPLOAD_DIR.
import path from 'node:path';

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? './uploads');

export const ZitePdf = {
  async renderHtml({ html, filename = 'document.pdf' }: { html: string; filename?: string }) {
    const puppeteer = await import('puppeteer-core');
    const browser = await puppeteer.launch({
      executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/google-chrome-stable',
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
