import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/core/telegram.ts', 'src/core/transcriber.ts', 'src/core/pipeline.ts', 'src/core/video-processor.ts', 'src/core/subtitle.ts', 'src/types.ts', 'src/cli.ts', 'src/server/**'],
    },
  },
});
