// Node implementation of `zitejs/pdf`: renders HTML to PDF with headless Chromium and stores it in UPLOAD_DIR.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? './uploads');

export const ZitePdf = {
  async renderHtml({ html, filename = 'document.pdf' }: { html: string; filename?: string }) {
    const puppeteer = await import('puppeteer-core');
    const browser = await puppeteer.launch({
      executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const buf = await page.pdf({ printBackground: true, preferCSSPageSize: true, format: 'A4' });
      const key = `${randomUUID()}-${filename.replace(/[^\w.-]/g, '_')}`;
      await mkdir(UPLOAD_DIR, { recursive: true });
      await writeFile(path.join(UPLOAD_DIR, key), buf);
      return { url: `${process.env.PUBLIC_URL ?? ''}/files/${key}`, filename };
    } finally {
      await browser.close();
    }
  },
};
