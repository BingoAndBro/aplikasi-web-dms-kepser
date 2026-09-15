import { type ReactNode, useEffect, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#/components/ui/dialog'
import { LoadingState } from '#/components/ui/LoadingState'
import { ErrorState } from '#/components/ui/ErrorState'
import { StatusBadge } from '#/components/ui/StatusBadge'
import { AttachmentViewer, type ViewerApiType } from '#/components/dokumen/AttachmentViewer'
import type { DokumenRow } from '#/lib/dokumen-helpers'
import { formatDate } from '#/lib/utils/format'
import { ApiError, apiFetch } from '#/lib/api-client'

/**
 * Pop up detail dokumen yang di-reuse di seluruh halaman laporan (Laporan
 * Bulanan, Laporan Kegiatan, Laporan Kinerja, Pembersihan Dokumen), meniru
 * pola "Detail Dokumen Berkas" di halaman Berkas kasubag: metadata ringkas +
 * lampiran dengan tombol preview/download, tanpa tab Riwayat/Workflow.
 */
export function DokumenDetailDialog({
  dokumenId,
  open,
  onOpenChange,
  apiType = 'default',
}: {
  dokumenId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  apiType?: ViewerApiType
}) {
  const [dokumen, setDokumen] = useState<DokumenRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !dokumenId) return

    let cancelled = false
    setLoading(true)
    setError(null)
    setDokumen(null)

    apiFetch<{ dokumen: DokumenRow }>(`/dokumen/${dokumenId}`)
      .then((json) => {
        if (cancelled) return
        setDokumen(json.dokumen)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError) {
          const payload = err.payload
          setError(payload && typeof payload === 'object' && 'error' in payload
            ? (payload as { error?: string }).error ?? 'Gagal memuat detail dokumen'
            : 'Gagal memuat detail dokumen')
          return
        }
        setError('Terjadi kesalahan')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [open, dokumenId])

  function handleClose() {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose() }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto border-brand-border bg-bg-surface shadow-2xl shadow-zinc-950/10 sm:max-w-3xl sm:rounded-3xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-800"
              onClick={handleClose}
              aria-label="Kembali dari detail dokumen"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="min-w-0">
              <DialogTitle>Detail Dokumen</DialogTitle>
              <DialogDescription className="line-clamp-1">
                {dokumen?.judul ?? 'Memuat detail dokumen'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {loading && (
          <div className="p-5">
            <LoadingState variant="card" label="Memuat detail dokumen" />
          </div>
        )}

        {!loading && error && (
          <div className="p-5">
            <ErrorState title="Gagal memuat detail dokumen" description={error} variant="inline" />
          </div>
        )}

        {!loading && !error && dokumen && (
          <div className="space-y-5 p-5">
            <div className="rounded-[1.25rem] border border-brand-border bg-bg-surface p-4 sm:p-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <ModalMetadataField
                  label={dokumen.is_non_material ? 'Nama/Judul Dokumen' : 'Judul Dokumen'}
                  value={dokumen.judul}
                  className="sm:col-span-2"
                />
                <ModalMetadataField label="Fungsi" value={dokumen.fungsi_nama ?? '-'} />
                <ModalMetadataField label="Kegiatan" value={dokumen.kegiatan_nama ?? '-'} />
                <ModalMetadataField label="Status" value={<StatusBadge status={dokumen.status} />} />
                <ModalMetadataField label="Tanggal Dokumen" value={dokumen.tanggal ? formatDate(dokumen.tanggal) : '-'} />
                <ModalMetadataField label="Pengaju / Pembuat" value={getPengajuLabel(dokumen)} />
                {!dokumen.is_non_material && dokumen.nominal_realisasi !== null && (
                  <ModalMetadataField
                    label="Nominal Realisasi"
                    value={`Rp ${Number(dokumen.nominal_realisasi).toLocaleString('id-ID')}`}
                    emphasis
                  />
                )}
              </div>
            </div>

            <section>
              <h3 className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-zinc-950">Lampiran Pendukung</h3>
              <AttachmentViewer dokumen={dokumen} lampiranUrls={dokumen.lampiran_urls} apiType={apiType} />
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function getPengajuLabel(dokumen: DokumenRow & { pengaju_nama?: string | null }): string {
  if (dokumen.pengaju_nama) return dokumen.pengaju_nama
  if (!dokumen.created_by || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(dokumen.created_by)) {
    return 'Pegawai pengaju'
  }
  return dokumen.created_by
}

function ModalMetadataField({
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
