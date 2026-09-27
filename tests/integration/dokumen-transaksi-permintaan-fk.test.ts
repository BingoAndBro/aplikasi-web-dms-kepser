// Integration test (D-20): menyambung ke PostgreSQL ASLI, bukan `db` yang di-mock.
//
// Prasyarat:
//   1. Postgres lokal jalan:
//        docker compose -f infra/docker/postgres/docker-compose.yml up -d
//   2. `DATABASE_URL` di `.env` menunjuk ke DB tersebut dan migrasi sudah
//      diterapkan (`pnpm db:migrate`, termasuk 0020_dokumen_transaksi_permintaan_fk).
//
// Jalankan lewat `pnpm test:integration`, TERPISAH dari `pnpm test`:
// `vitest.config.ts` mengecualikan `tests/integration/**` dari `pnpm test`
// supaya gerbang kelulusan tetap jalan di mesin tanpa Postgres.
//
// Koneksi memakai `pool` dari `src/db/client.ts` (sama seperti aplikasi).
// Setiap kasus berjalan di dalam transaksi yang selalu di-ROLLBACK, jadi
// tidak ada data uji yang tertinggal di DB.

import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

if (!process.env.DATABASE_URL) {
  // Vitest tidak memuat `.env` ke process.env; aplikasi membacanya lewat dotenv.
  process.loadEnvFile('.env')
}

let pool: Pool
let base: { fungsiId: string; kegiatanId: string; userId: string }

beforeAll(async () => {
  ;({ pool } = await import('#/db/client'))

  const kegiatan = await pool.query<{ id: string; fungsi_id: string }>(
    'select id, fungsi_id from master.master_kegiatan limit 1',
  )
  const user = await pool.query<{ id: string }>('select id from auth.users limit 1')
  if (!kegiatan.rows[0] || !user.rows[0]) {
    throw new Error('DB dev perlu minimal 1 master_kegiatan dan 1 user (jalankan pnpm db:seed).')
  }
  base = {
    fungsiId: kegiatan.rows[0].fungsi_id,
    kegiatanId: kegiatan.rows[0].id,
    userId: user.rows[0].id,
  }
})

afterAll(async () => {
  await pool?.end()
})

async function insertInRolledBackTransaction(column: string, value: string) {
  const client: PoolClient = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `insert into dokumen.dokumen_transaksi
         (judul, fungsi_id, kegiatan_jenis_id, tahun, tanggal, created_by, ${column})
       values ($1, $2, $3, $4, $5, $6, $7)`,
      ['D-20 integration test', base.fungsiId, base.kegiatanId, 2026, '2026-09-27', base.userId, value],
    )
  } finally {
    await client.query('ROLLBACK')
    client.release()
  }
}

describe('dokumen_transaksi FK ke master permintaan (D-20)', () => {
  it.each([
    ['jenis_permintaan_id', 'dokumen_transaksi_jenis_permintaan_id_master_jenis_permintaan_i'],
    ['kategori_permintaan_id', 'dokumen_transaksi_kategori_permintaan_id_master_kategori_permin'],
    ['detail_permintaan_id', 'dokumen_transaksi_detail_permintaan_id_master_detail_permintaan'],
  ])('menolak %s yang tidak ada di master (23503)', async (column, constraint) => {
    await expect(insertInRolledBackTransaction(column, randomUUID())).rejects.toMatchObject({
      code: '23503',
      constraint,
    })
  })
})
