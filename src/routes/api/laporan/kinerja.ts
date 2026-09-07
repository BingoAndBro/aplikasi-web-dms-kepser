import { createFileRoute } from '@tanstack/react-router'
import { desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '#/db/client'
import { users } from '#/db/schema/auth'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  masterFungsi,
  masterKegiatan,
} from '#/db/schema/master'
import {
  getLocalServerSession,
  hasAnyLocalRole,
} from '#/lib/auth/local-server-auth'
import { DOC_STATUS } from '#/lib/constants/document-status'
import { ROLES } from '#/lib/constants/roles'

const FINAL_LAPORAN_KINERJA_STATUSES = [
  DOC_STATUS.COMPLETED,
  DOC_STATUS.TERSIMPAN,
  DOC_STATUS.ARCHIVED,
] as const

const LAPORAN_KINERJA_LIMIT = 200

const laporanKinerjaRowSchema = z.object({
  id: z.string(),
  judul: z.string(),
  status: z.enum(FINAL_LAPORAN_KINERJA_STATUSES),
  is_non_material: z.boolean(),
  fungsi_nama: z.string().nullable(),
  kegiatan_nama: z.string().nullable(),
  tahun: z.number(),
  tanggal: z.string(),
  pengaju_nama: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  nominal_realisasi: z.number().nullable(),
})

const laporanKinerjaResponseSchema = z.object({
  dokumen: z.array(laporanKinerjaRowSchema),
  meta: z.object({
    limit: z.number(),
    final_statuses: z.array(z.enum(FINAL_LAPORAN_KINERJA_STATUSES)),
  }),
})

type UserDisplayFields = {
  displayName: string | null
  namaLengkap: string | null
  email: string | null
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
    ?? user.email?.split('@')[0]
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
            ROLES.BENDAHARA,
          ])
        ) {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }

        try {
          const rows = await db
            .select({
              id: dokumenTransaksi.id,
              judul: dokumenTransaksi.judul,
              status: dokumenTransaksi.status,
              is_non_material: dokumenTransaksi.isNonMaterial,
              fungsi_nama: masterFungsi.nama,
              kegiatan_nama: masterKegiatan.nama,
              tahun: dokumenTransaksi.tahun,
              tanggal: dokumenTransaksi.tanggal,
              created_at: dokumenTransaksi.createdAt,
              updated_at: dokumenTransaksi.updatedAt,
              nominal_realisasi: dokumenTransaksi.nominalRealisasi,
              pengaju_display_name: users.displayName,
              pengaju_nama_lengkap: users.namaLengkap,
              pengaju_email: users.email,
            })
            .from(dokumenTransaksi)
            .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .leftJoin(users, eq(dokumenTransaksi.createdBy, users.id))
            .where(inArray(dokumenTransaksi.status, FINAL_LAPORAN_KINERJA_STATUSES))
            .orderBy(desc(dokumenTransaksi.updatedAt))
            .limit(LAPORAN_KINERJA_LIMIT)

          const response = laporanKinerjaResponseSchema.parse({
            dokumen: rows.map((row) => {
              const isNonMaterial = row.is_non_material ?? false

              return {
                id: row.id,
                judul: row.judul,
                status: row.status,
                is_non_material: isNonMaterial,
                fungsi_nama: row.fungsi_nama,
                kegiatan_nama: row.kegiatan_nama,
                tahun: row.tahun,
                tanggal: row.tanggal,
                pengaju_nama: displayUserName({
                  displayName: row.pengaju_display_name,
                  namaLengkap: row.pengaju_nama_lengkap,
                  email: row.pengaju_email,
                }),
                created_at: isoDateString(row.created_at),
                updated_at: isoDateString(row.updated_at),
                nominal_realisasi: isNonMaterial
                  ? null
                  : normalizeNumericValue(row.nominal_realisasi),
              }
            }),
            meta: {
              limit: LAPORAN_KINERJA_LIMIT,
              final_statuses: [...FINAL_LAPORAN_KINERJA_STATUSES],
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
