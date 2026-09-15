import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { localOcrPlugin } from './scripts/local-ocr-plugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localOcrPlugin()],
  server: {
    watch: { ignored: ['**/.local/**', '**/private/**'] },
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/private/**', '**/.local/**'] },
  },
  test: {
    // Bound concurrent jsdom workers so full-document checks retain predictable resources.
    maxWorkers: 4,
    include: ['src/**/*.test.{ts,tsx}', 'api/**/*.test.ts', 'scripts/demo-fixture.test.ts', 'scripts/dev-ai.test.ts', 'scripts/read-bounded-source-sections.test.ts'],
    environment: 'jsdom',
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    setupFiles: './src/test/setup.ts',
    testTimeout: 10_000,
  },
})
