import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { desc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import { masterFungsi, masterKegiatan } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { DOC_STATUS } from '#/lib/constants/document-status'
import { createDokumenSchema, getDokumenValidationErrorMessage } from '#/lib/schemas/dokumen'
import { parseDokumenWithNames } from '#/lib/dokumen'

// ---------------------------------------------------------------------------
// GET /api/dokumen — List dokumen for current user
// POST /api/dokumen — Create DRAFT dokumen
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/dokumen/')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (!hasLocalRole(session, 'PEGAWAI')) {
          return Response.json({ error: 'Akses ditolak' }, { status: 403 })
        }

        try {
          const rows = await db
            .select({
              id: dokumenTransaksi.id,
              judul: dokumenTransaksi.judul,
              fungsi_id: dokumenTransaksi.fungsiId,
              kegiatan_jenis_id: dokumenTransaksi.kegiatanJenisId,
              is_ketua_tim: dokumenTransaksi.isKetuaTim,
              status: dokumenTransaksi.status,
              current_step: dokumenTransaksi.currentStep,
              revision_target: dokumenTransaksi.revisionTarget,
              revision_notes: dokumenTransaksi.revisionNotes,
              lampiran_urls: dokumenTransaksi.lampiranUrls,
              tahun: dokumenTransaksi.tahun,
              tanggal: dokumenTransaksi.tanggal,
              created_by: dokumenTransaksi.createdBy,
              nominal_realisasi: dokumenTransaksi.nominalRealisasi,
              is_non_material: dokumenTransaksi.isNonMaterial,
              jenis_dokumen_id: dokumenTransaksi.jenisDokumenId,
              keterangan_detail: dokumenTransaksi.keteranganDetail,
              created_at: dokumenTransaksi.createdAt,
              updated_at: dokumenTransaksi.updatedAt,
              fungsi_nama: masterFungsi.nama,
              kegiatan_nama: masterKegiatan.nama,
            })
            .from(dokumenTransaksi)
            .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .where(eq(dokumenTransaksi.createdBy, session.user.id))
            .orderBy(desc(dokumenTransaksi.createdAt))

          return Response.json({
            dokumen: rows.map((row) => parseDokumenWithNames(row, {}, {})),
          })
        } catch (err) {
          console.error('[dokumen/index] GET local query error:', err)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }
      },

      POST: async ({ request }: { request: Request }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const parsed = createDokumenSchema.safeParse(body)
        if (!parsed.success) {
          return Response.json({
            error: getDokumenValidationErrorMessage(parsed.error),
            details: parsed.error.flatten(),
          }, { status: 400 })
        }

        const session = await getLocalServerSession(request)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (!hasLocalRole(session, 'PEGAWAI')) {
          return Response.json({ error: 'Akses ditolak' }, { status: 403 })
        }

        let kegiatan: { nama: string } | undefined
        try {
          const kegiatanRows = await db
            .select({ nama: masterKegiatan.nama })
            .from(masterKegiatan)
            .where(eq(masterKegiatan.id, parsed.data.kegiatanJenisId))
            .limit(1)

          kegiatan = kegiatanRows[0]
        } catch (err) {
          console.error('[dokumen/index] POST local kegiatan lookup error:', err)
          return Response.json({ error: 'Gagal membuat dokumen' }, { status: 500 })
        }

        if (!kegiatan) {
          return Response.json({ error: 'Kegiatan tidak ditemukan' }, { status: 400 })
        }

        // Fetch user display name
        const userName =
          session.user.userName
          || session.user.email.split('@')[0]
          || 'Unknown'

        // Judul: [Kegiatan] [Tahun] [Nama Pegawai]
        const judul = `${kegiatan.nama} ${parsed.data.tahun} ${userName}`

        try {
          const insertedRows = await db
            .insert(dokumenTransaksi)
            .values({
              judul,
              fungsiId: parsed.data.fungsiId,
              kegiatanJenisId: parsed.data.kegiatanJenisId,
              isKetuaTim: parsed.data.isKetuaTim,
              tahun: parsed.data.tahun,
              tanggal: parsed.data.tanggal,
              lampiranUrls: parsed.data.lampiranUrls,
              createdBy: session.user.id,
              status: DOC_STATUS.DRAFT,
              nominalRealisasi: '0',
              isNonMaterial: false,
              jenisDokumenId: null,
              keteranganDetail: null,
              jenisPermintaanId: null,
              kategoriPermintaanId: null,
              detailPermintaanId: null,
            })
            .returning({ id: dokumenTransaksi.id })

          const inserted = insertedRows[0]
          if (!inserted) {
            return Response.json({ error: 'Gagal membuat dokumen' }, { status: 500 })
          }

          const rows = await db
            .select({
              id: dokumenTransaksi.id,
              judul: dokumenTransaksi.judul,
              fungsi_id: dokumenTransaksi.fungsiId,
              kegiatan_jenis_id: dokumenTransaksi.kegiatanJenisId,
              is_ketua_tim: dokumenTransaksi.isKetuaTim,
              status: dokumenTransaksi.status,
              current_step: dokumenTransaksi.currentStep,
              revision_target: dokumenTransaksi.revisionTarget,
              revision_notes: dokumenTransaksi.revisionNotes,
              lampiran_urls: dokumenTransaksi.lampiranUrls,
              tahun: dokumenTransaksi.tahun,
              tanggal: dokumenTransaksi.tanggal,
              created_by: dokumenTransaksi.createdBy,
              nominal_realisasi: dokumenTransaksi.nominalRealisasi,
              is_non_material: dokumenTransaksi.isNonMaterial,
              jenis_dokumen_id: dokumenTransaksi.jenisDokumenId,
              keterangan_detail: dokumenTransaksi.keteranganDetail,
              created_at: dokumenTransaksi.createdAt,
              updated_at: dokumenTransaksi.updatedAt,
              fungsi_nama: masterFungsi.nama,
              kegiatan_nama: masterKegiatan.nama,
            })
            .from(dokumenTransaksi)
            .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .where(eq(dokumenTransaksi.id, inserted.id))
            .limit(1)

          const dokumen = rows[0]
          if (!dokumen) {
            return Response.json({ error: 'Gagal membuat dokumen' }, { status: 500 })
          }

          return Response.json({
            dokumen: parseDokumenWithNames(dokumen, {}, {}),
          }, { status: 201 })
        } catch (err) {
          console.error('[dokumen/index] POST local insert error:', err)
          return Response.json({ error: 'Gagal membuat dokumen' }, { status: 500 })
        }
      },
    },
  },
})
