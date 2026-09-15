import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { PegawaiPanel } from '#/components/pegawai/PegawaiPagePrimitives'
import { Button } from '#/components/ui/button'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { StatusBadge } from '#/components/ui/StatusBadge'
import { LampiranDibersihkanBadge } from '#/components/dokumen/LampiranDibersihkanBadge'
import { ActivityLog } from '#/components/dokumen/ActivityLog'
import { AttachmentViewer } from '#/components/dokumen/AttachmentViewer'
import {
  FileText,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  History,
  Info,
  Pencil,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import { formatDate } from '#/lib/utils/format'
import { ApiError, apiFetch } from '#/lib/api-client'

export const Route = createFileRoute('/pegawai/dokumen/$id/')({
  component: DokumenDetailPage,
})

type DokumenDetail = {
  id: string
  judul: string
  fungsi_nama: string
  kegiatan_nama: string
  is_ketua_tim: boolean
  status: string
  revision_notes: string | null
  revision_target: string | null
  lampiran_urls: any[]
  tahun: number
  tanggal: string
  created_at: string
  created_by: string
  pengaju_nama?: string | null
  is_non_material: boolean
  lampiran_dibersihkan_at?: string | null
  lampiran_dibersihkan_alasan?: string | null
  nominal_realisasi: number | null
  keterangan_detail: string | null
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

const WORKFLOW_STEPS_MATERIAL = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'IN_PPK_VALIDATION', label: 'PPK' },
  { key: 'IN_PPSPM_APPROVAL', label: 'PPSPM' },
  { key: 'COMPLETED', label: 'Selesai' },
]

const WORKFLOW_STEPS_NON_MATERIAL = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'TERSIMPAN', label: 'Tersimpan' },
]

const DETAIL_TABS = [
  { key: 'metadata', label: 'Metadata Dokumen', icon: Info },
  { key: 'lampiran', label: 'Lampiran', icon: FileText },
  { key: 'riwayat', label: 'Riwayat', icon: History },
] as const

type DetailTab = typeof DETAIL_TABS[number]['key']

function getWorkflowIndexMaterial(status: string): number {
  if (status === 'NEED_REVISION') return -1
  return WORKFLOW_STEPS_MATERIAL.findIndex(s => s.key === status)
}

function getWorkflowIndexNonMaterial(status: string): number {
  return WORKFLOW_STEPS_NON_MATERIAL.findIndex(s => s.key === status)
}

function DokumenDetailPage() {
  const { id } = Route.useParams()
  const [dok, setDok] = useState<DokumenDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<DetailTab>('metadata')

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    setLoading(true)
    try {
      const json = await apiFetch<{ dokumen: DokumenDetail }>(`/dokumen/${id}`)
      setDok(json.dokumen)
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        setFetchError(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error ?? 'Gagal'
          : 'Gagal')
        return
      }

      setFetchError('Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  function handleBack() {
    if (window.history.length > 1) {
      window.history.back()
      return
    }

    window.location.href = '/pegawai/dokumen'
  }

  if (loading) {
    return (
      <PageLayout>
        <div className="mx-auto max-w-4xl">
          <LoadingState variant="page" label="Memuat detail dokumen" />
        </div>
      </PageLayout>
    )
  }

  if (fetchError) {
    return (
      <PageLayout>
        <ErrorState
          title="Gagal memuat detail dokumen"
          description={fetchError}
          variant="page"
          action={<Link to="/pegawai/dokumen"><Button variant="outline" size="sm">Kembali</Button></Link>}
        />
      </PageLayout>
    )
  }

  if (!dok) {
    return (
      <PageLayout>
        <ErrorState
          title="Dokumen tidak ditemukan"
          description="Dokumen tidak tersedia atau Anda tidak memiliki akses ke detail ini."
          variant="page"
          action={<Link to="/pegawai/dokumen"><Button variant="outline" size="sm">Kembali</Button></Link>}
        />
      </PageLayout>
    )
  }

  const isNonMaterial = dok.is_non_material === true ||
    (dok.is_non_material === undefined && !dok.jenis_permintaan_id && !dok.kategori_permintaan_id && !dok.detail_permintaan_id)

  const workflowSteps = isNonMaterial ? WORKFLOW_STEPS_NON_MATERIAL : WORKFLOW_STEPS_MATERIAL
  const workflowIdx = isNonMaterial
    ? getWorkflowIndexNonMaterial(dok.status)
    : getWorkflowIndexMaterial(dok.status)

  return (
    <PageLayout className="min-h-full bg-bg-surface px-4 py-4 sm:px-6 lg:px-7 lg:py-5">
      <div className="mx-auto max-w-[92rem] space-y-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            aria-label="Kembali ke daftar dokumen"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-800"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="line-clamp-2 font-headline text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">
              {dok.judul}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <ClipboardList size={13} className="text-zinc-500" />
              <span className="font-medium text-zinc-800">Dokumen</span>
              <ChevronRight size={12} className="text-zinc-300" />
              <span>Detail Dokumen</span>
            </div>
          </div>
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <StatusBadge status={dok.status} className="text-xs font-semibold" />
            <LampiranDibersihkanBadge
              lampiranDibersihkanAt={dok.lampiran_dibersihkan_at}
              lampiranDibersihkanAlasan={dok.lampiran_dibersihkan_alasan}
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
          <PegawaiPanel className="min-w-0 overflow-visible border-0 bg-transparent p-0 shadow-none">
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
                      ? 'Data utama dan status dokumen.'
                      : activeTab === 'lampiran'
                        ? 'Pratinjau dan unduh lampiran.'
                        : 'Riwayat aktivitas dokumen.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="min-w-0 rounded-b-[1.5rem] border border-t-0 border-brand-border bg-bg-surface p-4 shadow-sm shadow-zinc-950/5 sm:p-5">
              <section className={cn(activeTab === 'metadata' ? 'block' : 'hidden')}>
                <MetadataDetailCard dok={dok} isNonMaterial={isNonMaterial} />
              </section>

              <section className={cn(activeTab === 'lampiran' ? 'block' : 'hidden')}>
                <AttachmentViewer dokumen={dok as any} lampiranUrls={dok.lampiran_urls} />
              </section>

              <section className={cn(activeTab === 'riwayat' ? 'block' : 'hidden')}>
                <ActivityLog dokumenId={id} />
              </section>
            </div>
          </PegawaiPanel>

          <aside className="min-w-0 space-y-1.5 xl:sticky xl:top-3">
            <WorkflowPanel
              isNonMaterial={isNonMaterial}
              status={dok.status}
              revisionTarget={dok.revision_target}
              workflowIdx={workflowIdx}
              workflowSteps={workflowSteps}
            />

            {dok.status === 'NEED_REVISION' && dok.revision_notes && (
              <RevisionNoteCard
                revisionTarget={dok.revision_target}
                revisionNotes={dok.revision_notes}
              />
            )}

            <div className="space-y-1.5 px-0.5 pt-0.5">
              {isNonMaterial && (
                <Link to="/pegawai/dokumen/$id/edit" params={{ id }} className="block">
                  <Button size="lg" className="h-9 w-full gap-1.5 rounded-xl bg-brand-solid text-xs font-bold text-white shadow-sm shadow-brand-solid/20 hover:bg-brand-solid-hover">
                    <Pencil size={13} />
                    Edit Dokumen
                  </Button>
                </Link>
              )}
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-9 w-full gap-1.5 rounded-xl border-brand-border bg-bg-surface text-xs font-bold"
                onClick={handleBack}
              >
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

function MetadataDetailCard({ dok, isNonMaterial }: { dok: DokumenDetail; isNonMaterial: boolean }) {
  const jenisLabel = isNonMaterial ? 'Nama Dokumen' : 'Jenis Permintaan'
  const jenisValue = isNonMaterial ? dok.nama_dokumen : dok.jenis_permintaan_nama
  const pengajuLabel = getDisplaySubmitter(dok)

  const metadataItems = [
    { label: 'Judul Dokumen', value: dok.judul },
    { label: 'Fungsi / Departemen', value: dok.fungsi_nama ?? '-' },
    { label: 'Kegiatan Kerja', value: dok.kegiatan_nama ?? '-' },
    ...(!isNonMaterial
      ? [{ label: 'Komponen', value: dok.komponen_nama ?? '-' }]
      : []),
    {
      label: jenisLabel,
      value: (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>{jenisValue ?? '-'}</span>
          <span className="rounded-md border border-brand-border bg-brand-surface px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-brand-solid">
            {isNonMaterial ? 'Non-Material' : 'Material'}
          </span>
        </span>
      ),
    },
    ...(!isNonMaterial
      ? [
          { label: 'Kategori Permintaan', value: dok.kategori_permintaan_nama ?? '-' },
          { label: 'Detail Bidang / Permintaan', value: dok.detail_permintaan_nama ?? '-' },
        ]
      : dok.keterangan_detail
        ? [{ label: 'Keterangan Detail', value: dok.keterangan_detail }]
        : []),
    ...(!isNonMaterial && dok.nominal_realisasi !== null && dok.nominal_realisasi !== undefined
      ? [{
          label: 'Nominal Realisasi',
          value: `Rp ${Number(dok.nominal_realisasi).toLocaleString('id-ID')}`,
          accent: true,
        }]
      : []),
    {
      label: 'Tahun / Tanggal',
      value: `${dok.tahun}${dok.tanggal ? ` - ${formatDate(dok.tanggal)}` : ''}`,
    },
    { label: 'Peran Pengaju', value: dok.is_ketua_tim ? 'Ketua Tim' : 'Anggota' },
    {
      label: 'Diajukan Oleh',
      value: (
        <span>
          <span>{pengajuLabel}</span>
          {dok.created_at && (
            <span className="mt-1 block text-[11px] font-medium text-zinc-500">
              Disubmit pada {formatDate(dok.created_at)}
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

function getDisplaySubmitter(dok: DokumenDetail): string {
  if (dok.pengaju_nama) return dok.pengaju_nama
  if (!dok.created_by || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(dok.created_by)) {
    return 'Pegawai pengaju'
  }
  return dok.created_by
}

function RevisionNoteCard({
  revisionTarget,
  revisionNotes,
}: {
  revisionTarget: string | null
  revisionNotes: string
}) {
  const sourceLabel = getRevisionSourceLabel(revisionTarget)
  const targetLabel = revisionTarget === 'PPK' ? 'PPK' : 'Pegawai'

  return (
    <PegawaiPanel className="border-rose-100 bg-rose-50/55 p-2.5 shadow-none">
      <div className="flex items-start gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-bg-surface text-rose-600">
          <AlertTriangle size={11} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-rose-700">Catatan dari {sourceLabel}</p>
          <p className="mt-1 text-[10px] font-medium text-rose-700">
            Dikembalikan ke: <span className="font-bold">{targetLabel}</span>
          </p>
          <div className="mt-1 rounded-lg bg-bg-surface p-1.5">
            <p className="line-clamp-2 text-[10px] font-medium italic leading-relaxed text-rose-950">
              "{revisionNotes || 'Tidak ada catatan revisi tertulis.'}"
            </p>
          </div>
        </div>
      </div>
    </PegawaiPanel>
  )
}

function getRevisionSourceLabel(revisionTarget: string | null): 'PPK' | 'PPSPM' {
  return revisionTarget === 'PPK' ? 'PPSPM' : 'PPK'
}

function getRevisionStepKey(revisionTarget: string | null): string {
  return revisionTarget === 'PPK' ? 'IN_PPSPM_APPROVAL' : 'IN_PPK_VALIDATION'
}

function WorkflowPanel({
  isNonMaterial,
  status,
  revisionTarget,
  workflowIdx,
  workflowSteps,
}: {
  isNonMaterial: boolean
  status: string
  revisionTarget: string | null
  workflowIdx: number
  workflowSteps: { key: string; label: string }[]
}) {
  const revisionStepKey = getRevisionStepKey(revisionTarget)
  const isRevisionStatus = status === 'NEED_REVISION'
  const revisionStepIdx = workflowSteps.findIndex(step => step.key === revisionStepKey)
  const isTerminalSuccess = status === 'COMPLETED' || status === 'TERSIMPAN'
  const statusTone = getStatusTone(status)

  return (
    <PegawaiPanel className="rounded-[1.25rem] border-brand-border bg-bg-surface p-3.5 shadow-sm shadow-zinc-950/5">
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
                      ? 'border-brand-solid bg-brand-solid text-white shadow-sm shadow-brand-solid/20'
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
    </PegawaiPanel>
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

  if (status === 'IN_PPK_VALIDATION') {
    return 'Menunggu validasi PPK. Perubahan status tercatat di riwayat.'
  }
  if (status === 'IN_PPSPM_APPROVAL') {
    return 'Sudah divalidasi PPK dan menunggu PPSPM.'
  }
  if (status === 'NEED_REVISION') {
    return 'Dokumen dikembalikan. Periksa catatan revisi.'
  }
  if (status === 'COMPLETED') {
    return 'Dokumen selesai disetujui.'
  }
  return 'Dokumen sedang dipantau dalam alur workflow.'
}
