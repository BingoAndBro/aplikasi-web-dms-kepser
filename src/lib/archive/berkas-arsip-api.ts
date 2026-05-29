import { z } from 'zod'
import {
  getLocalServerSession,
  hasLocalRole,
  type LocalServerSession,
} from '#/lib/auth/local-server-auth'
import {
  BerkasArsipServiceError,
  type BerkasArsipDto,
  type BerkasArsipItemDto,
} from '#/lib/archive/berkas-arsip-service'
import { ROLES } from '#/lib/constants/roles'

const uuidParamSchema = z.uuid()

export async function requireBerkasArsipApiSession(
  request: Request,
): Promise<LocalServerSession | Response> {
  const session = await getLocalServerSession(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  if (!hasLocalRole(session, ROLES.KEPALA_SUB_BAGIAN_UMUM)) {
    return Response.json({ error: 'Akses ditolak' }, { status: 403 })
  }

  return session
}

export function parseBerkasIdParam(value: string | undefined): string | Response {
  const parsed = uuidParamSchema.safeParse(value)
  if (!parsed.success) {
    return Response.json({ error: 'Berkas tidak ditemukan' }, { status: 404 })
  }

  return parsed.data
}

export function safeBerkasDto(berkas: BerkasArsipDto): BerkasArsipDto {
  return {
    id: berkas.id,
    klasifikasi_id: berkas.klasifikasi_id,
    klasifikasi_kode_snapshot: berkas.klasifikasi_kode_snapshot,
    klasifikasi_nama_snapshot: berkas.klasifikasi_nama_snapshot,
    status_berkas: berkas.status_berkas,
    status_arsip: berkas.status_arsip,
    nomor_spm: berkas.nomor_spm,
    retensi_aktif: berkas.retensi_aktif,
    retensi_inaktif: berkas.retensi_inaktif,
    masa_aktif_berakhir: berkas.masa_aktif_berakhir,
    masa_inaktif_berakhir: berkas.masa_inaktif_berakhir,
    closed_at: berkas.closed_at,
    closed_by: berkas.closed_by,
    created_by: berkas.created_by,
  }
}

export function safeBerkasItemDto(item: BerkasArsipItemDto): BerkasArsipItemDto {
  return {
    id: item.id,
    berkas_id: item.berkas_id,
    source_type: item.source_type,
    dokumen_id: item.dokumen_id,
    manual_arsip_id: item.manual_arsip_id,
    canonical_arsip_id: item.canonical_arsip_id,
    added_by: item.added_by,
  }
}

export function berkasArsipErrorResponse(error: unknown): Response {
  if (error instanceof BerkasArsipServiceError) {
    return Response.json(
      { error: error.message },
      { status: statusForServiceError(error) },
    )
  }

  console.error('[arsiparis/berkas] unexpected route error:', toSafeErrorLog(error))
  return Response.json({ error: 'Gagal memproses berkas' }, { status: 500 })
}

function statusForServiceError(error: BerkasArsipServiceError): number {
  switch (error.code) {
    case 'KLASIFIKASI_NOT_FOUND':
    case 'SOURCE_KLASIFIKASI_MISMATCH':
    case 'INVALID_CLOSE_METADATA':
      return 400
    case 'BERKAS_NOT_FOUND':
    case 'SOURCE_NOT_FOUND':
      return 404
    case 'BERKAS_CLOSED':
    case 'BERKAS_NOT_OPEN':
    case 'BERKAS_EMPTY':
    case 'CONFLICT':
      return 409
  }
}

function toSafeErrorLog(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== 'object') return { type: typeof error }

  const candidate = error as {
    code?: unknown
    name?: unknown
  }

  return {
    name: typeof candidate.name === 'string' ? candidate.name : undefined,
    code: typeof candidate.code === 'string' ? candidate.code : undefined,
  }
}
