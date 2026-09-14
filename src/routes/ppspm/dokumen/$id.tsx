import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { ConfirmDialog } from '#/components/ui/ConfirmDialog'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { StatusBadge } from '#/components/ui/StatusBadge'
import { LampiranDibersihkanBadge } from '#/components/dokumen/LampiranDibersihkanBadge'
import { useAppToast } from '#/components/ui/AppToast'
import { ActivityLog } from '#/components/dokumen/ActivityLog'
import { AttachmentViewer } from '#/components/dokumen/AttachmentViewer'
import { WorkflowPanel } from '#/components/workflow/PpkPpspmPagePrimitives'
import {
  ChevronLeft, ChevronRight, AlertTriangle,
  CheckCircle2, FileText, History, Info, Loader2, X, Banknote,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import { formatDate } from '#/lib/utils/format'
import { ApiError, apiMutation } from '#/lib/api-mutation'
import { apiFetch } from '#/lib/api-client'

export const Route = createFileRoute('/ppspm/dokumen/$id')({ component: PpspmDokumenDetailPage })

type DokumenDetail = {
  id: string; judul: string; fungsi_nama: string; kegiatan_nama: string
  is_ketua_tim: boolean; status: string; lampiran_urls: any[]
  tahun: number; tanggal: string; created_by: string; created_at: string
  lampiran_dibersihkan_at?: string | null
  lampiran_dibersihkan_alasan?: string | null
  revision_notes?: string
  nominal_realisasi: number | null
  is_non_material?: boolean
  komponen_id?: string | null
  komponen_nama?: string
  jenis_permintaan_id?: string | null
  kategori_permintaan_id?: string | null
  detail_permintaan_id?: string | null
  jenis_permintaan_nama?: string
  kategori_permintaan_nama?: string
  detail_permintaan_nama?: string
  jenis_dokumen_nama?: string
  jenis_dokumen_id?: string | null
  nama_dokumen?: string | null
}

const WORKFLOW_STEPS = [
  { key: 'DRAFT', label: 'Draf' },
  { key: 'IN_PPK_VALIDATION', label: 'PPK' },
  { key: 'IN_PPSPM_APPROVAL', label: 'PPSPM' },
  { key: 'COMPLETED', label: 'Selesai' },
]

const WORKFLOW_STEPS_NON_MATERIAL = [
  { key: 'DRAFT', label: 'Draf' },
  { key: 'TERSIMPAN', label: 'Tersimpan' },
]

const DETAIL_TABS = [
  { key: 'metadata', label: 'Metadata Dokumen', icon: Info },
  { key: 'lampiran', label: 'Lampiran', icon: FileText },
  { key: 'riwayat', label: 'Riwayat', icon: History },
] as const

type DetailTab = typeof DETAIL_TABS[number]['key']

function getWorkflowIdx(status: string) { return WORKFLOW_STEPS.findIndex(s => s.key === status) }
function getWorkflowIdxNonMaterial(status: string) { return WORKFLOW_STEPS_NON_MATERIAL.findIndex(s => s.key === status) }

type ActionResult = {
  documentId: string
  title: string
  kind: 'approve' | 'reject'
}

function PpspmDokumenDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { showToast } = useAppToast()
  const [dokumen, setDokumen] = useState<DokumenDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<DetailTab>('metadata')
  const [actionResult, setActionResult] = useState<ActionResult | null>(null)

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    setLoading(true)
    try {
      const json = await apiFetch<{ dokumen: DokumenDetail }>(`/ppspm/dokumen/${id}`)
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
      await apiMutation(`/api/ppspm/dokumen/${id}/approve`, { method: 'POST' })
      showToast({
        title: 'Berhasil',
        description: 'Dokumen berhasil disetujui.',
        variant: 'success',
      })
      setApproveOpen(false)
      setActionResult({ documentId: id, title: dokumen?.judul ?? 'Dokumen', kind: 'approve' })
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        showToast({
          title: 'Gagal',
          description: payload && typeof payload === 'object' && 'error' in payload
            ? (payload as { error?: string }).error ?? 'Dokumen gagal disetujui. Coba lagi.'
            : 'Dokumen gagal disetujui. Coba lagi.',
          variant: 'error',
        })
        return
      }

      showToast({
        title: 'Gagal',
        description: 'Dokumen gagal disetujui. Coba lagi.',
        variant: 'error',
      })
    } finally { setActionLoading(null) }
  }

  async function handleReject(catatan: string) {
    const trimmed = catatan.trim()
    if (trimmed.length < 10) return
    setActionLoading('reject')
    try {
      await apiMutation(`/api/ppspm/dokumen/${id}/reject`, {
        method: 'POST',
        body: { catatan: trimmed },
      })
      showToast({
        title: 'Berhasil',
        description: 'Dokumen berhasil dikembalikan ke PPK.',
        variant: 'success',
      })
      setRejectOpen(false)
      setActionResult({ documentId: id, title: dokumen?.judul ?? 'Dokumen', kind: 'reject' })
    } catch (err) {
      const description =
        err instanceof ApiError &&
        err.payload && typeof err.payload === 'object' && 'error' in err.payload
          ? (err.payload as { error?: string }).error ?? 'Dokumen gagal dikembalikan. Coba lagi.'
          : 'Dokumen gagal dikembalikan. Coba lagi.'
      showToast({ title: 'Gagal', description, variant: 'error' })
    } finally { setActionLoading(null) }
  }

  function handleBack() {
    if (window.history.length > 1) {
      window.history.back()
      return
    }

    navigate({ to: '/ppspm/inbox' })
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
        action={<Button variant="outline" size="sm" onClick={() => navigate({ to: '/ppspm/inbox' })}>Kembali</Button>}
      />
    </PageLayout>
  )

  if (!dokumen) return (
    <PageLayout>
      <ErrorState
        title="Dokumen tidak ditemukan"
        description="Dokumen tidak ditemukan atau tidak dalam tahap persetujuan PPSPM."
        variant="page"
        action={<Button variant="outline" size="sm" onClick={() => navigate({ to: '/ppspm/inbox' })}>Kembali ke Inbox</Button>}
      />
    </PageLayout>
  )

  if (actionResult) {
    const isApprove = actionResult.kind === 'approve'
    return (
      <PageLayout className="min-h-full bg-bg-surface px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-3xl flex-col items-center justify-center px-2 py-8 text-center">
          <div className={cn(
            'flex size-20 items-center justify-center rounded-full border',
            isApprove
              ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
              : 'border-orange-200 bg-orange-50 text-brand-solid-hover',
          )}>
            {isApprove ? <CheckCircle2 size={38} strokeWidth={2.4} /> : <AlertTriangle size={34} strokeWidth={2.2} />}
          </div>
          <p className="mt-6 text-xs font-bold text-brand-solid-hover">
            {isApprove ? 'Persetujuan PPSPM selesai' : 'Penolakan PPSPM selesai'}
          </p>
          <h1 className="mt-2 font-headline text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl">
            {isApprove ? 'Dokumen Berhasil Disetujui' : 'Dokumen Dikembalikan ke PPK'}
          </h1>
          <p className="mt-3 max-w-xl text-sm font-medium leading-relaxed text-zinc-600">
            Dokumen <span className="font-bold text-zinc-950">{actionResult.title}</span>{' '}
            {isApprove
              ? 'telah disetujui dan statusnya menjadi Selesai.'
              : 'telah dikembalikan ke PPK untuk diperbaiki.'}
          </p>

          <div className="mt-7 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Link to="/ppspm/inbox">
              <Button size="lg" className="w-full bg-brand-solid text-white hover:bg-brand-solid-hover sm:w-auto">
                Setujui Dokumen Lain
              </Button>
            </Link>
            <Button
              variant="outline"
              size="lg"
              className="w-full border-brand-border bg-white sm:w-auto"
              onClick={() => { setActionResult(null); fetchData() }}
            >
              Lihat Detail Dokumen
            </Button>
            <Link to="/ppspm">
              <Button variant="ghost" size="lg" className="w-full sm:w-auto">
                Kembali ke Beranda
              </Button>
            </Link>
          </div>
        </div>
      </PageLayout>
    )
  }

  const isNonMaterial = dokumen.is_non_material === true ||
    (dokumen.is_non_material === undefined && !dokumen.jenis_permintaan_id && !dokumen.kategori_permintaan_id && !dokumen.detail_permintaan_id)
  const workflowSteps = isNonMaterial ? WORKFLOW_STEPS_NON_MATERIAL : WORKFLOW_STEPS
  const workflowIdx = isNonMaterial
    ? getWorkflowIdxNonMaterial(dokumen.status)
    : getWorkflowIdx(dokumen.status)

  return (
    <PageLayout className="min-h-full bg-bg-surface px-4 py-4 sm:px-6 lg:px-7 lg:py-5">
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

        <ConfirmDialog
          open={rejectOpen}
          onOpenChange={next => { if (!next) setRejectOpen(false) }}
          tone="destructive"
          title="Tolak Dokumen"
          description="Dokumen akan dikembalikan ke PPK untuk diperbaiki. Jelaskan alasan penolakan pada catatan di bawah."
          confirmLabel="Tolak Dokumen"
          pending={actionLoading === 'reject'}
          withReason={{
            label: 'Catatan Penolakan',
            placeholder: 'Jelaskan mengapa dokumen ditolak dan perlu dikembalikan ke PPK...',
            minLength: 10,
            maxLength: 2000,
          }}
          onConfirm={result => handleReject(result?.reason ?? '')}
        />

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            aria-label="Kembali ke inbox PPSPM"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-800"
          >
            <ChevronLeft size={18} />
          </button>
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
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <StatusBadge status={dokumen.status} className="text-xs font-semibold" />
            <LampiranDibersihkanBadge
              lampiranDibersihkanAt={dokumen.lampiran_dibersihkan_at}
              lampiranDibersihkanAlasan={dokumen.lampiran_dibersihkan_alasan}
            />
          </div>
        </div>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 px-1 py-1 sm:px-2">
            <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl border border-brand-border bg-bg-surface p-1">
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
                        ? 'bg-bg-surface text-brand-solid shadow-sm'
                        : 'text-zinc-500 hover:bg-bg-surface hover:text-zinc-950',
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
            <div className="rounded-t-[1.5rem] bg-gradient-to-r from-brand-solid to-brand-gradient-to px-4 py-4 text-white sm:px-5">
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

            <div className="min-w-0 rounded-b-[1.5rem] border border-t-0 border-brand-border bg-bg-surface p-4 sm:p-5">
              <section className={cn(activeTab === 'metadata' ? 'block' : 'hidden')}>
                <MetadataDetailCard dokumen={dokumen} isNonMaterial={isNonMaterial} />
              </section>

              <section className={cn(activeTab === 'lampiran' ? 'block' : 'hidden')}>
                <AttachmentViewer dokumen={dokumen as any} lampiranUrls={dokumen.lampiran_urls} apiType="ppspm" />
              </section>

              <section className={cn(activeTab === 'riwayat' ? 'block' : 'hidden')}>
                <ActivityLog dokumenId={id} />
              </section>
            </div>
          </WorkflowPanel>

          <aside className="min-w-0 space-y-1.5 xl:sticky xl:top-3">
            <RoleStatusPanel
              status={dokumen.status}
              workflowIdx={workflowIdx}
              workflowSteps={workflowSteps}
              isNonMaterial={isNonMaterial}
            />

            {dokumen.status === 'NEED_REVISION' && (
              <RevisionNoteCard
                title="Catatan Revisi dari PPSPM"
                revisionNotes={dokumen.revision_notes || 'Tidak ada catatan'}
              />
            )}

            <div className="space-y-1.5 px-0.5 pt-0.5">
              {dokumen.status === 'IN_PPSPM_APPROVAL' && (
                <>
                  <Button size="lg" className="h-9 w-full gap-1.5 rounded-xl bg-brand-solid text-xs font-bold text-white shadow-sm shadow-orange-500/20 hover:bg-brand-solid-hover" onClick={() => setApproveOpen(true)} disabled={!!actionLoading}>
                    {actionLoading === 'approve' ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    Setujui Dokumen
                  </Button>
                  <Button variant="destructive" size="lg" className="h-9 w-full gap-1.5 rounded-xl text-xs font-bold" onClick={() => setRejectOpen(true)} disabled={!!actionLoading}>
                    {actionLoading === 'reject' ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                    Tolak
                  </Button>
                </>
              )}
              <Button variant="outline" size="lg" className="h-9 w-full gap-1.5 rounded-xl border-brand-border bg-bg-surface text-xs font-bold" onClick={handleBack}>
                <ChevronLeft size={13} />
                Kembali
              </Button>
            </div>
          </aside>
        </div>
      </div>
    </PageLayout>
  )
}

function MetadataDetailCard({ dokumen, isNonMaterial }: { dokumen: DokumenDetail; isNonMaterial: boolean }) {
  const jenisLabel = isNonMaterial ? 'Nama Dokumen' : 'Jenis Permintaan'
  const jenisValue = isNonMaterial ? dokumen.nama_dokumen : dokumen.jenis_permintaan_nama

  const metadataItems = [
    { label: 'Judul Dokumen', value: dokumen.judul },
    { label: 'Fungsi / Departemen', value: dokumen.fungsi_nama ?? '-' },
    { label: 'Kegiatan Kerja', value: dokumen.kegiatan_nama ?? '-' },
    ...(!isNonMaterial
      ? [{ label: 'Komponen', value: dokumen.komponen_nama ?? '-' }]
      : []),
    {
      label: jenisLabel,
      value: (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>{jenisValue ?? '-'}</span>
          <span className="rounded-md border border-orange-100 bg-orange-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-brand-solid">
            {isNonMaterial ? 'Non-Material' : 'Material'}
          </span>
        </span>
      ),
    },
    ...(!isNonMaterial
      ? [
          { label: 'Kategori Permintaan', value: dokumen.kategori_permintaan_nama ?? '-' },
          { label: 'Detail Bidang / Permintaan', value: dokumen.detail_permintaan_nama ?? '-' },
        ]
      : []),
    ...(!isNonMaterial && dokumen.nominal_realisasi !== null && dokumen.nominal_realisasi !== undefined
      ? [{
          label: 'Nominal Realisasi',
          value: `Rp ${Number(dokumen.nominal_realisasi).toLocaleString('id-ID')}`,
          accent: true,
        }]
      : []),
    {
      label: 'Tahun / Tanggal',
      value: `${dokumen.tahun}${dokumen.tanggal ? ` - ${formatDate(dokumen.tanggal)}` : ''}`,
    },
    { label: 'Peran Pengaju', value: dokumen.is_ketua_tim ? 'Ketua Tim' : 'Anggota' },
    {
      label: 'Diajukan Oleh',
      value: (
        <span>
          <span>{getDisplaySubmitter(dokumen.created_by)}</span>
          {dokumen.created_at && (
            <span className="mt-1 block text-[11px] font-medium text-zinc-500">
              Disubmit pada {formatDate(dokumen.created_at)}
            </span>
          )}
        </span>
      ),
    },
  ]

  return (
    <div className="rounded-[1.15rem] border border-brand-border bg-bg-surface px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="grid gap-x-10 gap-y-4 md:grid-cols-2">
        {metadataItems.map(item => (
          <div key={item.label} className="min-w-0">
            <p className="mb-1 text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">
              {item.label}
            </p>
            <div className={cn(
              'break-words text-[13px] font-bold leading-snug text-zinc-950 sm:text-sm',
              'accent' in item && item.accent ? 'font-mono text-zinc-950' : '',
            )}>
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function getDisplaySubmitter(createdBy: string): string {
  if (!createdBy || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(createdBy)) {
    return 'Pegawai pengaju'
  }
  return createdBy
}

function RevisionNoteCard({
  title,
  revisionNotes,
}: {
  title: string
  revisionNotes: string
}) {
  return (
    <WorkflowPanel className="border-rose-100 bg-rose-50/55 p-2.5 shadow-none">
      <div className="flex items-start gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-bg-surface text-rose-600">
          <AlertTriangle size={11} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-rose-700">{title}</p>
          <div className="mt-1 rounded-lg bg-bg-surface p-1.5">
            <p className="line-clamp-3 text-[10px] font-medium italic leading-relaxed text-rose-950">
              "{revisionNotes || 'Tidak ada catatan revisi tertulis.'}"
            </p>
          </div>
        </div>
      </div>
    </WorkflowPanel>
  )
}

function RoleStatusPanel({
  isNonMaterial,
  status,
  workflowIdx,
  workflowSteps,
}: {
  isNonMaterial: boolean
  status: string
  workflowIdx: number
  workflowSteps: { key: string; label: string }[]
}) {
  const revisionStepKey = 'IN_PPSPM_APPROVAL'
  const isRevisionStatus = status === 'NEED_REVISION'
  const revisionStepIdx = workflowSteps.findIndex(step => step.key === revisionStepKey)
  const isTerminalSuccess = status === 'COMPLETED' || status === 'TERSIMPAN'
  const statusTone = getStatusTone(status)

  return (
    <WorkflowPanel className="rounded-[1.25rem] border-brand-border bg-bg-surface p-3.5 shadow-sm shadow-zinc-950/5">
      <p className="text-[9px] font-black uppercase tracking-[0.22em] text-zinc-500">
        Status Dokumen
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500">Status Saat Ini</p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className={cn('size-2.5 rounded-full', statusTone === 'success' ? 'bg-emerald-500' : 'bg-brand-solid')} />
            <StatusBadge status={status} className="border-0 bg-transparent px-0 text-sm font-bold text-zinc-950 shadow-none hover:bg-transparent" />
          </div>
        </div>

        <div className="rounded-xl border border-brand-border bg-bg-surface p-2.5 shadow-sm shadow-zinc-950/5">
          <p className="text-[11px] font-medium leading-relaxed text-zinc-700">
            {getStatusDescription(status, isNonMaterial)}
          </p>
        </div>

        <div className="border-y border-dashed border-brand-border py-3.5">
          <div className="flex items-center gap-0">
            {workflowSteps.map((step, i) => {
              const isCurrent = step.key === status
              const showAsRevision = isRevisionStatus && step.key === revisionStepKey
              const isSuccessStep = isTerminalSuccess || (isRevisionStatus ? i < revisionStepIdx : workflowIdx > i)
              const isAttentionStep = !isTerminalSuccess && (isRevisionStatus ? showAsRevision : isCurrent)
              const isCompleteSegment = isTerminalSuccess || (isRevisionStatus ? i < revisionStepIdx - 1 : workflowIdx > i + 1)
              const isActiveSegment = !isTerminalSuccess && (isRevisionStatus ? i === revisionStepIdx - 1 : workflowIdx === i + 1)

              return (
                <div key={step.key} className="relative flex flex-1 flex-col items-center">
                  {i < workflowSteps.length - 1 && (
                    <div
                      className={cn(
                        'absolute top-2.5 -right-1/2 z-0 h-px w-full',
                        isCompleteSegment ? 'bg-emerald-500' : isActiveSegment ? 'bg-brand-solid' : 'bg-brand-border',
                      )}
                    />
                  )}
                  <div
                    className={cn(
                      'relative z-10 flex size-5 items-center justify-center rounded-full border text-[9px] font-bold',
                      isSuccessStep
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : isAttentionStep
                          ? 'border-orange-500 bg-orange-500 text-white shadow-sm shadow-orange-500/20'
                          : 'border-brand-border bg-bg-surface text-zinc-400',
                    )}
                  >
                    {showAsRevision && !isTerminalSuccess ? <AlertTriangle size={10} /> : isSuccessStep && !isCurrent ? <CheckCircle2 size={10} /> : i + 1}
                  </div>
                  <span
                    className={cn(
                      'mt-1.5 text-center text-[8px] font-black uppercase tracking-[0.08em]',
                      isSuccessStep ? 'text-emerald-700' : isAttentionStep ? 'text-brand-solid' : 'text-zinc-400',
                    )}
                  >
                    {step.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </WorkflowPanel>
  )
}

function getStatusTone(status: string): 'success' | 'attention' {
  return status === 'COMPLETED' || status === 'TERSIMPAN' ? 'success' : 'attention'
}

function getStatusDescription(status: string, isNonMaterial: boolean): string {
  if (isNonMaterial) {
    return status === 'TERSIMPAN'
      ? 'Non-material tersimpan tanpa alur PPK/PPSPM.'
      : 'Status non-material dapat dipantau di sini.'
  }

  if (status === 'IN_PPSPM_APPROVAL') {
    return 'Menunggu persetujuan PPSPM. Tinjau hasil validasi PPK dan lampiran sebelum menyelesaikan dokumen.'
  }
  if (status === 'IN_PPK_VALIDATION') {
    return 'Dokumen masih berada pada tahap validasi PPK.'
  }
  if (status === 'NEED_REVISION') {
    return 'Dokumen dikembalikan ke PPK. Periksa catatan revisi.'
  }
  if (status === 'COMPLETED') {
    return 'Dokumen selesai disetujui.'
  }
  return 'Dokumen sedang dipantau dalam alur workflow.'
}
