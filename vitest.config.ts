import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
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
        'src/core/quiz/quiz-assets.service.ts',
        'src/core/quiz/quiz-content.service.ts',
        'src/core/quiz/quiz-ffmpeg.service.ts',
        'src/core/quiz/quiz-filters.service.ts',
        'src/core/quiz/quiz-pipeline.ts',
        'src/core/quiz/quiz-tts.service.ts',
        'src/core/quiz/quiz-video.service.ts',
        // Type-only file — no runtime code
        'src/core/channel-domain.ts',
        // Ignore files we cannot reliably test entirely unit-wise
        'src/server/index.ts',
        'src/server/admin-routes.ts',
        'src/core/analyzer.ts',
        'src/core/managed-run-repository.ts',
        'src/core/channel-bundle-repository.ts',
        'src/server/auth-middleware.ts',
        'src/server/job-store.ts',
        'src/core/channel-config-resolver.ts',
        'src/core/control-plane-db.ts',
        'src/core/short-renderer.ts',
        'src/core/state.ts',
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
