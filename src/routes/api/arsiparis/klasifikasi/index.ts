import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession, hasRole } from '#/lib/auth'
import { z } from 'zod'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// Types
export type KlasifikasiNode = {
  id: string
  nama: string
  kode: string | null
  deskripsi: string | null
  parent_id: string | null
  created_at: string
  is_root: boolean
  children: KlasifikasiNode[]
}

// ---------------------------------------------------------------------------
// GET /api/arsiparis/klasifikasi — list semua klasifikasi aktif dalam tree structure
// POST /api/arsiparis/klasifikasi — create klasifikasi baru (ADMIN only)
// ---------------------------------------------------------------------------

const createKlasifikasiSchema = z.object({
  nama: z.string().min(1, 'Nama klasifikasi wajib diisi').max(100),
  deskripsi: z.string().optional(),
  kode: z.string().min(1, 'Kode klasifikasi wajib diisi').max(50),
  parent_id: z.string().uuid().optional().nullable(),
})

function buildTree(items: Omit<KlasifikasiNode, 'children'>[]): KlasifikasiNode[] {
  const map = new Map<string, KlasifikasiNode>()
  const roots: KlasifikasiNode[] = []

  // First pass: create all nodes with empty children arrays
  for (const item of items) {
    map.set(item.id, { ...item, children: [] })
  }

  // Second pass: build tree structure
  for (const item of items) {
    const node = map.get(item.id)!
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  // Sort children by kode or nama
  const sortNodes = (nodes: KlasifikasiNode[]) => {
    nodes.sort((a, b) => {
      const aKey = a.kode || a.nama
      const bKey = b.kode || b.nama
      return aKey.localeCompare(bKey)
    })
    for (const node of nodes) {
      sortNodes(node.children)
    }
  }
  sortNodes(roots)

  return roots
}

export const Route = createFileRoute('/api/arsiparis/klasifikasi/')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const supabase = createClient(request)

        const { data, error } = await supabase
          .from('master_klasifikasi_arsip')
          .select('id, nama, kode, deskripsi, parent_id, created_at, is_active')
          .eq('is_active', true)
          .order('nama', { ascending: true })

        if (error) return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })

        // Mark root node (kode = '000')
        const itemsWithRoot = (data ?? []).map(item => ({
          ...item,
          is_root: item.kode === '000',
        }))

        const tree = buildTree(itemsWithRoot)

        return Response.json({ klasifikasi: tree })
      },

      POST: async ({ request }: { request: Request }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const isAdminOrArsiparis = await hasRole(supabase, session.user.id, 'ADMIN') ||
          await hasRole(supabase, session.user.id, 'ARSIPARIS')
        if (!isAdminOrArsiparis) return Response.json({ error: 'Hanya ADMIN atau ARSIPARIS yang bisa menambah klasifikasi' }, { status: 403 })

        const body = await request.json().catch(() => null)
        if (!body) return Response.json({ error: 'Body tidak valid' }, { status: 400 })

        const parsed = createKlasifikasiSchema.safeParse(body)
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })

        // Cek duplikat nama
        const { data: existingName } = await supabase
          .from('master_klasifikasi_arsip')
          .select('id')
          .eq('nama', parsed.data.nama)
          .eq('is_active', true)
          .single()

        if (existingName) return Response.json({ error: `Nama klasifikasi "${parsed.data.nama}" sudah ada` }, { status: 409 })

        // Cek duplikat kode
        if (parsed.data.kode) {
          const { data: existingKode } = await supabase
            .from('master_klasifikasi_arsip')
            .select('id')
            .eq('kode', parsed.data.kode)
            .eq('is_active', true)
            .single()

          if (existingKode) return Response.json({ error: `Kode klasifikasi "${parsed.data.kode}" sudah ada` }, { status: 409 })
        }

        // Validate parent exists if provided
        if (parsed.data.parent_id) {
          const { data: parent } = await supabase
            .from('master_klasifikasi_arsip')
            .select('id, kode')
            .eq('id', parsed.data.parent_id)
            .eq('is_active', true)
            .single()

          if (!parent) return Response.json({ error: 'Induk klasifikasi tidak ditemukan' }, { status: 400 })

          // Prevent adding as child of root if parent is root
          // Actually, root can have children, so this is fine
        }

        const { data, error } = await supabase
          .from('master_klasifikasi_arsip')
          .insert({
            nama: parsed.data.nama,
            deskripsi: parsed.data.deskripsi ?? null,
            kode: parsed.data.kode,
            parent_id: parsed.data.parent_id ?? null,
          })
          .select()
          .single()

        if (error) return Response.json({ error: 'Gagal membuat klasifikasi: ' + error.message }, { status: 500 })

        return Response.json(data, { status: 201 })
      },
    },
  },
})