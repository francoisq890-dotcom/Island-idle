import { defineConfig } from 'vite';

// `base: './'` makes the build work both on GitHub Pages (sub-path) and locally.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
} as any);
