import { type ReactNode, useEffect, useState } from 'react'
import { ChevronLeft } from 'lucide-react'

import { ManualArsipAttachmentViewer } from '#/components/arsip/ManualArsipAttachmentViewer'
import type { ManualArsipAttachmentMetadata } from '#/components/arsip/ManualArsipAttachments'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#/components/ui/dialog'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { ApiError, apiFetch } from '#/lib/api-client'
import type { LaporanKinerjaRow } from '#/lib/laporan/monitoring-rows'
import { formatDate } from '#/lib/utils/format'

const LAPORAN_MANUAL_ARSIP_API = '/api/laporan/manual-arsip'

type ManualArsipDetail = {
  id: string
  keterangan: string
  status_arsip: string
  klasifikasi: { nama: string | null }
  attachments: Array<ManualArsipAttachmentMetadata & { original_filename?: string }>
}

/**
 * Detail dokumen manual KSBU (Penambahan Dokumen, T-5/D-26) untuk Laporan
 * Kinerja dan Monitoring Nominal Realisasi — padanan DokumenDetailDialog,
 * karena dokumen manual tidak punya /api/dokumen/$id. Metadata diambil dari
 * baris laporan; keterangan, jenis pembayaran dan lampiran dari endpoint
 * read-only /api/laporan/manual-arsip/$id.
 */
export function ManualArsipDetailDialog({
  dokumen,
  onClose,
}: {
  dokumen: LaporanKinerjaRow | null
  onClose: () => void
}) {
  const [detail, setDetail] = useState<ManualArsipDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dokumenId = dokumen?.id ?? null

  useEffect(() => {
    if (!dokumenId) return

    let cancelled = false
    setLoading(true)
    setError(null)
    setDetail(null)

    apiFetch<{ manual_arsip?: ManualArsipDetail }>(`/laporan/manual-arsip/${encodeURIComponent(dokumenId)}`)
      .then((json) => {
        if (cancelled) return
        if (!json.manual_arsip) {
          setError('Dokumen manual tidak ditemukan')
          return
        }
        setDetail(json.manual_arsip)
      })
      .catch((err) => {
        if (cancelled) return
        const payload = err instanceof ApiError ? err.payload : null
        setError(payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : 'Gagal memuat detail dokumen manual')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [dokumenId])

  if (!dokumen) return null

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto border-brand-border bg-bg-surface shadow-2xl shadow-zinc-950/10 sm:max-w-3xl sm:rounded-3xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-800"
              onClick={onClose}
              aria-label="Kembali dari detail dokumen"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="min-w-0">
              <DialogTitle>Detail Dokumen</DialogTitle>
              <DialogDescription className="line-clamp-1">{dokumen.judul}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 p-5">
          <div className="rounded-[1.25rem] border border-brand-border bg-bg-surface p-4 sm:p-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <MetadataField label="Judul Dokumen" value={dokumen.judul} className="sm:col-span-2" />
              <MetadataField label="Sumber" value="Penambahan Dokumen (KSBU)" />
              <MetadataField label="Status" value="Selesai" />
              <MetadataField label="Fungsi" value={dokumen.fungsi_nama ?? '-'} />
              <MetadataField label="Kegiatan" value={dokumen.kegiatan_nama ?? '-'} />
              <MetadataField label="Komponen" value={dokumen.komponen_nama ?? '-'} />
              <MetadataField label="Jenis Pembayaran" value={detail?.klasifikasi.nama ?? '-'} />
              <MetadataField label="Tanggal Dokumen" value={dokumen.tanggal ? formatDate(dokumen.tanggal) : '-'} />
              <MetadataField label="Pembuat" value={dokumen.pengaju_nama || '-'} />
              {dokumen.nominal_realisasi !== null && (
                <MetadataField
                  label="Nominal Realisasi"
                  value={`Rp ${Number(dokumen.nominal_realisasi).toLocaleString('id-ID')}`}
                  emphasis
                />
              )}
              {detail?.keterangan && (
                <MetadataField label="Keterangan" value={detail.keterangan} className="sm:col-span-2" />
              )}
            </div>
          </div>

          <section>
            <h3 className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-zinc-950">Lampiran Pendukung</h3>
            {loading && <LoadingState variant="card" label="Memuat lampiran" />}
            {!loading && error && (
              <ErrorState title="Gagal memuat lampiran" description={error} variant="inline" />
            )}
            {!loading && !error && detail && (
              <ManualArsipAttachmentViewer
                apiBase={LAPORAN_MANUAL_ARSIP_API}
                manualArsipId={detail.id}
                attachments={detail.attachments}
                fileUnavailable={detail.status_arsip === 'DIMUSNAHKAN'}
              />
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function MetadataField({
  label,
  value,
  emphasis,
  className,
}: {
  label: string
  value: ReactNode
  emphasis?: boolean
  className?: string
}) {
  return (
    <div className={className}>
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <div className={`mt-1 text-sm font-semibold leading-relaxed ${emphasis ? 'font-mono font-bold text-zinc-950' : 'text-zinc-950'}`}>
        {value}
      </div>
    </div>
  )
}
