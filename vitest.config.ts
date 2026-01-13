import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@test': resolve(__dirname, 'tests'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',  // Test utilities (factories, helpers) - not production code
        '**/*.test.ts',
        '**/*.d.ts',
        '**/types.ts',
        'src/index.ts', // Entry point
      ],
      // Coverage thresholds - prevent quality degradation
      // Set slightly below current coverage (86.52/80.22/87.46/86.52) to allow wiggle room
      thresholds: {
        statements: 85,
        branches: 78,
        functions: 85,
        lines: 85,
      },
      // Report uncovered lines
      all: true,
      // Clean coverage directory before each run
      clean: true,
    },
  },
});

