import { createFileRoute, Link } from '@tanstack/react-router'
import { AlertCircle, AlertTriangle, ArrowLeft, FileText, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { PageLayout } from '#/components/dashboard/PageLayout'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { ApiError, apiFetch } from '#/lib/api-client'
import type {
  ManualArchiveDetailSource,
  UnifiedArchiveAttachmentSummary,
  UnifiedArchiveDetail,
  UnifiedArchiveDetailWarning,
  WorkflowArchiveDetailSource,
} from '#/lib/archive/unified-archive-detail'
import { formatDate, formatDateTime } from '#/lib/utils/format'

export const Route = createFileRoute('/arsiparis/arsip/$id')({
  component: UnifiedArchiveDetailPage,
})

type UnifiedArchiveDetailResponse = {
  arsip?: UnifiedArchiveDetail
  error?: string
}

function UnifiedArchiveDetailPage() {
  const { id } = Route.useParams()
  const [detail, setDetail] = useState<UnifiedArchiveDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchDetail() {
    setLoading(true)
    setError(null)
    try {
      const json = await apiFetch<UnifiedArchiveDetailResponse>(`/arsiparis/arsip/${id}`)
      setDetail(json.arsip ?? null)
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 404) {
          setError('Arsip tidak ditemukan')
        } else if (error.status === 403) {
          setError('Akses ditolak')
        } else if (error.status === 401) {
          setError('Sesi tidak valid')
        } else {
          setError(readApiError(error.payload) ?? 'Gagal mengambil data arsip')
        }
      } else {
        setError('Terjadi kesalahan')
      }
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDetail()
  }, [id])

  return (
    <PageLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-outline">
              <Link to="/arsiparis" className="hover:text-primary">Kepala Sub Bagian Umum</Link>
              <span>/</span>
              <span className="text-primary">Detail Arsip</span>
            </div>
            <h2 className="font-headline text-2xl font-extrabold text-on-surface">Detail Arsip</h2>
            <p className="mt-1 text-xs text-on-surface-variant">
              Detail kanonis read-only berdasarkan arsip.arsip.id.
            </p>
          </div>
          <Link
            to="/arsiparis/aktif"
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-outline-variant/50 px-3 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low"
          >
            <ArrowLeft size={14} />
            Kembali ke daftar
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center rounded-2xl border border-outline-variant/30 bg-white py-20">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={fetchDetail} />
        ) : detail ? (
          <DetailContent detail={detail} />
        ) : (
          <ErrorState message="Metadata arsip tidak tersedia" onRetry={fetchDetail} />
        )}
      </div>
    </PageLayout>
  )
}

function DetailContent({ detail }: { detail: UnifiedArchiveDetail }) {
  return (
    <div className="space-y-6">
      {detail.statusArsip === 'DIMUSNAHKAN' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
          Arsip telah dimusnahkan. Metadata dapat dilihat, tetapi akses file tidak tersedia.
        </div>
      )}

      {detail.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-800">
            <AlertTriangle size={16} />
            Peringatan Metadata Sumber
          </div>
          <div className="flex flex-wrap gap-2">
            {detail.warnings.map((warning) => (
              <Badge key={warning} className="border-amber-200 bg-white text-amber-800">
                {formatWarning(warning)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <section className="rounded-xl border border-outline-variant/30 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-headline text-lg font-extrabold text-on-surface">Metadata Arsip</h3>
            <p className="text-xs text-on-surface-variant">Informasi umum kanonis dari arsip.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={detail.statusArsip} />
            <SourceBadge sourceType={detail.sourceType} />
          </div>
        </div>

        <DescriptionGrid
          items={[
            ['Nama Arsip', formatText(detail.namaArsip)],
            ['Nomor Surat', formatText(detail.nomorSurat)],
            ['Status Arsip', detail.statusArsip],
            ['Sumber', formatSourceType(detail.sourceType)],
            ['Klasifikasi Arsip', formatKlasifikasi(detail)],
            ['Tanggal Arsip', formatNullableDate(detail.tanggalArsip)],
            ['Retensi Aktif', formatText(detail.retensiAktif)],
            ['Retensi Inaktif', formatText(detail.retensiInaktif)],
            ['Masa Aktif Berakhir', formatNullableDate(detail.masaAktifBerakhir)],
            ['Masa Inaktif Berakhir', formatNullableDate(detail.masaInaktifBerakhir)],
            ['Nominal Realisasi', formatNominal(detail.nominalRealisasi)],
            ['Created By', formatText(detail.createdBy)],
            ['Archived By', formatText(detail.archivedBy)],
            ['Created At', formatNullableDateTime(detail.createdAt)],
            ['Updated At', formatNullableDateTime(detail.updatedAt)],
          ]}
        />
      </section>

      <SourceSection detail={detail} />

      <AttachmentSection detail={detail} />
    </div>
  )
}

function SourceSection({ detail }: { detail: UnifiedArchiveDetail }) {
  if (detail.source?.sourceType === 'WORKFLOW') {
    return <WorkflowSourceSection source={detail.source} />
  }

  if (detail.source?.sourceType === 'MANUAL') {
    return <ManualSourceSection source={detail.source} />
  }

  return (
    <section className="rounded-xl border border-outline-variant/30 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <FileText size={18} className="text-outline" />
        <h3 className="font-headline text-lg font-extrabold text-on-surface">
          Metadata Sumber
        </h3>
      </div>
      <p className="text-sm text-on-surface-variant">
        {detail.sourceType === 'UNKNOWN'
          ? 'Sumber tidak dikenal'
          : 'Metadata sumber belum lengkap'}
      </p>
    </section>
  )
}

function WorkflowSourceSection({ source }: { source: WorkflowArchiveDetailSource }) {
  return (
    <section className="rounded-xl border border-outline-variant/30 bg-white p-5 shadow-sm">
      <h3 className="mb-4 font-headline text-lg font-extrabold text-on-surface">
        Metadata Dokumen Persetujuan
      </h3>
      <DescriptionGrid
        items={[
          ['Dokumen ID', source.dokumenId],
          ['Judul Dokumen', formatText(source.judulDokumen)],
          ['Jenis Dokumen', formatMaterial(source.isNonMaterial)],
          ['Status Workflow', formatText(source.workflowStatus)],
          ['Fungsi', formatText(source.fungsiNama)],
          ['Kegiatan', formatText(source.kegiatanNama)],
          ['Tahun', source.tahun === null ? '-' : String(source.tahun)],
          ['Created By', formatText(source.createdBy)],
        ]}
      />
    </section>
  )
}

function ManualSourceSection({ source }: { source: ManualArchiveDetailSource }) {
  return (
    <section className="rounded-xl border border-outline-variant/30 bg-white p-5 shadow-sm">
      <h3 className="mb-4 font-headline text-lg font-extrabold text-on-surface">
        Metadata Arsip Manual
      </h3>
      <DescriptionGrid
        items={[
          ['Nama', formatText(source.nama)],
          ['Keterangan', formatText(source.keterangan)],
          ['Kategori', formatText(source.categoryName)],
          ['Tanggal Dokumen/Sumber', formatNullableDate(source.tanggalDokumenSumber)],
          ['Tanggal Diarsipkan', formatNullableDate(source.tanggalDiarsipkan)],
          ['Created By', formatText(source.createdBy)],
          ['Archived By', formatText(source.archivedBy)],
        ]}
      />
    </section>
  )
}

function AttachmentSection({ detail }: { detail: UnifiedArchiveDetail }) {
  return (
    <section className="rounded-xl border border-outline-variant/30 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-1">
        <h3 className="font-headline text-lg font-extrabold text-on-surface">
          Lampiran Arsip
        </h3>
        <p className="text-xs text-on-surface-variant">
          Metadata lampiran read-only. Halaman ini tidak menyediakan akses file.
        </p>
      </div>

      {detail.statusArsip === 'DIMUSNAHKAN' && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
          Akses file tidak tersedia karena arsip telah dimusnahkan.
        </div>
      )}

      {detail.attachments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-outline-variant/50 bg-surface-container-low/30 p-4 text-sm text-on-surface-variant">
          Belum ada metadata lampiran yang tersedia.
        </div>
      ) : (
        <div className="grid gap-3">
          {detail.attachments.map((attachment, index) => (
            <AttachmentCard
              key={attachment.attachmentId ?? `${attachment.sourceType}-${attachment.index ?? index}`}
              attachment={attachment}
              fallbackIndex={index + 1}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function AttachmentCard({
  attachment,
  fallbackIndex,
}: {
  attachment: UnifiedArchiveAttachmentSummary
  fallbackIndex: number
}) {
  return (
    <div className="rounded-lg border border-outline-variant/20 bg-surface-container-low/30 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-outline">
            Nama Lampiran
          </p>
          <p className="mt-1 break-words text-sm font-bold text-on-surface">
            {formatAttachmentName(attachment, fallbackIndex)}
          </p>
        </div>
        <AttachmentAvailabilityBadge availability={attachment.availability} />
      </div>

      <DescriptionGrid
        items={[
          ['Jenis', formatAttachmentType(attachment.mimeType)],
          ['Ukuran', formatFileSize(attachment.sizeBytes)],
          ['Status Ketersediaan', formatAttachmentAvailability(attachment.availability)],
          ['Sumber', formatSourceType(attachment.sourceType)],
          ['Diunggah Pada', formatNullableDateTime(attachment.uploadedAt)],
        ]}
      />
    </div>
  )
}

function DescriptionGrid({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-outline-variant/20 bg-surface-container-low/30 p-3">
          <dt className="text-[10px] font-bold uppercase tracking-widest text-outline">{label}</dt>
          <dd className="mt-1 break-words text-sm font-semibold text-on-surface">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-error/20 bg-error/5 py-20">
      <AlertCircle size={32} className="text-error" />
      <p className="text-sm text-on-surface-variant">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>Coba Lagi</Button>
    </div>
  )
}

function StatusBadge({ status }: { status: UnifiedArchiveDetail['statusArsip'] }) {
  const className = status === 'AKTIF'
    ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
    : status === 'INAKTIF'
      ? 'border-sky-200 bg-sky-100 text-sky-700'
      : status === 'USUL_MUSNAH'
        ? 'border-amber-200 bg-amber-100 text-amber-700'
        : 'border-rose-200 bg-rose-100 text-rose-700'

  return <Badge className={className}>{status}</Badge>
}

function SourceBadge({ sourceType }: { sourceType: UnifiedArchiveDetail['sourceType'] }) {
  const className = sourceType === 'MANUAL'
    ? 'border-sky-200 bg-sky-100 text-sky-700'
    : sourceType === 'WORKFLOW'
      ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
      : 'border-slate-200 bg-slate-100 text-slate-700'

  return <Badge className={className}>{formatSourceType(sourceType)}</Badge>
}

function AttachmentAvailabilityBadge({
  availability,
}: {
  availability: UnifiedArchiveAttachmentSummary['availability']
}) {
  const className = availability === 'AVAILABLE'
    ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
    : availability === 'UNAVAILABLE_DESTROYED'
      ? 'border-rose-200 bg-rose-100 text-rose-700'
      : 'border-amber-200 bg-amber-100 text-amber-700'

  return <Badge className={className}>{formatAttachmentAvailability(availability)}</Badge>
}

function formatWarning(warning: UnifiedArchiveDetailWarning): string {
  if (warning === 'ATTACHMENT_METADATA_UNAVAILABLE') return 'Metadata lampiran tidak tersedia'
  if (warning === 'ATTACHMENT_SOURCE_INCOMPLETE') return 'Sumber lampiran belum lengkap'
  if (warning === 'UNKNOWN_SOURCE_TYPE') return 'Jenis sumber arsip tidak dikenal'
  if (warning === 'MISSING_MANUAL_SOURCE') return 'Data sumber manual belum lengkap'
  if (warning === 'WORKFLOW_WITHOUT_DOKUMEN_ID') return 'Dokumen workflow belum terhubung'
  if (warning === 'MANUAL_WITH_DOKUMEN_ID') return 'Arsip manual memiliki relasi dokumen tidak lazim'
  if (warning === 'WORKFLOW_SOURCE_NOT_FOUND') return 'Metadata dokumen persetujuan tidak ditemukan'
  if (warning === 'MANUAL_SOURCE_NOT_FOUND') return 'Metadata arsip manual tidak ditemukan'
  return 'Metadata sumber belum lengkap'
}

function formatSourceType(sourceType: UnifiedArchiveDetail['sourceType']): string {
  if (sourceType === 'WORKFLOW') return 'Dokumen Persetujuan'
  if (sourceType === 'MANUAL') return 'Arsip Manual'
  return 'Sumber tidak dikenal'
}

function formatKlasifikasi(detail: UnifiedArchiveDetail): string {
  const kode = detail.klasifikasiKodeSnapshot
  const nama = detail.klasifikasiNamaSnapshot
  if (kode && nama) return `${kode} - ${nama}`
  return formatText(kode ?? nama)
}

function formatMaterial(value: boolean | null): string {
  if (value === true) return 'Non-Material'
  if (value === false) return 'Material'
  return '-'
}

function formatAttachmentName(attachment: UnifiedArchiveAttachmentSummary, fallbackIndex: number): string {
  return formatText(attachment.displayName ?? attachment.fileName ?? `Lampiran ${attachment.index ?? fallbackIndex}`)
}

function formatAttachmentType(mimeType: string | null): string {
  if (!mimeType) return '-'
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType === 'image/png') return 'Gambar PNG'
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'Gambar JPEG'
  if (mimeType === 'image/webp') return 'Gambar WebP'
  if (mimeType === 'image/gif') return 'Gambar GIF'
  if (mimeType === 'image/tiff') return 'Gambar TIFF'
  if (mimeType === 'image/bmp') return 'Gambar BMP'
  if (mimeType.startsWith('image/')) return `Gambar ${mimeType.split('/')[1]?.toUpperCase() ?? ''}`.trim()

  return mimeType
}

function formatFileSize(sizeBytes: number | null): string {
  if (sizeBytes === null || !Number.isFinite(sizeBytes) || sizeBytes < 0) return '-'
  if (sizeBytes < 1024) return `${sizeBytes} B`

  const units = ['KB', 'MB', 'GB']
  let value = sizeBytes / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  }).format(value)} ${units[unitIndex]}`
}

function formatAttachmentAvailability(
  availability: UnifiedArchiveAttachmentSummary['availability'],
): string {
  if (availability === 'AVAILABLE') return 'Tersedia'
  if (availability === 'UNAVAILABLE_DESTROYED') return 'Tidak tersedia - dimusnahkan'
  return 'Tidak tersedia - sumber belum lengkap'
}

function formatText(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : '-'
}

function formatNullableDate(value: string | null): string {
  return value ? formatDate(value) : '-'
}

function formatNullableDateTime(value: string | null): string {
  return value ? formatDateTime(value) : '-'
}

function formatNominal(value: string | number | null): string {
  if (value === null || value === '') return '-'
  const numericValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numericValue)) return String(value)

  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(numericValue)
}

function readApiError(payload: unknown): string | null {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    return typeof payload.error === 'string' ? payload.error : null
  }

  return null
}
