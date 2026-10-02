import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Tes integrasi butuh Postgres asli; dijalankan lewat `pnpm test:integration`.
    exclude: ['**/node_modules/**', 'tests/integration/**'],
    // Jumlah worker bawaan (±11 di mesin pengembangan) membuat run crash kehabisan memori.
    maxWorkers: 4,
    coverage: {
      provider: 'v8',
      // Pemetaan AST (ast-v8-to-istanbul): cabang dihitung per hasil if/switch/ternary
      // dan per operand &&/||/??, seperti Istanbul. Mode bawaan v8 menghitung rentang blok.
      experimentalAstAwareRemapping: true,
      // Hitung seluruh berkas src/**, termasuk yang tidak tersentuh tes.
      all: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}', 'src/**/*.d.ts'],
      reporter: ['text', 'json-summary', 'json', 'html'],
      reportsDirectory: './coverage',
    },
  },
})
