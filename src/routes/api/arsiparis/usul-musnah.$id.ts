import { createFileRoute } from '@tanstack/react-router'
import { eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db/client'
import { users } from '#/db/schema/auth'
import { arsip as arsipTable, arsipUsulMusnah } from '#/db/schema/arsip'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  masterDetailPermintaan,
  masterFungsi,
  masterJenisPermintaan,
  masterKategoriPermintaan,
  masterKegiatan,
} from '#/db/schema/master'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession as getSession } from '#/lib/auth'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { insertLog } from '#/lib/dokumen-helpers'
import type { LampiranUrl } from '#/lib/dokumen-helpers'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function parseLampiranSnapshot(value: unknown): LampiranUrl[] {
  if (!value) return []
  if (Array.isArray(value)) return value as LampiranUrl[]
  if (typeof value !== 'string') return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as LampiranUrl[] : []
  } catch {
    return []
  }
}

function displayUserName(user: {
  displayName: string | null
  namaLengkap: string | null
  email: string | null
} | null): string {
  return user?.displayName
    ?? user?.namaLengkap
    ?? user?.email
    ?? '\u2014'
}

// ---------------------------------------------------------------------------
// GET  /api/arsiparis/usul-musnah/[id]   - detail usul musnah
// PATCH /api/arsiparis/usul-musnah/[id]  - setuju musnah (destroy)
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/arsiparis/usul-musnah/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        if (!hasLocalRole(session, 'ARSIPARIS')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        if (!isUuid(params.id)) return Response.json({ error: 'Usul musnah tidak ditemukan' }, { status: 404 })

        try {
          const rows = await db
            .select({
              musnah_id: arsipUsulMusnah.id,
              musnah_arsip_id: arsipUsulMusnah.arsipId,
              musnah_status: arsipUsulMusnah.status,
              musnah_catatan: arsipUsulMusnah.catatan,
              musnah_created_at: arsipUsulMusnah.createdAt,
              diusulkan_oleh: arsipUsulMusnah.diusulkanOleh,
              arsip_id: arsipTable.id,
              nomor_surat: arsipTable.nomorSurat,
              klasifikasi: arsipTable.klasifikasi,
              retensi_aktif: arsipTable.retensiAktif,
              retensi_inaktif: arsipTable.retensiInaktif,
              masa_aktif_berakhir: arsipTable.masaAktifBerakhir,
              masa_inaktif_berakhir: arsipTable.masaInaktifBerakhir,
              status_arsip: arsipTable.statusArsip,
              archived_at: arsipTable.archivedAt,
              archived_by: arsipTable.archivedBy,
              lampiran_snapshot: arsipTable.lampiranSnapshot,
              musnah_at: arsipTable.musnahAt,
              musnah_by: arsipTable.musnahBy,
              arsip_musnah_catatan: arsipTable.musnahCatatan,
              dokumen_id: dokumenTransaksi.id,
              judul: dokumenTransaksi.judul,
              fungsi_nama: masterFungsi.nama,
              kegiatan_nama: masterKegiatan.nama,
              jenis_permintaan_nama: masterJenisPermintaan.nama,
              kategori_permintaan_nama: masterKategoriPermintaan.nama,
              detail_permintaan_nama: masterDetailPermintaan.nama,
              tahun: dokumenTransaksi.tahun,
            })
            .from(arsipUsulMusnah)
            .innerJoin(arsipTable, eq(arsipUsulMusnah.arsipId, arsipTable.id))
            .leftJoin(dokumenTransaksi, eq(arsipTable.dokumenId, dokumenTransaksi.id))
            .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .leftJoin(masterJenisPermintaan, eq(dokumenTransaksi.jenisPermintaanId, masterJenisPermintaan.id))
            .leftJoin(masterKategoriPermintaan, eq(dokumenTransaksi.kategoriPermintaanId, masterKategoriPermintaan.id))
            .leftJoin(masterDetailPermintaan, eq(dokumenTransaksi.detailPermintaanId, masterDetailPermintaan.id))
            .where(eq(arsipUsulMusnah.id, params.id))
            .limit(1)

          const row = rows[0]
          if (!row) return Response.json({ error: 'Usul musnah tidak ditemukan' }, { status: 404 })

          const userIds = [
            row.diusulkan_oleh,
            row.archived_by,
            row.musnah_by,
          ].filter(Boolean) as string[]
          const userRows = userIds.length > 0
            ? await db
                .select({
                  id: users.id,
                  displayName: users.displayName,
                  namaLengkap: users.namaLengkap,
                  email: users.email,
                })
                .from(users)
                .where(inArray(users.id, userIds))
            : []
          const userMap = new Map(userRows.map((user) => [user.id, user]))

          return Response.json({
            musnah: {
              id: row.musnah_id,
              arsip_id: row.musnah_arsip_id,
              status: row.musnah_status,
              catatan: row.musnah_catatan,
              created_at: row.musnah_created_at,
              diusulkan_oleh: row.diusulkan_oleh,
              diusulkan_oleh_nama: displayUserName(row.diusulkan_oleh ? userMap.get(row.diusulkan_oleh) ?? null : null),
            },
            arsip: {
              id: row.arsip_id,
              nomor_surat: row.nomor_surat ?? '\u2014',
              klasifikasi: row.klasifikasi ?? '\u2014',
              retensi_aktif: row.retensi_aktif ?? '\u2014',
              retensi_inaktif: row.retensi_inaktif ?? '\u2014',
              masa_aktif_berakhir: row.masa_aktif_berakhir,
              masa_inaktif_berakhir: row.masa_inaktif_berakhir,
              status_arsip: row.status_arsip,
              archived_at: row.archived_at,
              archived_by: row.archived_by,
              archived_by_nama: displayUserName(row.archived_by ? userMap.get(row.archived_by) ?? null : null),
              dokumen_id: row.dokumen_id ?? '\u2014',
              lampiran_urls: parseLampiranSnapshot(row.lampiran_snapshot),
              lampiran_snapshot: row.lampiran_snapshot,
              musnah_at: row.musnah_at,
              musnah_by: row.musnah_by,
              musnah_by_nama: row.musnah_by ? displayUserName(userMap.get(row.musnah_by) ?? null) : '\u2014',
              musnah_catatan: row.arsip_musnah_catatan,
              dokumen: row.dokumen_id ? {
                id: row.dokumen_id,
                judul: row.judul,
                fungsi_nama: row.fungsi_nama ?? '\u2014',
                kegiatan_nama: row.kegiatan_nama ?? '\u2014',
                jenis_permintaan: row.jenis_permintaan_nama ?? '\u2014',
                kategori_permintaan: row.kategori_permintaan_nama ?? '\u2014',
                detail_permintaan: row.detail_permintaan_nama ?? '\u2014',
                tahun: row.tahun,
              } : null,
            },
          })
        } catch (err) {
          console.error('[usul-musnah/:id] GET local query error:', err)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }
      },

      PATCH: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: rolesData } = await supabase.from('user_roles').select('role:roles(nama)').eq('user_id', session.user.id)
        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('ARSIPARIS')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        const body = await request.json().catch(() => null)
        if (!body) return Response.json({ error: 'Body tidak valid' }, { status: 400 })

        const parsed = z.object({
          aksi: z.literal('SETUJUI', { message: 'Aksi harus SETUJUI' }),
        }).safeParse(body)

        if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })

        const { data: musnah, error: musnahError } = await supabase
          .from('arsip_usul_musnah')
          .select('id, arsip_id, status, catatan')
          .eq('id', params.id)
          .single()

        if (musnahError || !musnah) return Response.json({ error: 'Usul musnah tidak ditemukan' }, { status: 404 })
        if (musnah.status !== 'MENUNGGU') return Response.json({ error: 'Usul musnah sudah diputuskan' }, { status: 400 })

        const { data: arsip, error: arsipError } = await supabase
          .from('arsip')
          .select('id, dokumen_id, lampiran_snapshot')
          .eq('id', musnah.arsip_id)
          .single()

        if (arsipError || !arsip) return Response.json({ error: 'Arsip tidak ditemukan' }, { status: 404 })

        let lampiranUrls: LampiranUrl[] = []
        if (arsip.lampiran_snapshot) {
          lampiranUrls = typeof arsip.lampiran_snapshot === 'string' ? JSON.parse(arsip.lampiran_snapshot) : arsip.lampiran_snapshot
        }

        const { error: updateMusnahError } = await supabase
          .from('arsip_usul_musnah')
          .update({
            status: 'DISETUJUI',
            decided_by: session.user.id,
            decided_at: new Date().toISOString(),
          })
          .eq('id', musnah.id)

        if (updateMusnahError) {
          console.error('[usul-musnah-patch] update musnah error:', updateMusnahError)
          return Response.json({ error: 'Gagal memperbarui usul musnah' }, { status: 500 })
        }

        const supabaseAdmin = createAdminClient()
        for (const lamp of lampiranUrls) {
          try {
            await supabaseAdmin.storage.from('dokumen-lampiran').remove([lamp.url])
          } catch (e) {
            console.warn('[usul-musnah-patch] file deletion warning:', e)
          }
        }

        const { error: updateArsipError } = await supabase.from('arsip').update({
          status_arsip: 'DIMUSNAHKAN',
          lampiran_snapshot: [],
          musnah_at: new Date().toISOString(),
          musnah_by: session.user.id,
          musnah_catatan: musnah.catatan ?? null,
        }).eq('id', arsip.id)

        if (updateArsipError) {
          console.error('[usul-musnah-patch] update arsip error:', updateArsipError)
          return Response.json({ error: 'Gagal memperbarui status arsip' }, { status: 500 })
        }

        await insertLog(supabase, {
          dokumenId: arsip.dokumen_id,
          userId: session.user.id,
          aksi: 'USUL_MUSNAH_SETUJUI',
          catatan: null,
          stepUrutan: null,
        })

        return Response.json({ success: true, message: 'Arsip berhasil dimusnahkan' })
      },
    },
  },
})
