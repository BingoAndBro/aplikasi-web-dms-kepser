import { defineConfig } from 'vitest/config'

// Tes integrasi (Postgres asli). `vitest.config.ts` mengecualikan folder ini,
// dan filter CLI tidak bisa menembus `exclude`, jadi dipakai config terpisah.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
  },
})
