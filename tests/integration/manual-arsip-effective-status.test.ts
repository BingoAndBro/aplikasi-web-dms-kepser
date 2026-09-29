// Integration test (D-29): status arsip dokumen tambahan KSBU mengikuti status
// arsip berkas penaungnya (kolom status milik manual_arsip dihapus di 0021). Menyambung ke PostgreSQL ASLI karena yang
// diuji adalah SQL `manualArsipEffectiveStatusArsip` (subquery berkorelasi)
// itu sendiri, di SELECT, WHERE, dan UPDATE — hal yang tidak bisa dibuktikan
// oleh tes unit dengan `db` tiruan.
//
// Prasyarat dan cara jalan: lihat dokumen-transaksi-permintaan-fk.test.ts
// (`pnpm test:integration`, Postgres lokal + migrasi + seed). Semua data uji
// dibuat di dalam transaksi yang selalu di-ROLLBACK.

import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

if (!process.env.DATABASE_URL) {
  process.loadEnvFile('.env')
}

type ClientModule = typeof import('#/db/client')
type ArsipSchema = typeof import('#/db/schema/arsip')
type EffectiveModule = typeof import('#/lib/archive/manual-arsip-effective-status')

let client: ClientModule
let arsip: ArsipSchema
let effective: EffectiveModule['manualArsipEffectiveStatusArsip']
let base: { fungsiId: string; kegiatanId: string; komponenId: string; userId: string; klasifikasiId: string }

class Rollback extends Error {}

beforeAll(async () => {
  client = await import('#/db/client')
  arsip = await import('#/db/schema/arsip')
  effective = (await import('#/lib/archive/manual-arsip-effective-status')).manualArsipEffectiveStatusArsip

  const komponen = await client.pool.query<{ id: string; kegiatan_id: string; fungsi_id: string }>(
    `select k.id, k.kegiatan_id, g.fungsi_id
       from master.master_komponen k
       join master.master_kegiatan g on g.id = k.kegiatan_id
      limit 1`,
  )
  const user = await client.pool.query<{ id: string }>('select id from auth.users limit 1')
  const klasifikasi = await client.pool.query<{ id: string }>('select id from arsip.master_klasifikasi_arsip limit 1')
  if (!komponen.rows[0] || !user.rows[0] || !klasifikasi.rows[0]) {
    throw new Error('DB dev perlu minimal 1 komponen, 1 user, dan 1 klasifikasi arsip (jalankan pnpm db:seed).')
  }
  base = {
    fungsiId: komponen.rows[0].fungsi_id,
    kegiatanId: komponen.rows[0].kegiatan_id,
    komponenId: komponen.rows[0].id,
    userId: user.rows[0].id,
    klasifikasiId: klasifikasi.rows[0].id,
  }
})

afterAll(async () => {
  await client?.pool.end()
})

/** Satu dokumen manual di satu berkas dengan status tertentu. */
async function inRolledBackBerkas(
  berkas: { statusBerkas: 'OPEN' | 'CLOSED'; statusArsip: string | null },
  check: (tx: Parameters<Parameters<ClientModule['db']['transaction']>[0]>[0], manualId: string) => Promise<void>,
) {
  await expect(client.db.transaction(async (tx) => {
    const berkasId = randomUUID()
    const manualId = randomUUID()
    const closed = berkas.statusBerkas === 'CLOSED'

    await tx.insert(arsip.berkasArsip).values({
      id: berkasId,
      klasifikasiId: base.klasifikasiId,
      // Tahun jauh supaya tidak bentrok dengan unique (klasifikasi, tahun) data dev.
      tahunAnggaran: 2099,
      klasifikasiNamaSnapshot: 'D-29 integration test',
      statusBerkas: berkas.statusBerkas,
      statusArsip: berkas.statusArsip as never,
      closedAt: closed ? new Date() : null,
      closedBy: closed ? base.userId : null,
      createdBy: base.userId,
    })
    await tx.insert(arsip.manualArsip).values({
      id: manualId,
      nama: 'D-29 integration test',
      tanggal: '2026-09-29',
      keterangan: 'uji',
      fungsiId: base.fungsiId,
      kegiatanId: base.kegiatanId,
      komponenId: base.komponenId,
      createdBy: base.userId,
    })
    await tx.insert(arsip.berkasArsipItem).values({
      berkasId,
      sourceType: 'MANUAL',
      manualArsipId: manualId,
      addedBy: base.userId,
    })

    await check(tx, manualId)
    throw new Rollback()
  })).rejects.toBeInstanceOf(Rollback)
}

async function effectiveStatus(tx: Parameters<Parameters<ClientModule['db']['transaction']>[0]>[0], manualId: string) {
  const [row] = await tx
    .select({ effective })
    .from(arsip.manualArsip)
    .where(eq(arsip.manualArsip.id, manualId))
  return row
}

describe('manualArsipEffectiveStatusArsip (D-29)', () => {
  it.each(['AKTIF', 'INAKTIF', 'USUL_MUSNAH', 'DIMUSNAHKAN'])(
    'mengikuti berkas CLOSED berstatus %s',
    async (statusArsip) => {
      await inRolledBackBerkas({ statusBerkas: 'CLOSED', statusArsip }, async (tx, manualId) => {
        expect(await effectiveStatus(tx, manualId)).toEqual({ effective: statusArsip })
      })
    },
  )

  it('AKTIF selama berkas masih OPEN (status arsip berkas NULL)', async () => {
    await inRolledBackBerkas({ statusBerkas: 'OPEN', statusArsip: null }, async (tx, manualId) => {
      expect(await effectiveStatus(tx, manualId)).toEqual({ effective: 'AKTIF' })
    })
  })

  it('bisa dipakai di WHERE dan sebagai guard UPDATE (dokumen di berkas DIMUSNAHKAN tidak bisa diedit)', async () => {
    await inRolledBackBerkas({ statusBerkas: 'CLOSED', statusArsip: 'DIMUSNAHKAN' }, async (tx, manualId) => {
      const found = await tx
        .select({ id: arsip.manualArsip.id })
        .from(arsip.manualArsip)
        .where(and(eq(arsip.manualArsip.id, manualId), eq(effective, 'DIMUSNAHKAN')))
      expect(found).toHaveLength(1)

      const updated = await tx
        .update(arsip.manualArsip)
        .set({ updatedAt: sql`now()` })
        .where(and(eq(arsip.manualArsip.id, manualId), eq(effective, 'AKTIF')))
        .returning({ id: arsip.manualArsip.id })
      expect(updated).toHaveLength(0)
    })

    await inRolledBackBerkas({ statusBerkas: 'CLOSED', statusArsip: 'AKTIF' }, async (tx, manualId) => {
      const updated = await tx
        .update(arsip.manualArsip)
        .set({ updatedAt: sql`now()` })
        .where(and(eq(arsip.manualArsip.id, manualId), eq(effective, 'AKTIF')))
        .returning({ id: arsip.manualArsip.id })
      expect(updated).toHaveLength(1)
    })
  })
})
