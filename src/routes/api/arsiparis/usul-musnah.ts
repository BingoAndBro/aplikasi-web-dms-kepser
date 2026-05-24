import { createFileRoute } from '@tanstack/react-router'
import type { UnifiedArchiveListRow } from '#/lib/archive/unified-archive-query'
import { getUnifiedArchiveList } from '#/lib/archive/unified-archive-query'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { ARCHIVE_STATUS } from '#/lib/constants/archive-status'
import { ROLES } from '#/lib/constants/roles'

// ---------------------------------------------------------------------------
// GET /api/arsiparis/usul-musnah - list arsip USUL_MUSNAH
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/arsiparis/usul-musnah')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        if (!hasLocalRole(session, ROLES.KEPALA_SUB_BAGIAN_UMUM)) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        try {
          const result = await getUnifiedArchiveList({ statusArsip: ARCHIVE_STATUS.USUL_MUSNAH })

          return Response.json({
            usul_musnah: result.rows.map(mapUnifiedArchiveRow),
          })
        } catch {
          console.error('[usul-musnah] local query error')
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }
      },
    },
  },
})

function mapUnifiedArchiveRow(row: UnifiedArchiveListRow) {
  return {
    id: row.id,
    nama_arsip: row.namaArsip ?? '\u2014',
    nomor_surat: row.nomorSurat ?? '\u2014',
    klasifikasi_arsip: formatKlasifikasi(row),
    tanggal_arsip: row.tanggalArsip,
    retensi_aktif: row.retensiAktif ?? '\u2014',
    retensi_inaktif: row.retensiInaktif ?? '\u2014',
    masa_aktif_berakhir: row.masaAktifBerakhir,
    masa_inaktif_berakhir: row.masaInaktifBerakhir,
    nominal_realisasi: row.nominalRealisasi,
    sumber: row.sourceType === 'WORKFLOW' ? 'Dokumen Persetujuan' : row.sourceType === 'MANUAL' ? 'Arsip Manual' : 'Sumber Tidak Dikenal',
    jumlah_lampiran: row.attachmentCount ?? null,
    source_warnings: row.warnings.map(formatSourceWarning),
  }
}

function formatKlasifikasi(row: UnifiedArchiveListRow): string {
  const kode = row.klasifikasiKodeSnapshot
  const nama = row.klasifikasiNamaSnapshot
  if (kode && nama) return `${kode} - ${nama}`
  return kode ?? nama ?? '\u2014'
}

function formatSourceWarning(warning: UnifiedArchiveListRow['warnings'][number]): string {
  if (warning === 'MISSING_MANUAL_SOURCE') return 'Data sumber manual belum lengkap'
  if (warning === 'WORKFLOW_WITHOUT_DOKUMEN_ID') return 'Dokumen workflow belum terhubung'
  if (warning === 'MANUAL_WITH_DOKUMEN_ID') return 'Arsip manual memiliki relasi dokumen tidak lazim'
  return 'Jenis sumber arsip tidak dikenal'
}
