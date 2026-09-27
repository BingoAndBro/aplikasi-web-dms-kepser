import { createFileRoute } from '@tanstack/react-router'
import { and, desc, eq, gte, isNotNull, isNull, lte, ne, notInArray, or } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '#/db/client'
import { berkasArsip, berkasArsipItem, manualArsip } from '#/db/schema/arsip'
import { users } from '#/db/schema/auth'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  masterFungsi,
  masterKegiatan,
  masterKomponen,
} from '#/db/schema/master'
import {
  getLocalServerSession,
  hasAnyLocalRole,
  hasLocalRole,
} from '#/lib/auth/local-server-auth'
import { ARCHIVE_SOURCE_TYPE, ARCHIVE_STATUS, BERKAS_ARCHIVE_STATUS } from '#/lib/constants/archive-status'
import { DOC_STATUS } from '#/lib/constants/document-status'
import { ROLES } from '#/lib/constants/roles'

// Dokumen material yang final (COMPLETED) dihitung sebagai realisasi — wajib
// mengisi Komponen saat submit (lihat lib/schemas/dokumen.ts); dokumen lama
// dari sebelum kolom Komponen ada dan tidak punya komponen_id dianggap data
// yatim, bukan realisasi yang bisa dipertanggungjawabkan, jadi ikut dibuang
// (lihat isNotNull(komponenId) di bawah). Dokumen non-material (TERSIMPAN)
// tidak pernah punya nominal realisasi — hanya disertakan saat
// ?scope=laporan_kinerja diminta oleh halaman Laporan Kinerja, dan scope itu
// hanya diizinkan untuk PJ Kinerja (403 untuk PPK/PPSPM). Monitoring
// Realisasi (PPK/PPSPM) hanya melihat dokumen material COMPLETED.
const ALL_LAPORAN_KINERJA_STATUSES = [
  DOC_STATUS.COMPLETED,
  DOC_STATUS.TERSIMPAN,
] as const

const LAPORAN_KINERJA_LIMIT = 2000

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// T-5 / D-26: dokumen manual KSBU ("Penambahan Dokumen", arsip.manual_arsip)
// tidak pernah melewati alur SUBMIT/APPROVE, jadi tidak punya `status` FSM.
// Ia dianggap terealisasi sejak diarsipkan (selalu langsung masuk berkas —
// lihat addManualDocumentToOpenBerkas di manual-arsip.ts), sehingga dipetakan
// ke status 'COMPLETED' yang sudah ada. `sumber` membedakannya di UI supaya
// PPK/PPSPM tidak salah kira dokumen itu melalui persetujuan mereka.
const LAPORAN_KINERJA_SUMBER = ['WORKFLOW', 'MANUAL'] as const

const laporanKinerjaRowSchema = z.object({
  id: z.string(),
  judul: z.string(),
  status: z.enum(ALL_LAPORAN_KINERJA_STATUSES),
  sumber: z.enum(LAPORAN_KINERJA_SUMBER),
  fungsi_nama: z.string().nullable(),
  kegiatan_nama: z.string().nullable(),
  komponen_id: z.string().nullable(),
  komponen_nama: z.string().nullable(),
  tahun: z.number(),
  tanggal: z.string(),
  pengaju_id: z.string().nullable(),
  pengaju_nama: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  nominal_realisasi: z.number().nullable(),
  is_diberkaskan: z.boolean(),
})

const laporanKinerjaResponseSchema = z.object({
  dokumen: z.array(laporanKinerjaRowSchema),
  meta: z.object({
    limit: z.number(),
    count: z.number(),
    truncated: z.boolean(),
    final_statuses: z.array(z.enum(ALL_LAPORAN_KINERJA_STATUSES)),
    tahun_tersedia: z.array(z.number()),
  }),
})

type UserDisplayFields = {
  displayName: string | null
  namaLengkap: string | null
  username: string | null
}

function normalizeNumericValue(value: string | number | null): number | null {
  if (value === null) return null
  if (typeof value === 'number') return value

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function displayUserName(user: UserDisplayFields): string {
  return user.displayName
    ?? user.namaLengkap
    ?? user.username
    ?? 'Unknown'
}

function isoDateString(value: Date | string | null): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  return ''
}

export const Route = createFileRoute('/api/laporan/kinerja')({
  ssr: false,
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (
          !hasAnyLocalRole(session, [
            ROLES.PENANGGUNG_JAWAB_KINERJA,
            ROLES.PPK,
            ROLES.PPSPM,
          ])
        ) {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }

        const url = new URL(request.url)
        const startDateParam = url.searchParams.get('start_date')
        const endDateParam = url.searchParams.get('end_date')
        const includeNonMaterial = url.searchParams.get('scope') === 'laporan_kinerja'

        // Laporan Kinerja (material + non-material) belongs to PJ Kinerja;
        // PPK/PPSPM only get the material-only Monitoring Realisasi view.
        if (includeNonMaterial && !hasLocalRole(session, ROLES.PENANGGUNG_JAWAB_KINERJA)) {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }

        if (startDateParam && !ISO_DATE_PATTERN.test(startDateParam)) {
          return Response.json({ error: 'Parameter periode tidak valid' }, { status: 400 })
        }

        if (endDateParam && !ISO_DATE_PATTERN.test(endDateParam)) {
          return Response.json({ error: 'Parameter periode tidak valid' }, { status: 400 })
        }

        try {
          // Dokumen yang ikut dalam berkas arsip yang sudah DIMUSNAHKAN tidak
          // lagi dihitung sebagai realisasi — otoritas "dimusnahkan" ada pada
          // join ini, sama seperti guard akses lampiran di document-file-access.ts.
          const destroyedRows = await db
            .select({ dokumenId: berkasArsipItem.dokumenId })
            .from(berkasArsipItem)
            .innerJoin(berkasArsip, eq(berkasArsipItem.berkasId, berkasArsip.id))
            .where(and(
              eq(berkasArsipItem.sourceType, ARCHIVE_SOURCE_TYPE.WORKFLOW),
              eq(berkasArsip.statusArsip, BERKAS_ARCHIVE_STATUS.DIMUSNAHKAN),
            ))

          const destroyedDocumentIds = destroyedRows
            .map((row) => row.dokumenId)
            .filter((id): id is string => id !== null)

          // "Diberkaskan" adalah metadata tambahan (dokumen sudah ditempel ke
          // berkas_arsip_item), bukan status FSM — dokumen TERSIMPAN tidak
          // pernah bisa masuk sini (klasifikasi mensyaratkan status COMPLETED).
          const berkasedRows = await db
            .select({ dokumenId: berkasArsipItem.dokumenId })
            .from(berkasArsipItem)
            .where(eq(berkasArsipItem.sourceType, ARCHIVE_SOURCE_TYPE.WORKFLOW))

          const berkasedDocumentIds = new Set(
            berkasedRows
              .map((row) => row.dokumenId)
              .filter((id): id is string => id !== null),
          )

          const materialFilter = and(
            eq(dokumenTransaksi.isNonMaterial, false),
            isNotNull(dokumenTransaksi.komponenId),
            eq(dokumenTransaksi.status, DOC_STATUS.COMPLETED),
          )

          const scopeFilter = and(
            includeNonMaterial
              ? or(
                  materialFilter,
                  and(
                    eq(dokumenTransaksi.isNonMaterial, true),
                    eq(dokumenTransaksi.status, DOC_STATUS.TERSIMPAN),
                    isNull(dokumenTransaksi.lampiranDibersihkanAt),
                  ),
                )
              : materialFilter,
            destroyedDocumentIds.length > 0
              ? notInArray(dokumenTransaksi.id, destroyedDocumentIds)
              : undefined,
          )

          const rows = await db
            .select({
              id: dokumenTransaksi.id,
              judul: dokumenTransaksi.judul,
              status: dokumenTransaksi.status,
              fungsi_nama: masterFungsi.nama,
              kegiatan_nama: masterKegiatan.nama,
              komponen_id: dokumenTransaksi.komponenId,
              komponen_nama: masterKomponen.nama,
              tahun: dokumenTransaksi.tahun,
              tanggal: dokumenTransaksi.tanggal,
              pengaju_id: dokumenTransaksi.createdBy,
              created_at: dokumenTransaksi.createdAt,
              updated_at: dokumenTransaksi.updatedAt,
              nominal_realisasi: dokumenTransaksi.nominalRealisasi,
              pengaju_display_name: users.displayName,
              pengaju_nama_lengkap: users.namaLengkap,
              pengaju_username: users.username,
            })
            .from(dokumenTransaksi)
            .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .leftJoin(masterKomponen, eq(dokumenTransaksi.komponenId, masterKomponen.id))
            .leftJoin(users, eq(dokumenTransaksi.createdBy, users.id))
            .where(and(
              scopeFilter,
              startDateParam ? gte(dokumenTransaksi.tanggal, startDateParam) : undefined,
              endDateParam ? lte(dokumenTransaksi.tanggal, endDateParam) : undefined,
            ))
            .orderBy(desc(dokumenTransaksi.updatedAt))
            .limit(LAPORAN_KINERJA_LIMIT)

          const tahunRows = await db
            .selectDistinct({ tahun: dokumenTransaksi.tahun })
            .from(dokumenTransaksi)
            .where(scopeFilter)
            .orderBy(desc(dokumenTransaksi.tahun))

          // T-5 / D-26: dokumen manual KSBU ikut dihitung sebagai realisasi,
          // TAPI hanya untuk Monitoring Nominal Realisasi (PPK/PPSPM,
          // !includeNonMaterial) — bukan untuk Laporan Kinerja PJ Kinerja
          // (scope=laporan_kinerja), yang membuka detail lewat
          // DokumenDetailDialog (fetch /api/dokumen/$id, tidak ada untuk
          // manual_arsip). Monitoring Realisasi memakai
          // KinerjaDocumentMetadataDialog yang hanya menampilkan field baris
          // ini sendiri, jadi aman untuk sumber manual.
          // "tahun" dipakai dari `tanggal` milik manual_arsip sendiri (bukan
          // tahun_anggaran berkas yang menaunginya) — konsisten dengan makna
          // `tahun` pada dokumen_transaksi: tahun milik dokumennya sendiri,
          // independen dari tahun anggaran berkas (Q5).
          // Query runs regardless of scope (keeps the db.select() call
          // sequence constant); only the merge below is scope-gated.
          const manualRows = await db
            .select({
              id: manualArsip.id,
              judul: manualArsip.nama,
              fungsi_nama: masterFungsi.nama,
              kegiatan_nama: masterKegiatan.nama,
              komponen_id: manualArsip.komponenId,
              komponen_nama: masterKomponen.nama,
              tanggal: manualArsip.tanggal,
              pengaju_id: manualArsip.createdBy,
              created_at: manualArsip.createdAt,
              updated_at: manualArsip.updatedAt,
              nominal_realisasi: manualArsip.nominalRealisasi,
              pengaju_display_name: users.displayName,
              pengaju_nama_lengkap: users.namaLengkap,
              pengaju_username: users.username,
            })
            .from(manualArsip)
            .leftJoin(masterFungsi, eq(manualArsip.fungsiId, masterFungsi.id))
            .leftJoin(masterKegiatan, eq(manualArsip.kegiatanId, masterKegiatan.id))
            .leftJoin(masterKomponen, eq(manualArsip.komponenId, masterKomponen.id))
            .leftJoin(users, eq(manualArsip.createdBy, users.id))
            .where(and(
              ne(manualArsip.statusArsip, ARCHIVE_STATUS.DIMUSNAHKAN),
              startDateParam ? gte(manualArsip.tanggal, startDateParam) : undefined,
              endDateParam ? lte(manualArsip.tanggal, endDateParam) : undefined,
            ))

          type CombinedRow = {
            id: string
            judul: string
            status: 'COMPLETED' | 'TERSIMPAN'
            sumber: 'WORKFLOW' | 'MANUAL'
            fungsi_nama: string | null
            kegiatan_nama: string | null
            komponen_id: string | null
            komponen_nama: string | null
            tahun: number
            tanggal: string
            pengaju_id: string | null
            pengaju_nama: string
            created_at: string
            updated_at: string
            nominal_realisasi: number | null
            is_diberkaskan: boolean
          }

          const workflowCombined: CombinedRow[] = rows.map((row) => ({
            id: row.id,
            judul: row.judul,
            status: row.status as 'COMPLETED' | 'TERSIMPAN',
            sumber: 'WORKFLOW',
            fungsi_nama: row.fungsi_nama,
            kegiatan_nama: row.kegiatan_nama,
            komponen_id: row.komponen_id,
            komponen_nama: row.komponen_nama,
            tahun: row.tahun,
            tanggal: row.tanggal,
            pengaju_id: row.pengaju_id ?? null,
            pengaju_nama: displayUserName({
              displayName: row.pengaju_display_name,
              namaLengkap: row.pengaju_nama_lengkap,
              username: row.pengaju_username,
            }),
            created_at: isoDateString(row.created_at),
            updated_at: isoDateString(row.updated_at),
            nominal_realisasi: normalizeNumericValue(row.nominal_realisasi),
            is_diberkaskan: berkasedDocumentIds.has(row.id),
          }))

          // Manual entries only count toward Monitoring Nominal Realisasi
          // (PPK/PPSPM, !includeNonMaterial), not PJ Kinerja's Laporan
          // Kinerja — see the design note above the query.
          const manualCombined: CombinedRow[] = includeNonMaterial ? [] : manualRows.map((row) => ({
            id: row.id,
            judul: row.judul,
            status: DOC_STATUS.COMPLETED,
            sumber: 'MANUAL',
            fungsi_nama: row.fungsi_nama,
            kegiatan_nama: row.kegiatan_nama,
            komponen_id: row.komponen_id,
            komponen_nama: row.komponen_nama,
            tahun: new Date(row.tanggal).getUTCFullYear(),
            tanggal: row.tanggal,
            pengaju_id: row.pengaju_id ?? null,
            pengaju_nama: displayUserName({
              displayName: row.pengaju_display_name,
              namaLengkap: row.pengaju_nama_lengkap,
              username: row.pengaju_username,
            }),
            created_at: isoDateString(row.created_at),
            updated_at: isoDateString(row.updated_at),
            nominal_realisasi: normalizeNumericValue(row.nominal_realisasi),
            // Menambahkan manual_arsip selalu langsung menempelkannya ke
            // berkas terbuka (addManualDocumentToOpenBerkas) — tidak pernah
            // "belum diberkaskan" seperti dokumen alur biasa.
            is_diberkaskan: true,
          }))

          const combinedBeforeLimit = [...workflowCombined, ...manualCombined]
            .sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0))

          const truncated = rows.length === LAPORAN_KINERJA_LIMIT
            || combinedBeforeLimit.length > LAPORAN_KINERJA_LIMIT
          const finalRows = combinedBeforeLimit.slice(0, LAPORAN_KINERJA_LIMIT)

          const manualTahun = new Set(manualCombined.map((row) => row.tahun))
          const tahunTersedia = Array.from(new Set([
            ...tahunRows.map((row) => row.tahun),
            ...manualTahun,
          ])).sort((a, b) => b - a)

          const response = laporanKinerjaResponseSchema.parse({
            dokumen: finalRows,
            meta: {
              limit: LAPORAN_KINERJA_LIMIT,
              count: finalRows.length,
              truncated,
              final_statuses: includeNonMaterial
                ? [...ALL_LAPORAN_KINERJA_STATUSES]
                : [DOC_STATUS.COMPLETED],
              tahun_tersedia: tahunTersedia,
            },
          })

          return Response.json(response)
        } catch {
          console.error('[laporan/kinerja] GET local query failed')
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }
      },
    },
  },
})
