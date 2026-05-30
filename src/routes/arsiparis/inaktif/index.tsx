import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  AlertCircle,
  ArchiveX,
  ArrowRightCircle,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { PageLayout } from '#/components/dashboard/PageLayout'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  formatBerkasArchiveStatusLabel,
  formatBerkasStatusLabel,
  formatKlasifikasiLabel,
  formatNominalRupiah,
  formatNullableDateLabel,
  resolveBerkasLifecycleAction,
} from '#/lib/archive/berkas-arsip-page-format'
import { ApiError, apiFetch } from '#/lib/api-client'

export const Route = createFileRoute('/arsiparis/inaktif/')({ component: ArsipInaktifPage })

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

function ArsipInaktifPage() {
  const navigate = useNavigate()
  const [folders, setFolders] = useState<BerkasFolder[]>([])
  const [summary, setSummary] = useState<BerkasFolderListResponse['summary'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [pendingBerkasId, setPendingBerkasId] = useState<string | null>(null)

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      const json = await apiFetch<BerkasFolderListResponse>('/arsiparis/berkas', {
        query: {
          status_berkas: 'CLOSED',
          status_arsip: 'INAKTIF',
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

  async function proposeDestruction(folder: BerkasFolder) {
    const lifecycleAction = resolveBerkasLifecycleAction(folder.status_berkas, folder.status_arsip)
    if (lifecycleAction?.action !== 'propose_destruction') return
    if (!window.confirm(lifecycleAction.confirmation)) return

    setPendingBerkasId(folder.berkas_id)
    setActionError(null)
    setActionSuccess(null)

    try {
      await apiFetch(`/arsiparis/berkas/${encodeURIComponent(folder.berkas_id)}/lifecycle`, {
        method: 'POST',
        body: JSON.stringify({ action: 'propose_destruction' }),
      })
      setActionSuccess(lifecycleAction.successMessage)
      await navigate({ to: '/arsiparis/usul-musnah' })
    } catch (error) {
      setActionError(resolveErrorMessage(error))
    } finally {
      setPendingBerkasId(null)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  return (
    <PageLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-outline">
              <Link to="/arsiparis" className="hover:text-primary">Kepala Sub Bagian Umum</Link>
              <ChevronRight size={10} />
              <span className="text-primary">Daftar Arsip Inaktif</span>
            </div>
            <h2 className="font-headline text-2xl font-extrabold text-on-surface">Daftar Arsip Inaktif</h2>
            <p className="mt-1 text-xs text-on-surface-variant">
              Folder-first untuk berkas yang sudah ditutup dan berstatus arsip Inaktif.
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            Aksi Usulkan Musnah hanya mengubah status lifecycle berkas. File fisik tidak dihapus.
          </div>
        </div>

        {summary && (
          <div className="grid gap-3 md:grid-cols-4">
            <SummaryCard label="Berkas Inaktif" value={summary.total_rows_returned} />
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
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-amber-500/10">
              <ArchiveX size={24} className="text-amber-600" />
            </div>
            <p className="font-headline text-lg font-bold text-on-surface">Belum ada berkas inaktif</p>
            <p className="max-w-md text-center text-xs text-on-surface-variant">
              Berkas yang sudah ditutup dan dipindahkan ke status Inaktif akan muncul di halaman ini.
            </p>
          </div>
        ) : (
          <BerkasLifecycleTable
            folders={folders}
            pendingBerkasId={pendingBerkasId}
            onProposeDestruction={proposeDestruction}
          />
        )}
      </div>
    </PageLayout>
  )
}

function BerkasLifecycleTable({
  folders,
  pendingBerkasId,
  onProposeDestruction,
}: {
  folders: BerkasFolder[]
  pendingBerkasId: string | null
  onProposeDestruction: (folder: BerkasFolder) => void
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
                      className="h-7 gap-1.5 px-2.5 text-[11px]"
                      disabled={pendingBerkasId === folder.berkas_id}
                      onClick={() => onProposeDestruction(folder)}
                    >
                      {pendingBerkasId === folder.berkas_id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <ArrowRightCircle size={14} />}
                      {pendingBerkasId === folder.berkas_id ? 'Memproses...' : 'Usulkan Musnah'}
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
  const className = statusArsip === 'INAKTIF'
    ? 'border-amber-200 bg-amber-50 text-amber-700'
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
    return 'Gagal mengambil daftar berkas inaktif'
  }

  return 'Terjadi kesalahan'
}
