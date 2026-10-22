import { createFileRoute } from '@tanstack/react-router'

import { getLocalServerSession } from '#/lib/auth/local-server-auth'
import { triggerDriveRunner } from '#/lib/google-drive/runner'
import {
  createTautanForSession,
  getTautanPublicBaseUrl,
  toTautanListItem,
} from '#/lib/laporan/tautan'
import { listTautanByCreator, loadDriveRingkasanByTautanIds } from '#/lib/laporan/tautan-repository'
import {
  TAUTAN_AKSES,
  type TautanCreateResponse,
  type TautanListResponse,
} from '#/lib/laporan/tautan-shared'
import { createTautanRequestSchema, listTautanQuerySchema } from '#/lib/schemas/tautan'
import { requireSameOrigin } from '#/lib/security/same-origin'

// Tautan Laporan milik pengguna yang sedang login (lihat src/lib/laporan/tautan.ts).
// POST membuat tautan baru dari daftar dokumen yang sedang ditampilkan halaman
// laporan; GET mengembalikan riwayat tautan pengguna untuk dialog Riwayat Tautan,
// termasuk status salinan Google Drive (SPEC 10.2). Keduanya memicu runner Drive
// (POST hanya untuk tautan DRIVE) tanpa menunggu hasilnya.
export const Route = createFileRoute('/api/laporan/tautan')({
  ssr: false,
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)
        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const parsed = listTautanQuerySchema.safeParse({
          sumber: new URL(request.url).searchParams.get('sumber') ?? undefined,
        })
        if (!parsed.success) {
          return Response.json({ error: 'Parameter sumber tidak valid' }, { status: 400 })
        }

        try {
          const rows = await listTautanByCreator(session.user.id, parsed.data.sumber)
          const driveIds = rows.filter(row => row.akses === TAUTAN_AKSES.DRIVE).map(row => row.id)
          const ringkasan = driveIds.length > 0 ? await loadDriveRingkasanByTautanIds(driveIds) : new Map()
          const body: TautanListResponse = {
            tautan: rows.map(row => toTautanListItem(row, ringkasan.get(row.id))),
            public_base_url: getTautanPublicBaseUrl(),
          }
          // Riwayat dipoll selama ada unggahan berjalan; pemicu ini juga menyusul
          // job yang jadwalnya terlewat (mis. setelah server restart).
          triggerDriveRunner()
          return Response.json(body, { headers: { 'Cache-Control': 'no-store' } })
        } catch {
          console.error('[laporan/tautan] list error')
          return Response.json({ error: 'Gagal memuat riwayat tautan' }, { status: 500 })
        }
      },
      POST: async ({ request }: { request: Request }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError

        const session = await getLocalServerSession(request)
        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const parsed = createTautanRequestSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
          return Response.json(
            { error: parsed.error.issues[0]?.message ?? 'Data tautan tidak valid' },
            { status: 400 },
          )
        }

        try {
          const result = await createTautanForSession(session, parsed.data)
          if (!result.ok) {
            return Response.json(
              result.kode ? { error: result.error, kode: result.kode } : { error: result.error },
              { status: result.status },
            )
          }

          const item = toTautanListItem(result.tautan)
          console.info('[laporan/tautan] tautan dibuat', {
            actor: session.user.id,
            tautanId: result.tautan.id,
            sumber: result.tautan.sumber,
            akses: result.tautan.akses,
            documentCount: item.jumlah_dokumen,
          })

          const body: TautanCreateResponse = {
            id: item.id,
            akses: item.akses,
            path: item.path,
            drive_status: item.drive_status,
            public_base_url: getTautanPublicBaseUrl(),
            jumlah_dokumen: item.jumlah_dokumen,
            jumlah_diabaikan: result.jumlahDiabaikan,
          }
          if (result.tautan.akses === TAUTAN_AKSES.DRIVE) triggerDriveRunner()
          return Response.json(body, { status: 201 })
        } catch {
          console.error('[laporan/tautan] create error')
          return Response.json({ error: 'Gagal membuat tautan' }, { status: 500 })
        }
      },
    },
  },
})
