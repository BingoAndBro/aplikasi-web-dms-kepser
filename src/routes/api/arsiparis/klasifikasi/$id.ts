import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { db } from '#/db/client'
import { masterKlasifikasiArsip } from '#/db/schema/arsip'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { ROLES } from '#/lib/constants/roles'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// PATCH /api/arsiparis/klasifikasi/$id — update klasifikasi
// DELETE /api/arsiparis/klasifikasi/$id — soft delete klasifikasi
// ---------------------------------------------------------------------------

const updateKlasifikasiSchema = z.object({
  nama: z.string().min(1).max(100).optional(),
  deskripsi: z.string().nullable().optional(),
  kode: z.string().min(1).max(50).optional(),
  parent_id: z.string().uuid().nullable().optional(),
})

async function requireKepalaSubBagianUmum(request: Request, action: 'mengubah' | 'menghapus') {
  const session = await getLocalServerSession(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasLocalRole(session, ROLES.KEPALA_SUB_BAGIAN_UMUM)) {
    return Response.json({ error: `Hanya Kepala Sub Bagian Umum yang bisa ${action} klasifikasi` }, { status: 403 })
  }
  return null
}

function conflictResponse(error: string): Response {
  return Response.json({ error }, { status: 409 })
}

type UniqueViolationField = 'kode' | 'nama' | 'unknown'

function classifyUniqueViolation(error: unknown): UniqueViolationField | null {
  if (!error || typeof error !== 'object') return null

  const candidate = error as {
    code?: unknown
    constraint?: unknown
    detail?: unknown
  }

  if (candidate.code !== '23505') return null

  const constraint = typeof candidate.constraint === 'string' ? candidate.constraint.toLowerCase() : ''
  if (constraint.includes('kode')) return 'kode'
  if (constraint.includes('nama')) return 'nama'

  const detail = typeof candidate.detail === 'string' ? candidate.detail.toLowerCase() : ''
  if (/\(kode\)/.test(detail)) return 'kode'
  if (/\(nama\)/.test(detail)) return 'nama'

  return 'unknown'
}

function uniqueViolationMessage(field: UniqueViolationField): string {
  if (field === 'kode') return 'Kode klasifikasi sudah digunakan.'
  if (field === 'nama') return 'Nama klasifikasi sudah digunakan.'
  return 'Klasifikasi dengan kode atau nama tersebut sudah ada.'
}

function toSafeErrorLog(error: unknown, conflictType?: UniqueViolationField): Record<string, unknown> {
  if (!error || typeof error !== 'object') {
    return { type: typeof error, conflictType }
  }

  const candidate = error as {
    code?: unknown
    name?: unknown
  }

  return {
    name: typeof candidate.name === 'string' ? candidate.name : undefined,
    code: typeof candidate.code === 'string' ? candidate.code : undefined,
    conflictType,
  }
}

// Helper: get all descendant IDs of a node (for cascade soft delete)
async function getDescendantIds(nodeId: string): Promise<string[]> {
  const descendants: string[] = []
  const queue = [nodeId]

  while (queue.length > 0) {
    const currentId = queue.shift()!
    const children = await db
      .select({ id: masterKlasifikasiArsip.id })
      .from(masterKlasifikasiArsip)
      .where(and(
        eq(masterKlasifikasiArsip.parentId, currentId),
        eq(masterKlasifikasiArsip.isActive, true),
      ))

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
async function isDescendantOf(targetId: string, ancestorId: string): Promise<boolean> {
  const descendants = await getDescendantIds(targetId)
  return descendants.includes(ancestorId)
}

export const Route = createFileRoute('/api/arsiparis/klasifikasi/$id')({
  server: {
    handlers: {
      PATCH: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        const authError = await requireKepalaSubBagianUmum(request, 'mengubah')
        if (authError) return authError

        const body = await request.json().catch(() => null)
        if (!body) return Response.json({ error: 'Body tidak valid' }, { status: 400 })

        const parsed = updateKlasifikasiSchema.safeParse(body)
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })

        try {
          // Verify exists and get current data
          const [existing] = await db
            .select({
              id: masterKlasifikasiArsip.id,
              nama: masterKlasifikasiArsip.nama,
              kode: masterKlasifikasiArsip.kode,
            })
            .from(masterKlasifikasiArsip)
            .where(and(
              eq(masterKlasifikasiArsip.id, params.id),
              eq(masterKlasifikasiArsip.isActive, true),
            ))
            .limit(1)

          if (!existing) return Response.json({ error: 'Klasifikasi tidak ditemukan' }, { status: 404 })

          // Prevent modifying root "000"
          if (existing.kode === '000') {
            // Only allow updating deskripsi for root
            if (parsed.data.nama || parsed.data.kode || parsed.data.parent_id !== undefined) {
              return Response.json({ error: 'Klasifikasi root tidak bisa diubah' }, { status: 403 })
            }
          }

          // Cek nama unique jika diupdate
          if (parsed.data.nama && parsed.data.nama !== existing.nama) {
            const [duplicate] = await db
              .select({ id: masterKlasifikasiArsip.id })
              .from(masterKlasifikasiArsip)
              .where(and(
                eq(masterKlasifikasiArsip.nama, parsed.data.nama),
                eq(masterKlasifikasiArsip.isActive, true),
                ne(masterKlasifikasiArsip.id, params.id),
              ))
              .limit(1)

            if (duplicate) return conflictResponse('Nama klasifikasi sudah digunakan.')
          }

          // Cek kode unique jika diupdate
          if (parsed.data.kode && parsed.data.kode !== existing.kode) {
            const [duplicateKode] = await db
              .select({ id: masterKlasifikasiArsip.id })
              .from(masterKlasifikasiArsip)
              .where(and(
                eq(masterKlasifikasiArsip.kode, parsed.data.kode),
                eq(masterKlasifikasiArsip.isActive, true),
                ne(masterKlasifikasiArsip.id, params.id),
              ))
              .limit(1)

            if (duplicateKode) return conflictResponse('Kode klasifikasi sudah digunakan.')
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
              const isCircular = await isDescendantOf(params.id, parsed.data.parent_id)
              if (isCircular) {
                return Response.json({ error: 'Tidak bisa memindahkan ke subclass-nya sendiri (circular reference)' }, { status: 400 })
              }
            }

            // Verify parent exists
            const [parent] = await db
              .select({ id: masterKlasifikasiArsip.id })
              .from(masterKlasifikasiArsip)
              .where(and(
                eq(masterKlasifikasiArsip.id, parsed.data.parent_id),
                eq(masterKlasifikasiArsip.isActive, true),
              ))
              .limit(1)

            if (!parent) return Response.json({ error: 'Induk klasifikasi tidak ditemukan' }, { status: 400 })
          }

          const updateData: Partial<typeof masterKlasifikasiArsip.$inferInsert> = {}
          if (parsed.data.nama !== undefined) updateData.nama = parsed.data.nama
          if (parsed.data.deskripsi !== undefined) updateData.deskripsi = parsed.data.deskripsi
          if (parsed.data.kode !== undefined) updateData.kode = parsed.data.kode
          if (parsed.data.parent_id !== undefined) updateData.parentId = parsed.data.parent_id

          const [data] = await db
            .update(masterKlasifikasiArsip)
            .set(updateData)
            .where(eq(masterKlasifikasiArsip.id, params.id))
            .returning({
              id: masterKlasifikasiArsip.id,
              nama: masterKlasifikasiArsip.nama,
              deskripsi: masterKlasifikasiArsip.deskripsi,
              is_active: masterKlasifikasiArsip.isActive,
              created_at: masterKlasifikasiArsip.createdAt,
              parent_id: masterKlasifikasiArsip.parentId,
              kode: masterKlasifikasiArsip.kode,
            })

          if (!data) return Response.json({ error: 'Gagal memperbarui klasifikasi' }, { status: 500 })

          return Response.json(data)
        } catch (err) {
          const uniqueViolationField = classifyUniqueViolation(err)
          if (uniqueViolationField) {
            console.warn('[arsiparis/klasifikasi/$id] PATCH unique constraint conflict:', toSafeErrorLog(err, uniqueViolationField))
            return conflictResponse(uniqueViolationMessage(uniqueViolationField))
          }

          console.error('[arsiparis/klasifikasi/$id] PATCH local query error:', toSafeErrorLog(err))
          return Response.json({ error: 'Gagal memperbarui klasifikasi' }, { status: 500 })
        }
      },

      DELETE: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        const authError = await requireKepalaSubBagianUmum(request, 'menghapus')
        if (authError) return authError

        try {
          // Verify exists and check if root
          const [existing] = await db
            .select({ id: masterKlasifikasiArsip.id, kode: masterKlasifikasiArsip.kode })
            .from(masterKlasifikasiArsip)
            .where(and(
              eq(masterKlasifikasiArsip.id, params.id),
              eq(masterKlasifikasiArsip.isActive, true),
            ))
            .limit(1)

          if (!existing) return Response.json({ error: 'Klasifikasi tidak ditemukan' }, { status: 404 })

          // Prevent deleting root "000"
          if (existing.kode === '000') {
            return Response.json({ error: 'Klasifikasi root tidak bisa dihapus' }, { status: 403 })
          }

          // Get all descendants to cascade soft delete
          const descendantIds = await getDescendantIds(params.id)
          const allIdsToDelete = [params.id, ...descendantIds]

          // Soft delete all
          await db
            .update(masterKlasifikasiArsip)
            .set({ isActive: false })
            .where(inArray(masterKlasifikasiArsip.id, allIdsToDelete))

          const deletedCount = allIdsToDelete.length
          return Response.json({
            success: true,
            message: deletedCount > 1
              ? `Klasifikasi dan ${deletedCount - 1} subclass berhasil dinonaktifkan`
              : 'Klasifikasi berhasil dinonaktifkan',
            deleted_count: deletedCount,
          })
        } catch (err) {
          console.error('[arsiparis/klasifikasi/$id] DELETE local query error:', err)
          return Response.json({ error: 'Gagal menghapus klasifikasi' }, { status: 500 })
        }
      },
    },
  },
})
