import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/types.ts', 'src/cli.ts', 'src/server/**'],
      thresholds: {
        lines: 94,
        functions: 95,
        branches: 82,
        statements: 94,
      },
    },
  },
});
