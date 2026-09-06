import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 20000,
    include: ['tests/**/*.test.ts', 'tests/**/*.health.ts'],
    exclude: ['web/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/types.ts',
        'src/cli.ts',
        'src/cli-commands/**',
        'src/cli-interactive.ts',
        'src/core/youtube.ts',
        'src/core/youtube.service.ts',
        'src/core/transcriber.ts',
        'src/core/queue.ts',
        'src/core/youtube-upload-perform.ts',
        'src/types/better-sqlite3.d.ts',
        'src/core/youtube-auth.service.ts',
        'src/core/youtube-channel.ts',
        'src/core/youtube-comment.service.ts',
        'src/core/youtube-download.ts',
        'src/core/youtube-info.ts',
        'src/core/youtube-metadata.service.ts',
      ],
      all: true,
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
