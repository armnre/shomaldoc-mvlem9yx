import { defineConfig } from 'vitest/config';
import path from 'node:path';

const r = (p: string) => path.resolve(import.meta.dirname, p);

export default defineConfig({
  resolve: {
    alias: {
      'zitejs/db': r('../.zite/db.ts'),
      'zitejs/runtime': r('./src/shims/runtime.ts'),
      'zitejs/backend': r('./src/shims/backend.ts'),
      'zitejs/pdf': r('./src/shims/pdf.ts'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://shomal:pw@127.0.0.1:5433/shomaldoc_test',
      UPLOAD_DIR: '/tmp/shomaldoc-test-uploads',
      RATE_LOGIN: '60',
      FORCE_HSTS: 'true',
      DISABLE_JOBS: 'true',
    },
  },
});
