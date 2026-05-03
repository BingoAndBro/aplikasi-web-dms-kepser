import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession, hasRole } from '#/lib/auth'
import { z } from 'zod'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// PATCH /api/arsiparis/klasifikasi/$id — update klasifikasi (ADMIN only)
// DELETE /api/arsiparis/klasifikasi/$id — soft delete klasifikasi (ADMIN only)
// ---------------------------------------------------------------------------

const updateKlasifikasiSchema = z.object({
  nama: z.string().min(1).max(100).optional(),
  deskripsi: z.string().nullable().optional(),
  kode: z.string().min(1).max(50).optional(),
  parent_id: z.string().uuid().nullable().optional(),
})

// Helper: get all descendant IDs of a node (for cascade soft delete)
async function getDescendantIds(supabase: any, nodeId: string): Promise<string[]> {
  const descendants: string[] = []
  const queue = [nodeId]

  while (queue.length > 0) {
    const currentId = queue.shift()!
    const { data: children } = await supabase
      .from('master_klasifikasi_arsip')
      .select('id')
      .eq('parent_id', currentId)
      .eq('is_active', true)

    if (children) {
      for (const child of children) {
        descendants.push(child.id)
        queue.push(child.id)
      }
    }
  }

  return descendants
}

// Helper: check if targetId is a descendant of ancestorId
async function isDescendantOf(supabase: any, targetId: string, ancestorId: string): Promise<boolean> {
  const descendants = await getDescendantIds(supabase, targetId)
  return descendants.includes(ancestorId)
}

export const Route = createFileRoute('/api/arsiparis/klasifikasi/$id')({
  server: {
    handlers: {
      PATCH: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const isAdminOrArsiparis = (await hasRole(supabase, session.user.id, 'ADMIN')) ||
          (await hasRole(supabase, session.user.id, 'ARSIPARIS'))
        if (!isAdminOrArsiparis) return Response.json({ error: 'Hanya ADMIN atau ARSIPARIS yang bisa mengubah klasifikasi' }, { status: 403 })

        const body = await request.json().catch(() => null)
        if (!body) return Response.json({ error: 'Body tidak valid' }, { status: 400 })

        const parsed = updateKlasifikasiSchema.safeParse(body)
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })

        // Verify exists and get current data
        const { data: existing, error: existError } = await supabase
          .from('master_klasifikasi_arsip')
          .select('id, nama, kode')
          .eq('id', params.id)
          .eq('is_active', true)
          .single()

        if (existError || !existing) return Response.json({ error: 'Klasifikasi tidak ditemukan' }, { status: 404 })

        // Prevent modifying root "000"
        if (existing.kode === '000') {
          // Only allow updating deskripsi for root
          if (parsed.data.nama || parsed.data.kode || parsed.data.parent_id !== undefined) {
            return Response.json({ error: 'Klasifikasi root tidak bisa diubah' }, { status: 403 })
          }
        }

        // Cek nama unique jika diupdate
        if (parsed.data.nama && parsed.data.nama !== existing.nama) {
          const { data: duplicate } = await supabase
            .from('master_klasifikasi_arsip')
            .select('id')
            .eq('nama', parsed.data.nama)
            .eq('is_active', true)
            .neq('id', params.id)
            .single()

          if (duplicate) return Response.json({ error: "Nama klasifikasi `" + parsed.data.nama + "` sudah ada" }, { status: 409 })
        }

        // Cek kode unique jika diupdate
        if (parsed.data.kode && parsed.data.kode !== existing.kode) {
          const { data: duplicateKode } = await supabase
            .from('master_klasifikasi_arsip')
            .select('id')
            .eq('kode', parsed.data.kode)
            .eq('is_active', true)
            .neq('id', params.id)
            .single()

          if (duplicateKode) return Response.json({ error: "Kode klasifikasi `" + parsed.data.kode + "` sudah ada" }, { status: 409 })
        }

        // Validate parent_id if changing
        if (parsed.data.parent_id !== undefined) {
          // Cannot move to root (parent_id = null) - root "000" is fixed
          if (parsed.data.parent_id === null) {
            return Response.json({ error: 'Tidak bisa memindahkan ke root. Gunakan induk lain.' }, { status: 400 })
          }

          // Cannot be own parent
          if (parsed.data.parent_id === params.id) {
            return Response.json({ error: 'Tidak bisa memilih diri sendiri sebagai induk' }, { status: 400 })
          }

          // Check circular reference - cannot move to own descendant
          if (parsed.data.parent_id) {
            const isCircular = await isDescendantOf(supabase, params.id, parsed.data.parent_id)
            if (isCircular) {
              return Response.json({ error: 'Tidak bisa memindahkan ke subclass-nya sendiri (circular reference)' }, { status: 400 })
            }
          }

          // Verify parent exists
          const { data: parent } = await supabase
            .from('master_klasifikasi_arsip')
            .select('id')
            .eq('id', parsed.data.parent_id)
            .eq('is_active', true)
            .single()

          if (!parent) return Response.json({ error: 'Induk klasifikasi tidak ditemukan' }, { status: 400 })
        }

        const updateData: Record<string, unknown> = {}
        if (parsed.data.nama !== undefined) updateData.nama = parsed.data.nama
        if (parsed.data.deskripsi !== undefined) updateData.deskripsi = parsed.data.deskripsi
        if (parsed.data.kode !== undefined) updateData.kode = parsed.data.kode
        if (parsed.data.parent_id !== undefined) updateData.parent_id = parsed.data.parent_id

        const { data, error } = await supabase
          .from('master_klasifikasi_arsip')
          .update(updateData)
          .eq('id', params.id)
          .select()
          .single()

        if (error) return Response.json({ error: 'Gagal memperbarui klasifikasi: ' + error.message }, { status: 500 })

        return Response.json(data)
      },

      DELETE: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const isAdminOrArsiparis = (await hasRole(supabase, session.user.id, 'ADMIN')) ||
          (await hasRole(supabase, session.user.id, 'ARSIPARIS'))
        if (!isAdminOrArsiparis) return Response.json({ error: 'Hanya ADMIN atau ARSIPARIS yang bisa menghapus klasifikasi' }, { status: 403 })

        // Verify exists and check if root
        const { data: existing } = await supabase
          .from('master_klasifikasi_arsip')
          .select('id, kode')
          .eq('id', params.id)
          .eq('is_active', true)
          .single()

        if (!existing) return Response.json({ error: 'Klasifikasi tidak ditemukan' }, { status: 404 })

        // Prevent deleting root "000"
        if (existing.kode === '000') {
          return Response.json({ error: 'Klasifikasi root tidak bisa dihapus' }, { status: 403 })
        }

        // Get all descendants to cascade soft delete
        const descendantIds = await getDescendantIds(supabase, params.id)
        const allIdsToDelete = [params.id, ...descendantIds]

        // Soft delete all
        const { error } = await supabase
          .from('master_klasifikasi_arsip')
          .update({ is_active: false })
          .in('id', allIdsToDelete)

        if (error) return Response.json({ error: 'Gagal menghapus klasifikasi: ' + error.message }, { status: 500 })

        const deletedCount = allIdsToDelete.length
        return Response.json({
          success: true,
          message: deletedCount > 1
            ? `Klasifikasi dan ${deletedCount - 1} subclass berhasil dinonaktifkan`
            : 'Klasifikasi berhasil dinonaktifkan',
          deleted_count: deletedCount,
        })
      },
    },
  },
})