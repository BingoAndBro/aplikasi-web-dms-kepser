import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession } from '#/lib/auth'
import { updateNominalSchema, validateNominalForMaterial } from '#/lib/schemas/dokumen'
import { insertLog } from '#/lib/dokumen-helpers'

// ---------------------------------------------------------------------------
// PATCH /api/dokumen/$id/nominal — Update nominal_realisasi
// Allowed: creator, arsiparis, SUPERADMIN/ADMIN
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/dokumen/$id/nominal')({
  server: {
    handlers: {
      PATCH: async ({ request, params }: { request: Request; params: { id: string } }) => {
        // 1. Auth check
        const cookieHeader = request.headers.get('cookie')
        const mockEvent = {
          request,
          cookie: { get: () => undefined, set: () => {}, delete: () => {} },
        } as any
        const supabase = createServerSupabaseClient(mockEvent, cookieHeader)
        const session = await getServerSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // 2. Get dokumen
        const { data: dok } = await supabase
          .from('dokumen_transaksi')
          .select('id, created_by, status, is_non_material, nominal_realisasi')
          .eq('id', params.id)
          .single()

        if (!dok) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        // 3. Authorization check
        const { data: rolesData } = await supabase
          .from('user_roles')
          .select('role:roles(nama)')
          .eq('user_id', session.user.id)

        const roleNames = (rolesData ?? [])
          .map((r: any) => r.role?.nama as string | undefined)
          .filter(Boolean) as string[]

        const isCreator = dok.created_by === session.user.id
        const isArsiparis = roleNames.includes('ARSIPARIS')
        const isAdmin = roleNames.includes('SUPERADMIN') || roleNames.includes('ADMIN')

        if (!isCreator && !isArsiparis && !isAdmin) {
          return Response.json({ error: 'Akses ditolak' }, { status: 403 })
        }

        // 4. Parse body
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const parsed = updateNominalSchema.safeParse(body)
        if (!parsed.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: parsed.error.flatten(),
          }, { status: 400 })
        }

        // 5. Check status — archived documents cannot be updated
        if (dok.status === 'ARCHIVED') {
          return Response.json(
            { error: 'Tidak bisa update dokumen yang sudah diarsipkan' },
            { status: 400 }
          )
        }

        // 6. Validate material requirement
        const isNonMaterial = parsed.data.is_non_material ?? dok.is_non_material
        const nominalRealisasi = parsed.data.nominal_realisasi ?? dok.nominal_realisasi

        const validation = validateNominalForMaterial(isNonMaterial, nominalRealisasi)
        if (!validation.valid) {
          return Response.json({ error: validation.error }, { status: 400 })
        }

        // 7. Update
        const updatePayload: Record<string, unknown> = {}
        if (parsed.data.nominal_realisasi !== undefined) {
          updatePayload.nominal_realisasi = parsed.data.nominal_realisasi
        }
        if (parsed.data.is_non_material !== undefined) {
          updatePayload.is_non_material = parsed.data.is_non_material
        }

        // Nothing to update
        if (Object.keys(updatePayload).length === 0) {
          return Response.json({ success: true, message: 'Tidak ada perubahan' })
        }

        const { error } = await supabase
          .from('dokumen_transaksi')
          .update(updatePayload)
          .eq('id', params.id)

        if (error) {
          console.error('[dokumen-nominal] update error:', error)
          return Response.json({ error: 'Update gagal' }, { status: 500 })
        }

        // 8. Log aktivitas
        await insertLog(supabase, {
          dokumenId: params.id,
          userId: session.user.id,
          aksi: 'UPDATE_NOMINAL',
          catatan: `Update nominal: ${nominalRealisasi}`,
        })

        return Response.json({ success: true })
      },
    },
  },
})