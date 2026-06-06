import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { ConfirmDialog } from '#/components/ui/ConfirmDialog'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { StatusBadge } from '#/components/ui/StatusBadge'
import { ActivityLog } from '#/components/dokumen/ActivityLog'
import { AttachmentViewer } from '#/components/dokumen/AttachmentViewer'
import {
  RevisionNotePanel,
  WorkflowFieldCard,
  WorkflowPanel,
  WorkflowTimeline,
} from '#/components/workflow/PpkPpspmPagePrimitives'
import {
  ChevronLeft, ChevronRight, AlertTriangle,
  CheckCircle2, FileText, History, Info, Loader2, X, Banknote,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import { formatDate } from '#/lib/utils/format'
import { ApiError, apiMutation } from '#/lib/api-mutation'
import { apiFetch } from '#/lib/api-client'

export const Route = createFileRoute('/bendahara/dokumen/$id')({ component: BendaharaDokumenDetailPage })

type DokumenDetail = {
  id: string; judul: string; fungsi_nama: string; kegiatan_nama: string
  is_ketua_tim: boolean; status: string; lampiran_urls: any[]
  tahun: number; tanggal: string; created_by: string; created_at: string
  revision_notes?: string
  nominal_realisasi: number | null
  is_non_material?: boolean
  jenis_permintaan_id?: string | null
  kategori_permintaan_id?: string | null
  detail_permintaan_id?: string | null
  jenis_permintaan_nama?: string
  kategori_permintaan_nama?: string
  detail_permintaan_nama?: string
  jenis_dokumen_nama?: string
  jenis_dokumen_id?: string | null
}

const WORKFLOW_STEPS = [
  { key: 'DRAFT', label: 'Draf' },
  { key: 'IN_PPK_VALIDATION', label: 'PPK' },
  { key: 'IN_BENDAHARA_APPROVAL', label: 'PPSPM' },
  { key: 'COMPLETED', label: 'Selesai' },
]

const DETAIL_TABS = [
  { key: 'metadata', label: 'Metadata Dokumen', icon: Info },
  { key: 'lampiran', label: 'Lampiran', icon: FileText },
  { key: 'riwayat', label: 'Riwayat', icon: History },
] as const

type DetailTab = typeof DETAIL_TABS[number]['key']

function getWorkflowIdx(status: string) { return WORKFLOW_STEPS.findIndex(s => s.key === status) }

function BendaharaDokumenDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const [dokumen, setDokumen] = useState<DokumenDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectCatatan, setRejectCatatan] = useState('')
  const [rejectError, setRejectError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<DetailTab>('metadata')

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    setLoading(true)
    try {
      const json = await apiFetch<{ dokumen: DokumenDetail }>(`/bendahara/dokumen/${id}`)
      setDokumen(json.dokumen)
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        setFetchError(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error ?? 'Gagal'
          : 'Gagal')
        return
      }

      setFetchError('Terjadi kesalahan')
    } finally { setLoading(false) }
  }

  async function handleApprove() {
    setActionLoading('approve')
    try {
      await apiMutation(`/api/bendahara/dokumen/${id}/approve`, { method: 'POST' })
      navigate({ to: '/bendahara/selesai' })
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        alert(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error ?? 'Gagal'
          : 'Gagal')
        return
      }

      alert('Terjadi kesalahan')
    } finally { setActionLoading(null) }
  }

  async function handleReject() {
    if (rejectCatatan.trim().length < 10) { setRejectError('Catatan minimal 10 karakter'); return }
    setActionLoading('reject')
    try {
      await apiMutation(`/api/bendahara/dokumen/${id}/reject`, {
        method: 'POST',
        body: { catatan: rejectCatatan.trim() },
      })
      navigate({ to: '/bendahara/ditolak' })
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        setRejectError(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error ?? 'Gagal'
          : 'Gagal')
        return
      }

      setRejectError('Terjadi kesalahan')
    } finally { setActionLoading(null) }
  }

  if (loading) return (
    <PageLayout>
      <LoadingState label="Memuat detail dokumen PPSPM" />
    </PageLayout>
  )

  if (fetchError) return (
    <PageLayout>
      <ErrorState
        title="Dokumen tidak dapat dibuka"
        description={fetchError}
        variant="page"
        action={<Button variant="outline" size="sm" onClick={() => navigate({ to: '/bendahara/inbox' })}>Kembali</Button>}
      />
    </PageLayout>
  )

  if (!dokumen) return (
    <PageLayout>
      <ErrorState
        title="Dokumen tidak ditemukan"
        description="Dokumen tidak ditemukan atau tidak dalam tahap persetujuan PPSPM."
        variant="page"
        action={<Button variant="outline" size="sm" onClick={() => navigate({ to: '/bendahara/inbox' })}>Kembali ke Inbox</Button>}
      />
    </PageLayout>
  )

  const workflowIdx = getWorkflowIdx(dokumen.status)

  return (
    <PageLayout className="min-h-full bg-[#FFF9F4] px-4 py-4 sm:px-6 lg:px-7 lg:py-5">
      <div className="mx-auto max-w-[92rem] space-y-4">
        <ConfirmDialog
          open={approveOpen}
          onOpenChange={setApproveOpen}
          title="Setujui dokumen ini?"
          description="Dokumen akan disetujui oleh PPSPM dan statusnya berubah menjadi Selesai. Pastikan seluruh lampiran dan nominal sudah sesuai."
          confirmLabel="Setujui Dokumen"
          cancelLabel="Batal"
          pending={actionLoading === 'approve'}
          onConfirm={handleApprove}
        />

        {rejectOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) { setRejectOpen(false); setRejectCatatan(''); setRejectError(null) } }}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative z-10 mx-4 w-full max-w-md rounded-3xl border border-[#F0E1D5] bg-[#FFFAF6] shadow-2xl shadow-zinc-950/10">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-orange-100">
                <AlertTriangle size={18} className="text-error shrink-0" />
                <p className="font-semibold text-on-surface">Tolak Dokumen</p>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5">Catatan Penolakan <span className="text-error">*</span></label>
                  <textarea value={rejectCatatan} onChange={e => { setRejectCatatan(e.target.value); setRejectError(null) }} rows={4}
                    placeholder="Jelaskan mengapa dokumen ditolak dan perlu dikembalikan ke PPK..."
                    className={cn('w-full rounded-xl border bg-[#FFFDF9] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-100 resize-none', rejectError ? 'border-error' : 'border-[#F0E1D5]')} />
                  <p className="text-[10px] text-outline mt-1">{rejectCatatan.length}/2000 karakter (min. 10)</p>
                  {rejectError && <p className="text-[10px] text-error mt-1">{rejectError}</p>}
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => { setRejectOpen(false); setRejectCatatan(''); setRejectError(null) }} disabled={!!actionLoading}>Batal</Button>
                  <Button variant="destructive" className="flex-1" onClick={handleReject} disabled={!!actionLoading}>
                    {actionLoading === 'reject' ? <Loader2 size={14} className="animate-spin" /> : 'Tolak Dokumen'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Link
            to="/bendahara/inbox"
            aria-label="Kembali ke inbox PPSPM"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-800"
          >
            <ChevronLeft size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="line-clamp-2 font-headline text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">
              {dokumen.judul}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <Banknote size={13} className="text-zinc-500" />
              <span className="font-medium text-zinc-800">PPSPM</span>
              <ChevronRight size={12} className="text-zinc-300" />
              <span>Persetujuan Dokumen</span>
            </div>
          </div>
          <div className="hidden shrink-0 sm:block">
            <StatusBadge status={dokumen.status} className="text-xs font-semibold" />
          </div>
        </div>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 px-1 py-1 sm:px-2">
            <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl border border-[#F0E1D5] bg-[#F7F2EC] p-1">
              {DETAIL_TABS.map(tab => {
                const selected = activeTab === tab.key
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      'flex min-h-8 min-w-28 items-center justify-center rounded-lg px-3 text-[12px] font-bold transition',
                      selected
                        ? 'bg-[#FFFDF9] text-[#FF5A00] shadow-sm'
                        : 'text-zinc-500 hover:bg-[#FFFAF6] hover:text-zinc-950',
                    )}
                    aria-pressed={selected}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
          <WorkflowPanel className="min-w-0 overflow-visible border-0 bg-transparent p-0 shadow-none">
            <div className="rounded-t-[1.5rem] bg-gradient-to-r from-[#F97316] to-[#FB923C] px-4 py-4 text-white sm:px-5">
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white">
                  {(() => {
                    const Icon = DETAIL_TABS.find(tab => tab.key === activeTab)?.icon ?? Info
                    return <Icon size={17} />
                  })()}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-headline text-base font-bold tracking-tight text-white sm:text-lg">
                    {DETAIL_TABS.find(tab => tab.key === activeTab)?.label}
                  </h2>
                  <p className="mt-0.5 max-w-2xl text-[10px] font-medium leading-relaxed text-white/90 sm:text-xs">
                    {activeTab === 'metadata'
                      ? 'Tinjau hasil validasi PPK, status, dan metadata sebelum persetujuan PPSPM.'
                      : activeTab === 'lampiran'
                        ? 'Kelengkapan dokumen dengan aksi pratinjau dan unduh.'
                        : 'Riwayat aktivitas dokumen.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="min-w-0 rounded-b-[1.5rem] border border-t-0 border-[#F1E5DA] bg-[#FFFDF9] p-4 sm:p-5">
              <section className={cn(activeTab === 'metadata' ? 'block' : 'hidden', 'space-y-4')}>
                <WorkflowTimeline
                  steps={WORKFLOW_STEPS}
                  status={dokumen.status}
                  currentIndex={workflowIdx}
                  revisionStepKey="IN_BENDAHARA_APPROVAL"
                  revisionIcon={<AlertTriangle size={14} />}
                />

                {dokumen.status === 'NEED_REVISION' && (
                  <RevisionNotePanel title="Catatan Revisi dari PPSPM">
                    {dokumen.revision_notes || 'Tidak ada catatan'}
                  </RevisionNotePanel>
                )}

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <WorkflowFieldCard label="Fungsi" value={dokumen.fungsi_nama ?? '-'} />
                  <WorkflowFieldCard label="Kegiatan" value={dokumen.kegiatan_nama ?? '-'} />
                  {dokumen.jenis_permintaan_id && (
                    <WorkflowFieldCard label="Jenis Permintaan" value={dokumen.jenis_permintaan_nama ?? '-'} />
                  )}
                  {dokumen.kategori_permintaan_id && (
                    <WorkflowFieldCard label="Kategori Permintaan" value={dokumen.kategori_permintaan_nama ?? '-'} />
                  )}
                  {dokumen.detail_permintaan_id && (
                    <WorkflowFieldCard label="Detail Permintaan" value={dokumen.detail_permintaan_nama ?? '-'} />
                  )}
                  <WorkflowFieldCard label="Tahun" value={dokumen.tahun} />
                  <WorkflowFieldCard label="Tanggal" value={formatDate(dokumen.tanggal)} />
                  <WorkflowFieldCard label="Peran" value={dokumen.is_ketua_tim ? 'Ketua Tim' : 'Anggota'} />
                  <WorkflowFieldCard label="Diajukan" value={formatDate(dokumen.created_at)} />
                  {dokumen.nominal_realisasi !== null && dokumen.nominal_realisasi !== undefined && (
                    <WorkflowFieldCard
                      label="Nominal Realisasi"
                      value={`Rp ${dokumen.nominal_realisasi.toLocaleString('id-ID')}`}
                      className="border-orange-200 bg-orange-50/35"
                    />
                  )}
                </div>
              </section>

              <section className={cn(activeTab === 'lampiran' ? 'block' : 'hidden')}>
                <AttachmentViewer dokumen={dokumen as any} lampiranUrls={dokumen.lampiran_urls} apiType="bendahara" />
              </section>

              <section className={cn(activeTab === 'riwayat' ? 'block' : 'hidden')}>
                <ActivityLog dokumenId={id} />
              </section>
            </div>
          </WorkflowPanel>

          <aside className="min-w-0 space-y-2.5 xl:sticky xl:top-3">
            <WorkflowPanel className="border-[#FDBA8C] bg-[#FFF1E7] p-3 shadow-none">
              <div className="flex items-start gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center text-[#FF5A00]">
                  <Info size={13} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#FF5A00]">Tugas PPSPM</p>
                  <div className="mt-2">
                    <StatusBadge status={dokumen.status} className="text-xs font-semibold" />
                  </div>
                  <p className="mt-2 text-[11px] font-medium leading-relaxed text-zinc-700">
                    Tinjau dokumen yang sudah divalidasi PPK sebelum menyelesaikan persetujuan PPSPM.
                  </p>
                </div>
              </div>
            </WorkflowPanel>

            <div className="space-y-2.5 px-0.5 py-1">
              <Link to="/bendahara/inbox" className="block">
                <Button variant="outline" size="lg" className="h-10 w-full gap-1.5 rounded-xl border-[#F0E1D5] bg-[#FFFDF9]">
                  <ChevronLeft size={14} />
                  Kembali
                </Button>
              </Link>
              {dokumen.status === 'IN_BENDAHARA_APPROVAL' && (
                <>
                  <Button variant="destructive" size="lg" className="h-10 w-full gap-2 rounded-xl text-sm font-bold" onClick={() => { setRejectCatatan(''); setRejectError(null); setRejectOpen(true) }} disabled={!!actionLoading}>
                    {actionLoading === 'reject' ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
                    Tolak
                  </Button>
                  <Button size="lg" className="h-10 w-full gap-2 rounded-xl bg-[#FF5A00] text-sm font-bold text-white hover:bg-[#EA580C]" onClick={() => setApproveOpen(true)} disabled={!!actionLoading}>
                    {actionLoading === 'approve' ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                    Setujui Dokumen
                  </Button>
                </>
              )}
              {dokumen.status === 'COMPLETED' && (
                <Link to="/bendahara/selesai" className="block">
                  <Button variant="outline" size="lg" className="h-10 w-full gap-1.5 rounded-xl border-[#F0E1D5] bg-[#FFFDF9]">
                    <ChevronLeft size={14} />
                    Kembali
                  </Button>
                </Link>
              )}
              {dokumen.status === 'NEED_REVISION' && (
                <Link to="/bendahara/ditolak" className="block">
                  <Button variant="outline" size="lg" className="h-10 w-full gap-1.5 rounded-xl border-[#F0E1D5] bg-[#FFFDF9]">
                    <ChevronLeft size={14} />
                    Kembali
                  </Button>
                </Link>
              )}
            </div>
          </aside>
        </div>
      </div>
    </PageLayout>
  )
}
