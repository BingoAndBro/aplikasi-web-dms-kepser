import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { berkasArsip, masterKlasifikasiArsip } from '#/db/schema/arsip'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { filterKlasifikasiTreeForBerkasSelection } from '#/lib/archive/berkas-klasifikasi-eligibility'
import { ROLES } from '#/lib/constants/roles'
import { z } from 'zod'

// Types
export type KlasifikasiNode = {
  id: string
  nama: string
  kode: string | null
  deskripsi: string | null
  parent_id: string | null
  created_at: string
  is_active: boolean
  is_root: boolean
  children: KlasifikasiNode[]
}

// ---------------------------------------------------------------------------
// GET /api/kasubag/klasifikasi — list semua klasifikasi aktif dalam tree structure
// POST /api/kasubag/klasifikasi — create klasifikasi baru
// ---------------------------------------------------------------------------

const createKlasifikasiSchema = z.object({
  nama: z.string().min(1, 'Nama klasifikasi wajib diisi').max(100),
  deskripsi: z.string().optional(),
  kode: z.string().min(1, 'Kode klasifikasi wajib diisi').max(50),
  parent_id: z.string().uuid().optional().nullable(),
})

async function requireKepalaSubBagianUmum(request: Request) {
  const session = await getLocalServerSession(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasLocalRole(session, ROLES.KEPALA_SUB_BAGIAN_UMUM)) {
    return Response.json({ error: 'Hanya Kepala Sub Bagian Umum yang bisa menambah klasifikasi' }, { status: 403 })
  }
  return null
}

function conflictResponse(error: string): Response {
  return Response.json({ error }, { status: 409 })
}

function classifyUniqueViolation(error: unknown): 'kode' | 'nama' | 'unknown' | null {
  if (!error || typeof error !== 'object') return null

  const candidate = error as {
    code?: unknown
    constraint?: unknown
  }

  if (candidate.code !== '23505') return null

  const constraint = typeof candidate.constraint === 'string' ? candidate.constraint : ''

  if (constraint.includes('idx_master_klasifikasi_kode_unique')) return 'kode'
  if (constraint.includes('master_klasifikasi_arsip_nama_unique')) return 'nama'

  return 'unknown'
}

function uniqueViolationMessage(field: 'kode' | 'nama' | 'unknown'): string {
  if (field === 'kode') return 'Kode klasifikasi sudah digunakan.'
  if (field === 'nama') return 'Nama klasifikasi sudah digunakan.'
  return 'Klasifikasi dengan kode atau nama tersebut sudah ada.'
}

function toSafeErrorLog(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== 'object') {
    return { type: typeof error }
  }

  const candidate = error as {
    code?: unknown
    constraint?: unknown
    name?: unknown
  }

  return {
    name: typeof candidate.name === 'string' ? candidate.name : undefined,
    code: typeof candidate.code === 'string' ? candidate.code : undefined,
    constraint: typeof candidate.constraint === 'string' ? candidate.constraint : undefined,
  }
}

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

export const Route = createFileRoute('/api/kasubag/klasifikasi/')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        try {
          const url = new URL(request.url)
          const eligibleForBerkas = url.searchParams.get('eligible_for_berkas') === 'true'
          const baseQuery = db
            .select({
              id: masterKlasifikasiArsip.id,
              nama: masterKlasifikasiArsip.nama,
              kode: masterKlasifikasiArsip.kode,
              deskripsi: masterKlasifikasiArsip.deskripsi,
              parent_id: masterKlasifikasiArsip.parentId,
              created_at: masterKlasifikasiArsip.createdAt,
              is_active: masterKlasifikasiArsip.isActive,
            })
            .from(masterKlasifikasiArsip)

          const data = eligibleForBerkas
            ? await baseQuery
              .where(eq(masterKlasifikasiArsip.isActive, true))
              .orderBy(asc(masterKlasifikasiArsip.nama))
            : await baseQuery.orderBy(asc(masterKlasifikasiArsip.nama))

          const itemsWithRoot = data.map(item => ({
            ...item,
            created_at: item.created_at as unknown as string,
            is_root: item.kode === '000',
          }))

          const tree = buildTree(itemsWithRoot)
          if (!eligibleForBerkas) return Response.json({ klasifikasi: tree })

          const berkasRows = await db
            .select({
              klasifikasi_id: berkasArsip.klasifikasiId,
              status_berkas: berkasArsip.statusBerkas,
              status_arsip: berkasArsip.statusArsip,
            })
            .from(berkasArsip)

          return Response.json({
            klasifikasi: filterKlasifikasiTreeForBerkasSelection(tree, berkasRows),
          })
        } catch (err) {
          console.error('[arsiparis/klasifikasi] GET local query error:', toSafeErrorLog(err))
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }
      },

      POST: async ({ request }: { request: Request }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        const authError = await requireKepalaSubBagianUmum(request)
        if (authError) return authError

        const body = await request.json().catch(() => null)
        if (!body) return Response.json({ error: 'Body tidak valid' }, { status: 400 })

        const parsed = createKlasifikasiSchema.safeParse(body)
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })

        try {
          // Cek duplikat nama
          const [existingName] = await db
            .select({ id: masterKlasifikasiArsip.id })
            .from(masterKlasifikasiArsip)
            .where(and(
              eq(masterKlasifikasiArsip.nama, parsed.data.nama),
              eq(masterKlasifikasiArsip.isActive, true),
            ))
            .limit(1)

          if (existingName) return conflictResponse('Nama klasifikasi sudah digunakan.')

          // Cek duplikat kode
          if (parsed.data.kode) {
            const [existingKode] = await db
              .select({ id: masterKlasifikasiArsip.id })
              .from(masterKlasifikasiArsip)
              .where(and(
                eq(masterKlasifikasiArsip.kode, parsed.data.kode),
                eq(masterKlasifikasiArsip.isActive, true),
              ))
              .limit(1)

            if (existingKode) return conflictResponse('Kode klasifikasi sudah digunakan.')
          }

          // Validate parent exists if provided
          if (parsed.data.parent_id) {
            const [parent] = await db
              .select({ id: masterKlasifikasiArsip.id, kode: masterKlasifikasiArsip.kode })
              .from(masterKlasifikasiArsip)
              .where(and(
                eq(masterKlasifikasiArsip.id, parsed.data.parent_id),
                eq(masterKlasifikasiArsip.isActive, true),
              ))
              .limit(1)

            if (!parent) return Response.json({ error: 'Induk klasifikasi tidak ditemukan' }, { status: 400 })
          }

          const [data] = await db
            .insert(masterKlasifikasiArsip)
            .values({
              nama: parsed.data.nama,
              deskripsi: parsed.data.deskripsi ?? null,
              kode: parsed.data.kode,
              parentId: parsed.data.parent_id ?? null,
            })
            .returning({
              id: masterKlasifikasiArsip.id,
              nama: masterKlasifikasiArsip.nama,
              deskripsi: masterKlasifikasiArsip.deskripsi,
              is_active: masterKlasifikasiArsip.isActive,
              created_at: masterKlasifikasiArsip.createdAt,
              parent_id: masterKlasifikasiArsip.parentId,
              kode: masterKlasifikasiArsip.kode,
            })

          if (!data) return Response.json({ error: 'Gagal membuat klasifikasi' }, { status: 500 })

          return Response.json(data, { status: 201 })
        } catch (err) {
          const uniqueViolationField = classifyUniqueViolation(err)
          if (uniqueViolationField) {
            console.warn('[arsiparis/klasifikasi] POST unique constraint conflict:', toSafeErrorLog(err))
            return conflictResponse(uniqueViolationMessage(uniqueViolationField))
          }

          console.error('[arsiparis/klasifikasi] POST local query error:', toSafeErrorLog(err))
          return Response.json({ error: 'Gagal membuat klasifikasi' }, { status: 500 })
        }
      },
    },
  },
})
