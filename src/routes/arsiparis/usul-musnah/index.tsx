import { createFileRoute, Link } from '@tanstack/react-router'
import {
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  Loader2,
  Trash2,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { PageLayout } from '#/components/dashboard/PageLayout'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  BERKAS_DESTRUCTION_CONFIRMATION_PHRASE,
  formatBerkasArchiveStatusLabel,
  formatBerkasStatusLabel,
  formatKlasifikasiLabel,
  formatNominalRupiah,
  formatNullableDateLabel,
  resolveBerkasLifecycleAction,
} from '#/lib/archive/berkas-arsip-page-format'
import { ApiError, apiFetch } from '#/lib/api-client'

export const Route = createFileRoute('/arsiparis/usul-musnah/')({ component: UsulMusnahPage })

type BerkasFolder = {
  berkas_id: string
  klasifikasi_id: string
  klasifikasi_kode_snapshot: string | null
  klasifikasi_nama_snapshot: string
  status_berkas: string
  status_arsip: string | null
  nomor_spm: string | null
  retensi_aktif: string | null
  retensi_inaktif: string | null
  masa_aktif_berakhir: string | null
  masa_inaktif_berakhir: string | null
  closed_at: string | null
  item_count: number
  workflow_item_count: number
  manual_item_count: number
  total_nominal_realisasi: number | null
  created_at: string | null
  updated_at: string | null
}

type BerkasFolderListResponse = {
  berkas?: BerkasFolder[]
  summary?: {
    total_rows_returned: number
    item_count_total: number
    workflow_item_count_total: number
    manual_item_count_total: number
    total_nominal_realisasi: number | null
  }
  error?: string
}

function UsulMusnahPage() {
  const [folders, setFolders] = useState<BerkasFolder[]>([])
  const [summary, setSummary] = useState<BerkasFolderListResponse['summary'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [pendingBerkasId, setPendingBerkasId] = useState<string | null>(null)
  const [destructionTarget, setDestructionTarget] = useState<BerkasFolder | null>(null)
  const [destructionPhrase, setDestructionPhrase] = useState('')

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      const json = await apiFetch<BerkasFolderListResponse>('/arsiparis/berkas', {
        query: {
          status_berkas: 'CLOSED',
          status_arsip: 'USUL_MUSNAH',
        },
      })
      setFolders(json.berkas ?? [])
      setSummary(json.summary ?? null)
    } catch (error) {
      setError(resolveErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  function openDestructionDialog(folder: BerkasFolder) {
    const lifecycleAction = resolveBerkasLifecycleAction(folder.status_berkas, folder.status_arsip)
    if (lifecycleAction?.action !== 'approve_destruction') return

    setDestructionTarget(folder)
    setDestructionPhrase('')
    setActionError(null)
    setActionSuccess(null)
  }

  function closeDestructionDialog() {
    setDestructionTarget(null)
    setDestructionPhrase('')
    setActionError(null)
  }

  async function approveDestruction() {
    if (!destructionTarget) return
    if (destructionPhrase !== BERKAS_DESTRUCTION_CONFIRMATION_PHRASE) return

    const lifecycleAction = resolveBerkasLifecycleAction(
      destructionTarget.status_berkas,
      destructionTarget.status_arsip,
    )
    if (lifecycleAction?.action !== 'approve_destruction') return

    setPendingBerkasId(destructionTarget.berkas_id)
    setActionError(null)
    setActionSuccess(null)

    try {
      await apiFetch(`/arsiparis/berkas/${encodeURIComponent(destructionTarget.berkas_id)}/lifecycle`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'approve_destruction',
          confirmation: BERKAS_DESTRUCTION_CONFIRMATION_PHRASE,
        }),
      })
      setActionSuccess(lifecycleAction.successMessage)
      setDestructionTarget(null)
      setDestructionPhrase('')
      await fetchData()
    } catch (error) {
      setActionError(resolveErrorMessage(error))
    } finally {
      setPendingBerkasId(null)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const canSubmitDestruction = destructionPhrase === BERKAS_DESTRUCTION_CONFIRMATION_PHRASE
    && Boolean(destructionTarget)
    && pendingBerkasId === null

  return (
    <PageLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-outline">
              <Link to="/arsiparis" className="hover:text-primary">Kepala Sub Bagian Umum</Link>
              <ChevronRight size={10} />
              <span className="text-primary">Usul Musnah</span>
            </div>
            <h2 className="font-headline text-2xl font-extrabold text-on-surface">Usul Musnah</h2>
            <p className="mt-1 text-xs text-on-surface-variant">
              Folder-first untuk berkas yang sudah ditutup dan berstatus Usul Musnah.
            </p>
          </div>
          <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-xs text-orange-800">
            Musnahkan Data bersifat status-only. File fisik tidak dihapus pada fase ini.
          </div>
        </div>

        {summary && (
          <div className="grid gap-3 md:grid-cols-4">
            <SummaryCard label="Berkas Usul Musnah" value={summary.total_rows_returned} />
            <SummaryCard label="Jumlah Dokumen" value={summary.item_count_total} />
            <SummaryCard label="Dokumen Workflow" value={summary.workflow_item_count_total} />
            <SummaryCard label="Dokumen Manual" value={summary.manual_item_count_total} />
          </div>
        )}

        {(actionError || actionSuccess) && (
          <div className={`rounded-xl border px-4 py-3 text-xs font-semibold ${
            actionError
              ? 'border-error/20 bg-error/5 text-error'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
          >
            {actionError ?? actionSuccess}
          </div>
        )}

        <Dialog
          open={Boolean(destructionTarget)}
          onOpenChange={(open) => {
            if (!open && !pendingBerkasId) closeDestructionDialog()
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Musnahkan Data</DialogTitle>
              <DialogDescription>
                Konfirmasi status-only untuk berkas yang dipilih.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {destructionTarget && (
                <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low/30 px-3 py-2 text-xs text-on-surface">
                  Berkas: <span className="font-semibold">
                    {formatKlasifikasiLabel(
                      destructionTarget.klasifikasi_kode_snapshot,
                      destructionTarget.klasifikasi_nama_snapshot,
                    )}
                  </span>
                </div>
              )}

              <div className="space-y-2 rounded-xl border border-error/30 bg-error/5 p-3 text-xs font-semibold text-error/90">
                <p>Status berkas akan menjadi Dimusnahkan.</p>
                <p>Preview dan download file akan diblokir.</p>
                <p>File fisik tidak dihapus pada fase ini.</p>
                <p>Metadata berkas dan dokumen tetap tersimpan.</p>
              </div>

              <label className="block text-xs font-bold text-on-surface" htmlFor="berkas-destruction-confirmation">
                Ketik frasa konfirmasi <span className="text-error">*</span>
                <input
                  id="berkas-destruction-confirmation"
                  value={destructionPhrase}
                  onChange={(event) => setDestructionPhrase(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-outline-variant/60 bg-white px-3 py-2 text-sm font-semibold text-on-surface outline-none focus:border-error focus:ring-1 focus:ring-error"
                  placeholder={BERKAS_DESTRUCTION_CONFIRMATION_PHRASE}
                  autoComplete="off"
                />
              </label>
              <p className="text-[10px] font-semibold text-outline">
                Frasa wajib: {BERKAS_DESTRUCTION_CONFIRMATION_PHRASE}
              </p>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={Boolean(pendingBerkasId)}
                onClick={closeDestructionDialog}
              >
                Batal
              </Button>
              <Button
                type="button"
                className="gap-1.5 bg-error text-white hover:bg-error/90"
                disabled={!canSubmitDestruction}
                onClick={approveDestruction}
              >
                {pendingBerkasId
                  ? <Loader2 size={14} className="animate-spin" />
                  : <AlertTriangle size={14} />}
                Konfirmasi Musnahkan Data
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-error/20 bg-error/5 py-20">
            <AlertCircle size={32} className="text-error" />
            <p className="text-sm text-on-surface-variant">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchData}>Coba Lagi</Button>
          </div>
        ) : folders.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 py-20">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-orange-500/10">
              <Trash2 size={24} className="text-orange-600" />
            </div>
            <p className="font-headline text-lg font-bold text-on-surface">Belum ada berkas usul musnah</p>
            <p className="max-w-md text-center text-xs text-on-surface-variant">
              Berkas Inaktif yang diusulkan musnah akan muncul di halaman ini sampai statusnya menjadi Dimusnahkan.
            </p>
          </div>
        ) : (
          <BerkasLifecycleTable
            folders={folders}
            pendingBerkasId={pendingBerkasId}
            onOpenDestructionDialog={openDestructionDialog}
          />
        )}
      </div>
    </PageLayout>
  )
}

function BerkasLifecycleTable({
  folders,
  pendingBerkasId,
  onOpenDestructionDialog,
}: {
  folders: BerkasFolder[]
  pendingBerkasId: string | null
  onOpenDestructionDialog: (folder: BerkasFolder) => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-surface-container-low/30 text-left">
              <th className="w-10 px-4 py-3 text-center font-semibold uppercase tracking-wider text-outline">No</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-outline">Jenis Pembayaran</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-outline">Status Berkas</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-outline">Status Arsip</th>
              <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-outline">Jumlah Dokumen</th>
              <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-outline">Dokumen Workflow</th>
              <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-outline">Dokumen Manual</th>
              <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-outline">Total Nominal</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-outline">Nomor SPM</th>
              <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-outline">Tanggal Ditutup</th>
              <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-outline">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {folders.map((folder, index) => (
              <tr key={folder.berkas_id} className="border-t border-outline-variant/20 transition-colors hover:bg-primary/5">
                <td className="px-4 py-3 text-center text-outline">{index + 1}</td>
                <td className="px-4 py-3 text-on-surface">
                  <p className="font-semibold">
                    {formatKlasifikasiLabel(folder.klasifikasi_kode_snapshot, folder.klasifikasi_nama_snapshot)}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <StatusBerkasBadge status={folder.status_berkas} />
                </td>
                <td className="px-4 py-3">
                  <StatusArsipBadge statusArsip={folder.status_arsip} statusBerkas={folder.status_berkas} />
                </td>
                <td className="px-4 py-3 text-center text-on-surface">{folder.item_count}</td>
                <td className="px-4 py-3 text-center text-on-surface">{folder.workflow_item_count}</td>
                <td className="px-4 py-3 text-center text-on-surface">{folder.manual_item_count}</td>
                <td className="px-4 py-3 text-right text-on-surface">{formatNominalRupiah(folder.total_nominal_realisasi)}</td>
                <td className="px-4 py-3 font-semibold text-on-surface">{folder.nomor_spm ?? '-'}</td>
                <td className="px-4 py-3 text-center text-on-surface-variant">{formatNullableDateLabel(folder.closed_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-center gap-2">
                    <Link
                      to="/arsiparis/berkas/$id"
                      params={{ id: folder.berkas_id }}
                      className="inline-flex h-7 items-center rounded-lg border border-outline-variant/40 px-2.5 text-[11px] font-semibold text-primary hover:bg-primary/5"
                    >
                      Detail
                    </Link>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="h-7 gap-1.5 bg-error px-2.5 text-[11px] text-white hover:bg-error/90"
                      disabled={pendingBerkasId === folder.berkas_id}
                      onClick={() => onOpenDestructionDialog(folder)}
                    >
                      {pendingBerkasId === folder.berkas_id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <AlertTriangle size={14} />}
                      {pendingBerkasId === folder.berkas_id ? 'Memproses...' : 'Musnahkan Data'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-widest text-outline">{label}</p>
      <p className="mt-2 font-headline text-2xl font-extrabold text-on-surface">{value}</p>
    </div>
  )
}

function StatusBerkasBadge({ status }: { status: string }) {
  const className = status === 'CLOSED'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : status === 'OPEN'
      ? 'border-blue-200 bg-blue-50 text-blue-700'
      : 'border-slate-200 bg-slate-50 text-slate-700'

  return <Badge className={className}>{formatBerkasStatusLabel(status)}</Badge>
}

function StatusArsipBadge({ statusArsip, statusBerkas }: { statusArsip: string | null; statusBerkas: string }) {
  const className = statusArsip === 'USUL_MUSNAH'
    ? 'border-orange-200 bg-orange-50 text-orange-700'
    : 'border-slate-200 bg-slate-50 text-slate-700'

  return <Badge className={className}>{formatBerkasArchiveStatusLabel(statusArsip, statusBerkas)}</Badge>
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const payload = error.payload
    if (payload && typeof payload === 'object' && 'error' in payload) {
      const message = payload.error
      if (typeof message === 'string') return message
    }
    return 'Gagal mengambil daftar berkas usul musnah'
  }

  return 'Terjadi kesalahan'
}
