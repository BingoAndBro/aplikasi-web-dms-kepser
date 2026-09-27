import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Tes integrasi butuh Postgres asli; dijalankan lewat `pnpm test:integration`.
    exclude: ['**/node_modules/**', 'tests/integration/**'],
  },
})
