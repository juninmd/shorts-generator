import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 20000,
    include: ['tests/**/*.test.ts'],
    exclude: ['web/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/types.ts',
        'src/cli.ts',
        'src/cli-interactive.ts',
        'src/core/pipeline.ts',
        'src/core/pipeline-video-processor.ts',
        'src/core/telegram.ts',
        'src/core/transcriber.ts',
        'src/core/youtube.ts',
        'src/core/subtitle.ts',
        'src/core/video-processor.ts',

        'src/server/routes.ts',

        'src/core/youtube-ytdlp.ts',
        'src/core/youtube-section.ts',
        'src/core/youtube-info.ts',
        'src/core/youtube-download.ts',
        'src/core/youtube-channel.ts',
        'src/core/youtube.service.ts',

        'src/types/better-sqlite3.d.ts',
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
