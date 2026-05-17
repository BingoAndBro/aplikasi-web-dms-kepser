import { createFileRoute } from '@tanstack/react-router'
import { and, asc, eq, type SQL } from 'drizzle-orm'
import { db } from '#/db/client'
import { masterFungsi, masterKegiatan, masterKelengkapanDokumen } from '#/db/schema/master'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession, hasRole } from '#/lib/auth'
import { createKelengkapanSchema } from '#/lib/schemas/master-data'

export const Route = createFileRoute('/api/master-kelengkapan')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        // Public read endpoint: master data powers form dropdowns; mutations below remain ADMIN-only.
        try {
          const url = new URL(request.url)
          const kegiatanId = url.searchParams.get('kegiatan_id')
          const isKetuaTim = url.searchParams.get('is_ketua_tim')
          const filters: SQL[] = []

          if (kegiatanId) {
            filters.push(eq(masterKelengkapanDokumen.kegiatanId, kegiatanId))
          }

          if (isKetuaTim !== null) {
            filters.push(eq(masterKelengkapanDokumen.isKetuaTim, isKetuaTim === 'true'))
          }

          const rows = await db
            .select({
              id: masterKelengkapanDokumen.id,
              kegiatan_id: masterKelengkapanDokumen.kegiatanId,
              is_ketua_tim: masterKelengkapanDokumen.isKetuaTim,
              nama_dokumen: masterKelengkapanDokumen.namaDokumen,
              required: masterKelengkapanDokumen.required,
              jenis_permintaan_id: masterKelengkapanDokumen.jenisPermintaanId,
              kategori_permintaan_id: masterKelengkapanDokumen.kategoriPermintaanId,
              detail_permintaan_id: masterKelengkapanDokumen.detailPermintaanId,
              created_at: masterKelengkapanDokumen.createdAt,
              updated_at: masterKelengkapanDokumen.updatedAt,
              master_kegiatan_nama: masterKegiatan.nama,
              master_fungsi_nama: masterFungsi.nama,
            })
            .from(masterKelengkapanDokumen)
            .leftJoin(masterKegiatan, eq(masterKelengkapanDokumen.kegiatanId, masterKegiatan.id))
            .leftJoin(masterFungsi, eq(masterKegiatan.fungsiId, masterFungsi.id))
            .where(filters.length > 0 ? and(...filters) : undefined)
            .orderBy(
              asc(masterKelengkapanDokumen.isKetuaTim),
              asc(masterKelengkapanDokumen.namaDokumen),
            )

          const result = rows.map((row) => ({
            id: row.id,
            kegiatan_id: row.kegiatan_id,
            is_ketua_tim: row.is_ketua_tim,
            nama_dokumen: row.nama_dokumen,
            required: row.required,
            jenis_permintaan_id: row.jenis_permintaan_id,
            kategori_permintaan_id: row.kategori_permintaan_id,
            detail_permintaan_id: row.detail_permintaan_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
            master_kegiatan: row.master_kegiatan_nama
              ? {
                  nama: row.master_kegiatan_nama,
                  master_fungsi: row.master_fungsi_nama
                    ? { nama: row.master_fungsi_nama }
                    : null,
                }
              : null,
            kegiatan_nama: row.master_kegiatan_nama ?? undefined,
            fungsi_nama: row.master_fungsi_nama ?? undefined,
          }))

          return Response.json(result)
        } catch (err) {
          console.error('[API DEBUG] Error in master-kelengkapan GET:', err)
          return Response.json({ error: 'Gagal mengambil data kelengkapan' }, { status: 500 })
        }
      },

      POST: async ({ request }: { request: Request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const result = createKelengkapanSchema.safeParse(body)
        if (!result.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: result.error.flatten(),
          }, { status: 400 })
        }

        const cookieHeader = request.headers.get('cookie')
        const mockEvent = {
          request,
          cookie: { get: () => undefined, set: () => {}, delete: () => {} },
        } as any
        const supabase = createServerSupabaseClient(mockEvent, cookieHeader)

        const session = await getSession(supabase)
        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const isAdmin = await hasRole(supabase, session.user.id, 'ADMIN')
        if (!isAdmin) {
          return Response.json({ error: 'Hanya ADMIN yang bisa menambah kelengkapan' }, { status: 403 })
        }

        const { data: kegiatan } = await supabase
          .from('master_kegiatan')
          .select('id')
          .eq('id', result.data.kegiatanId)
          .eq('is_active', true)
          .single()

        if (!kegiatan) {
          return Response.json({ error: 'Kegiatan tidak ditemukan atau tidak aktif' }, { status: 400 })
        }

        const { data, error } = await supabase
          .from('master_kelengkapan_dokumen')
          .insert({
            kegiatan_id: result.data.kegiatanId,
            is_ketua_tim: result.data.isKetuaTim,
            nama_dokumen: result.data.namaDokumen,
            required: result.data.required,
          })
          .select('*, master_kegiatan(nama, master_fungsi(nama))')
          .single()

        if (error) {
          return Response.json({ error: 'Gagal menambah kelengkapan' }, { status: 500 })
        }

        const row = data as any
        return Response.json({
          ...row,
          kegiatan_nama: row.master_kegiatan?.nama,
          fungsi_nama: row.master_kegiatan?.master_fungsi?.nama,
        }, { status: 201 })
      },
    },
  },
})
