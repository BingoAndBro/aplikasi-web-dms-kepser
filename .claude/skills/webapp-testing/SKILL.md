---
name: webapp-testing
description: Menulis dan menjalankan unit test (Vitest), integration test (PostgreSQL asli), dan E2E (Playwright) untuk DMS Kepser. Pakai saat menambah fitur, memperbaiki bug, menguji rute API, FSM, hak akses peran, atau alur pengguna.
---

# Webapp Testing — DMS Kepser

## Prinsip

1. **TDD bila memungkinkan**: tulis tes yang gagal dulu, baru implementasi.
2. **Hasil tes adalah hakim**: jangan menyimpulkan benar tanpa menjalankan tes.
3. **Uji perilaku, bukan detail implementasi**: periksa respons, status, dan data yang berubah.
4. **Selalu ada tes negatif**: peran yang salah → `403`, tanpa sesi → `401`, transisi FSM tidak sah → ditolak.
5. **Jangan mengubah tes hanya supaya lulus**, kecuali tesnya memang keliru. Jangan skip atau hapus tes.

## Jenis Tes dan Perintah

| Jenis | Lokasi | Perintah | Butuh DB? |
|---|---|---|---|
| Unit (FSM) | `tests/fsm.test.ts` | `pnpm test tests/fsm.test.ts` | Tidak |
| Unit/komponen | `tests/unit/**` | `pnpm test` atau `pnpm test tests/unit/<folder>` | Tidak (DB di-mock) |
| Integrasi | `tests/integration/**` | `pnpm test:integration` | Ya, PostgreSQL lokal + migrasi |
| E2E | `tests/e2e/*.spec.ts` | `npx playwright test` | Ya, aplikasi berjalan |
| Cakupan | — | `pnpm test -- --coverage` | Tidak |
| Tipe | — | `pnpm typecheck` | Tidak |

- `vitest.config.ts` mengecualikan `tests/integration/**` dan membatasi `maxWorkers: 4` (lebih dari itu kehabisan memori).
- Mulai dari tes terkecil yang relevan; jalankan seluruh suite hanya bila diminta atau sebelum push besar.
- Klasifikasi seluruh file tes ada di `tests/TEST-CLASSIFICATION.md`; perbarui bila menambah file tes.

## Pola Unit Test Rute API (dependency di-mock)

Contoh nyata: `tests/unit/arsiparis/klasifikasi-create-route.test.ts`.

```ts
const mocks = vi.hoisted(() => ({ getLocalServerSession: vi.fn(), dbSelect: vi.fn() }))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
  hasLocalRole: (s: { roles: string[] }, role: string) => s.roles.includes(role),
}))
vi.mock('#/db/client', () => ({ db: { select: mocks.dbSelect } }))

import { Route } from '#/routes/api/kasubag/klasifikasi/index'
const post = (Route as any).options.server.handlers.POST

it('menolak ADMIN dengan 403', async () => {
  mocks.getLocalServerSession.mockResolvedValue({ user: { id: USER_ID }, roles: ['ADMIN'] })
  const res = await post({ request: new Request('https://localhost:3000/api/...', {
    method: 'POST', headers: { origin: 'https://localhost:3000' }, body: JSON.stringify({}) }) })
  expect(res.status).toBe(403)
})
```

Rute `POST/PUT/PATCH/DELETE` memeriksa same-origin, jadi sertakan header `origin` yang cocok di request uji.

## Pola Integration Test (PostgreSQL asli)

Contoh nyata: `tests/integration/manual-arsip-effective-status.test.ts`.

- Muat env: `if (!process.env.DATABASE_URL) process.loadEnvFile('.env')`.
- Import modul DB secara dinamis di `beforeAll`.
- Buat semua data uji di dalam `db.transaction` lalu lempar `Rollback` di akhir supaya DB bersih.
- Dipakai untuk hal yang tidak bisa dibuktikan dengan mock: SQL, constraint, subquery, FK.

## E2E (Playwright)

- `playwright.config.ts`: `baseURL` dari `PLAYWRIGHT_BASE_URL` (bawaan `http://localhost:3000`), satu worker, Chromium.
- Jalankan aplikasi dulu (`pnpm build && pnpm start`, atau `pnpm dev` lalu set `PLAYWRIGHT_BASE_URL=https://localhost:3000`).
- Alur yang sudah ada: `submit-flow`, `approval-flow`, `spec-06-user-management`.
- Pakai akun hasil seed; jangan menulis kata sandi asli di file tes.

## Peran yang Diuji

`PEGAWAI`, `PPK`, `PPSPM`, `KEPALA_SUB_BAGIAN_UMUM`, `PENANGGUNG_JAWAB_KINERJA`, `ADMIN`
(`src/lib/constants/roles.ts`). Ketua Tim bukan peran login, melainkan penugasan kegiatan
(`master.ketua_tim_assignments`); uji akses Ketua Tim lewat pegawai yang ditugaskan.

## Larangan

- Jangan memakai basis data produksi atau data pegawai asli.
- Jangan mencetak isi `.env`, hash kata sandi, token sesi, atau token file di output tes.
- Pasang dependensi tes hanya dengan `pnpm add -D`.
