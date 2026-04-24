import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession } from '#/lib/auth'
import { transition } from '#/lib/fsm'
import { insertLog } from '#/lib/dokumen-helpers'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// POST /api/arsiparis/dokumen/[id]/archive — arsipkan dokumen
// ---------------------------------------------------------------------------

const RETENSI_OPTIONS = ['1 Tahun', '3 Tahun', '5 Tahun', '10 Tahun', 'Permanen'] as const

export const Route = createFileRoute('/api/arsiparis/dokumen/$id/archive')({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        // Role check
        const { data: rolesData } = await supabase.from('user_roles').select('role:roles(nama)').eq('user_id', session.user.id)
        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('ARSIPARIS')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        // Validate body
        const body = await request.json().catch(() => null)
        if (!body) return Response.json({ error: 'Body tidak valid' }, { status: 400 })

        const schema = z.object({
          nomor_surat: z.string().min(1, 'Nomor surat wajib diisi'),
          klasifikasi: z.string().min(1, 'Klasifikasi wajib diisi'),
          retensi_aktif: z.enum(RETENSI_OPTIONS, { errorMap: () => ({ message: 'Retensi aktif tidak valid' }) }),
          retensi_inaktif: z.enum(RETENSI_OPTIONS, { errorMap: () => ({ message: 'Retensi inaktif tidak valid' }) }),
          masa_aktif_berakhir: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD'),
          masa_inaktif_berakhir: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD'),
          catatan_arsiparis: z.string().optional(),
        })

        const parsed = schema.safeParse(body)
        if (!parsed.success) {
          return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
        }

        const data = parsed.data

        // Verify dokumen exists + status = COMPLETED
        const { data: dok, error: dokError } = await supabase
          .from('dokumen_transaksi')
          .select('id, status')
          .eq('id', params.id)
          .single()

        if (dokError || !dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        if (dok.status !== 'COMPLETED') return Response.json({ error: 'Dokumen belum berada di tahap final' }, { status: 400 })

        // Check belum diarsipkan
        const { data: existingArsip } = await supabase
          .from('arsip')
          .select('id')
          .eq('dokumen_id', params.id)
          .single()

        if (existingArsip) return Response.json({ error: 'Dokumen sudah diarsipkan' }, { status: 400 })

        // FSM transition: COMPLETED → ARCHIVED
        const fsResult = transition(dok.status, 'ARCHIVE', 'ARSIPARIS')
        if (!fsResult.success) {
          return Response.json({ error: fsResult.error ?? 'Transisi status gagal' }, { status: 400 })
        }

        // Insert arsip record
        const { error: arsipError } = await supabase.from('arsip').insert({
          dokumen_id: params.id,
          nomor_surat: data.nomor_surat,
          klasifikasi: data.klasifikasi,
          retensi_aktif: data.retensi_aktif,
          retensi_inaktif: data.retensi_inaktif,
          masa_aktif_berakhir: data.masa_aktif_berakhir,
          masa_inaktif_berakhir: data.masa_inaktif_berakhir,
          catatan_arsiparis: data.catatan_arsiparis ?? null,
          archived_by: session.user.id,
          status_arsip: 'AKTIF',
        })

        if (arsipError) {
          console.error('[archive] arsip insert error:', arsipError)
          return Response.json({ error: 'Gagal mengarsipkan dokumen' }, { status: 500 })
        }

        // Update dokumen status via FSM
        const { error: updateError } = await supabase
          .from('dokumen_transaksi')
          .update({ status: fsResult.newStatus })
          .eq('id', params.id)

        if (updateError) {
          console.error('[archive] status update error:', updateError)
          return Response.json({ error: 'Gagal memperbarui status dokumen' }, { status: 500 })
        }

        // Insert log
        await insertLog(supabase, {
          dokumenId: params.id,
          userId: session.user.id,
          aksi: 'ARCHIVE',
          catatan: data.catatan_arsiparis ?? null,
          stepUrutan: null,
        })

        return Response.json({ success: true, message: 'Dokumen berhasil diarsipkan' })
      },
    },
  },
})