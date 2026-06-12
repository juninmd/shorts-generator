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
        // Entire files wrapped in /* v8 ignore */ — require real system tools (ffmpeg, yt-dlp, whisper, telegram)
        'src/core/pipeline.ts',
        'src/core/pipeline-video-processor.ts',
        'src/core/pipeline-filters.ts',
        'src/core/telegram.ts',
        'src/core/transcriber.ts',
        'src/core/youtube.ts',
        'src/core/subtitle.ts',
        'src/core/video-processor.ts',
        // Type-only file — no runtime code
        'src/core/channel-domain.ts',
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
