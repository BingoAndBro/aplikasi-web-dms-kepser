import { createFileRoute, Link, useBlocker, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { AppDialog } from '#/components/ui/AppDialog'
import { useAppToast } from '#/components/ui/AppToast'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { ActivityLog } from '#/components/dokumen/ActivityLog'
import { AttachmentEditor, type KelengkapanItem } from '#/components/dokumen/AttachmentEditor'
import { WorkflowPanel } from '#/components/workflow/PpkPpspmPagePrimitives'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileEdit,
  Info,
  Loader2,
  Send,
  X,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import type { DokumenRow, LampiranUrl } from '#/lib/dokumen-helpers'
import { formatDate } from '#/lib/utils/format'
import { ApiError, apiMutation } from '#/lib/api-mutation'
import { apiFetch } from '#/lib/api-client'

export const Route = createFileRoute('/ppk/dokumen/$id/resubmit')({
  component: PpkResubmitPage,
})

const WORKFLOW_STEPS = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'IN_PPK_VALIDATION', label: 'PPK' },
  { key: 'IN_BENDAHARA_APPROVAL', label: 'PPSPM' },
  { key: 'COMPLETED', label: 'Selesai' },
]

const REVISION_TABS = [
  { key: 'summary', label: 'Metadata & Ringkasan Revisi' },
  { key: 'edit', label: 'Metadata & Lampiran' },
  { key: 'history', label: 'Riwayat' },
] as const

type RevisionTab = typeof REVISION_TABS[number]['key']

type SubmitData = {
  lampiranUrls: LampiranUrl[]
  nominalRealisasi: number | null
}

type SubmitConfirmationState = SubmitData & {
  hasUnsavedChanges: boolean
}

type ResubmitSuccess = {
  documentId: string
  title: string
  attachmentCount: number
  isNonMaterial: boolean
}

type GuardedCallback = () => void | Promise<void>

function getWorkflowIndex(status: string): number {
  if (status === 'NEED_REVISION') return -1
  return WORKFLOW_STEPS.findIndex(s => s.key === status)
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-'
  return `Rp ${value.toLocaleString('id-ID')}`
}

function getSafeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const payload = error.payload
    return payload && typeof payload === 'object' && 'error' in payload
      ? (payload as { error?: string }).error || fallback
      : fallback
  }

  return error instanceof Error && error.message ? error.message : fallback
}

type KelengkapanApiItem = KelengkapanItem & {
  kegiatan_id?: string | null
  is_ketua_tim?: boolean
  jenis_permintaan_id?: string | null
  kategori_permintaan_id?: string | null
  detail_permintaan_id?: string | null
}

function matchesCurrentChain(item: KelengkapanApiItem, dokumen: DokumenRow): boolean {
  if (dokumen.detail_permintaan_id) {
    return item.detail_permintaan_id === dokumen.detail_permintaan_id
  }

  if (dokumen.kategori_permintaan_id) {
    return item.kategori_permintaan_id === dokumen.kategori_permintaan_id
      && item.detail_permintaan_id == null
  }

  if (dokumen.jenis_permintaan_id) {
    return item.jenis_permintaan_id === dokumen.jenis_permintaan_id
      && item.kategori_permintaan_id == null
      && item.detail_permintaan_id == null
  }

  return true
}

async function fetchKelengkapanForDokumen(dokumen: DokumenRow): Promise<KelengkapanItem[]> {
  const data = await apiFetch<KelengkapanApiItem[]>('/master-kelengkapan', {
    query: {
      kegiatan_id: dokumen.kegiatan_jenis_id,
      is_ketua_tim: dokumen.is_ketua_tim,
    },
  })

  return data
    .filter(item => matchesCurrentChain(item, dokumen))
    .map(({ id, nama_dokumen, required }) => ({ id, nama_dokumen, required }))
}

function PpkResubmitPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { showToast } = useAppToast()
  const submitInFlightRef = useRef(false)
  const submitConfirmationResolverRef = useRef<((confirmed: boolean) => void) | null>(null)
  const manualLeaveActionRef = useRef<GuardedCallback | null>(null)
  const manualLeaveResolveRef = useRef<(() => void) | null>(null)

  const [dokumen, setDokumen] = useState<DokumenRow | null>(null)
  const [lampiranUrls, setLampiranUrls] = useState<LampiranUrl[]>([])
  const [kelengkapan, setKelengkapan] = useState<KelengkapanItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [dokIsNonMaterial, setDokIsNonMaterial] = useState(false)
  const [attachmentDirty, setAttachmentDirty] = useState(false)
  const [guardEnabled, setGuardEnabled] = useState(true)
  const [activeTab, setActiveTab] = useState<RevisionTab>('summary')
  const [submitConfirmation, setSubmitConfirmation] = useState<SubmitConfirmationState | null>(null)
  const [manualLeaveConfirmationOpen, setManualLeaveConfirmationOpen] = useState(false)
  const [returnConfirmationOpen, setReturnConfirmationOpen] = useState(false)
  const [kembalikanLoading, setKembalikanLoading] = useState(false)
  const [resubmitSuccess, setResubmitSuccess] = useState<ResubmitSuccess | null>(null)
  const [submitRequestSignal, setSubmitRequestSignal] = useState(0)
  const [cancelRequestSignal, setCancelRequestSignal] = useState(0)

  const isDirty = guardEnabled && attachmentDirty && !resubmitSuccess

  const shouldBlockLeave = useCallback(
    ({ current, next }: { current: { pathname: string }; next: { pathname: string } }) => {
      return isDirty && current.pathname !== next.pathname
    },
    [isDirty],
  )
  const leaveBlocker = useBlocker({
    shouldBlockFn: shouldBlockLeave,
    enableBeforeUnload: false,
    disabled: !isDirty,
    withResolver: true,
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !isDirty) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = 'Perubahan yang belum disimpan akan hilang.'
      return 'Perubahan yang belum disimpan akan hilang.'
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    void fetchData()
  }, [id])

  async function fetchData() {
    setLoading(true)
    setFetchError(null)
    try {
      const json = await apiFetch<{ dokumen: DokumenRow }>(`/ppk/resubmit/${id}`)
      setDokumen(json.dokumen)
      setLampiranUrls(json.dokumen.lampiran_urls ?? [])
      setDokIsNonMaterial(json.dokumen.is_non_material === true)
      setAttachmentDirty(false)
      setGuardEnabled(true)
      setResubmitSuccess(null)
      setKelengkapan([])

      if (json.dokumen.kegiatan_jenis_id && !json.dokumen.is_non_material) {
        try {
          const kelData = await fetchKelengkapanForDokumen(json.dokumen)
          setKelengkapan(kelData)
        } catch (err) {
          console.error('Failed to load kelengkapan for PPK resubmit:', err)
          setKelengkapan([])
        }
      }
    } catch (err) {
      setFetchError(getSafeErrorMessage(err, 'Terjadi kesalahan'))
    } finally {
      setLoading(false)
    }
  }

  function confirmBeforeSubmit(data: SubmitConfirmationState): Promise<boolean> {
    setSubmitConfirmation(data)

    return new Promise(resolve => {
      submitConfirmationResolverRef.current = resolve
    })
  }

  function resolveSubmitConfirmation(confirmed: boolean) {
    submitConfirmationResolverRef.current?.(confirmed)
    submitConfirmationResolverRef.current = null
    setSubmitConfirmation(null)
  }

  const confirmIfDirty = useCallback(
    (callback: GuardedCallback) => {
      if (!isDirty) {
        return callback()
      }

      return new Promise<void>(resolve => {
        manualLeaveActionRef.current = callback
        manualLeaveResolveRef.current = resolve
        setManualLeaveConfirmationOpen(true)
      })
    },
    [isDirty],
  )

  function resolveManualLeaveRequest() {
    manualLeaveActionRef.current = null
    manualLeaveResolveRef.current?.()
    manualLeaveResolveRef.current = null
    setManualLeaveConfirmationOpen(false)
  }

  function keepEditing() {
    if (leaveBlocker.status === 'blocked') {
      leaveBlocker.reset()
      return
    }

    resolveManualLeaveRequest()
  }

  async function leaveWithoutSaving() {
    if (leaveBlocker.status === 'blocked') {
      setGuardEnabled(false)
      setAttachmentDirty(false)
      leaveBlocker.proceed()
      return
    }

    const action = manualLeaveActionRef.current
    const resolve = manualLeaveResolveRef.current
    manualLeaveActionRef.current = null
    manualLeaveResolveRef.current = null
    setManualLeaveConfirmationOpen(false)

    if (action) {
      setGuardEnabled(false)
      setAttachmentDirty(false)
      await action()
    }

    resolve?.()
  }

  async function handleSubmit(data: SubmitData) {
    if (submitInFlightRef.current || !dokumen) return

    submitInFlightRef.current = true
    setSubmitError(null)
    setGuardEnabled(false)

    try {
      try {
        await apiMutation(`/api/ppk/resubmit/${id}`, {
          method: 'PATCH',
          body: {
            lampiranUrls: data.lampiranUrls,
            nominalRealisasi: data.nominalRealisasi,
          },
        })
      } catch (err) {
        throw new Error(getSafeErrorMessage(err, 'Gagal menyimpan'))
      }

      try {
        await apiMutation(`/api/ppk/resubmit/${id}`, {
          method: 'POST',
        })
      } catch (err) {
        throw new Error(getSafeErrorMessage(err, 'Gagal mengajukan ulang'))
      }

      setAttachmentDirty(false)
      setResubmitSuccess({
        documentId: dokumen.id,
        title: dokumen.judul,
        attachmentCount: data.lampiranUrls.length,
        isNonMaterial: dokIsNonMaterial,
      })
      showToast({
        id: `ppk-resubmit-success-${dokumen.id}`,
        title: 'Revisi PPK berhasil diajukan ulang',
        description: 'Dokumen dikirim kembali ke PPSPM.',
        variant: 'success',
      })
    } catch (err) {
      setGuardEnabled(true)
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan'
      setSubmitError(message)
      showToast({
        title: 'Gagal mengajukan ulang',
        description: 'Periksa kembali dokumen atau coba lagi.',
        variant: 'error',
      })
    } finally {
      submitInFlightRef.current = false
    }
  }

  function handleCancel() {
    navigate({ to: '/ppk/revisi' })
  }

  async function handleKembalikan() {
    setReturnConfirmationOpen(false)
    setKembalikanLoading(true)
    let succeeded = false
    try {
      await apiMutation(`/api/ppk/kembalikan/${id}`, { method: 'POST' })
      succeeded = true
      showToast({
        id: `ppk-resubmit-return-success-${id}`,
        title: 'Dokumen dikembalikan ke Pegawai',
        description: 'Dokumen keluar dari antrean revisi PPK.',
        variant: 'success',
      })
      navigate({ to: '/ppk/revisi' })
    } catch (err) {
      setGuardEnabled(true)
      showToast({
        title: 'Gagal mengembalikan dokumen',
        description: getSafeErrorMessage(err, 'Terjadi kesalahan'),
        variant: 'error',
      })
    } finally {
      setKembalikanLoading(false)
      if (!succeeded) {
        setGuardEnabled(true)
      }
    }
  }

  if (loading) {
    return (
      <PageLayout>
        <div className="mx-auto max-w-4xl">
          <LoadingState variant="page" label="Memuat revisi PPK" />
        </div>
      </PageLayout>
    )
  }

  if (fetchError || !dokumen) {
    return (
      <PageLayout>
        <ErrorState
          title="Dokumen revisi tidak dapat dibuka"
          description={fetchError ?? 'Dokumen tidak ditemukan'}
          variant="page"
          action={<Button variant="outline" size="sm" onClick={() => navigate({ to: '/ppk/revisi' })}>Kembali ke Revisi</Button>}
        />
      </PageLayout>
    )
  }

  if (resubmitSuccess) {
    return (
      <PageLayout>
        <div className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-3xl flex-col items-center justify-center px-2 py-8 text-center">
          <div className="flex size-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={38} />
          </div>
          <p className="mt-6 text-xs font-bold text-[#EA580C]">
            Pengajuan ulang PPK selesai
          </p>
          <h1 className="mt-2 font-headline text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl">
            Revisi Berhasil Dikirim
          </h1>
          <p className="mt-3 max-w-xl text-sm font-medium leading-relaxed text-zinc-600">
            Dokumen <span className="font-bold text-zinc-950">{resubmitSuccess.title}</span> telah dikirim kembali ke PPSPM.
          </p>

          <div className="mt-6 grid w-full gap-3 rounded-2xl border border-[#F0E1D5] bg-[#FFFDF9] p-4 text-left shadow-sm sm:grid-cols-3">
            <div>
              <p className="text-[10px] font-semibold text-zinc-500">Jenis Dokumen</p>
              <p className="mt-1 text-sm font-bold text-zinc-950">
                {resubmitSuccess.isNonMaterial ? 'Non-Material' : 'Material'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-zinc-500">Lampiran</p>
              <p className="mt-1 text-sm font-bold text-zinc-950">
                {resubmitSuccess.attachmentCount} file
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-zinc-500">Tahap berikutnya</p>
              <p className="mt-1 text-sm font-bold text-zinc-950">
                Review PPSPM
              </p>
            </div>
          </div>

          <div className="mt-7 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Link to="/ppk/revisi">
              <Button variant="outline" size="lg" className="w-full border-[#F0E1D5] bg-white sm:w-auto">
                Lihat Daftar Revisi
              </Button>
            </Link>
            <Link to="/ppk/dokumen/$id" params={{ id: resubmitSuccess.documentId }}>
              <Button size="lg" className="w-full bg-[#F97316] text-white hover:bg-[#EA580C] sm:w-auto">
                Lihat Detail Dokumen
              </Button>
            </Link>
            <Link to="/ppk">
              <Button variant="ghost" size="lg" className="w-full sm:w-auto">
                Kembali ke Beranda PPK
              </Button>
            </Link>
          </div>
        </div>
      </PageLayout>
    )
  }

  const workflowIdx = getWorkflowIndex(dokumen.status)
  const requiredCount = kelengkapan.filter(item => item.required).length
  const uploadedRequiredCount = kelengkapan
    .filter(item => item.required)
    .filter(item => lampiranUrls.some(lampiran => lampiran.kelengkapan_id === item.id))
    .length
  const metadataItems = [
    ['Fungsi', dokumen.fungsi_nama ?? '-'],
    ['Kegiatan', dokumen.kegiatan_nama ?? '-'],
    ...(dokumen.jenis_permintaan_id ? [['Jenis Permintaan', dokumen.jenis_permintaan_nama ?? '-']] : []),
    ...(dokumen.kategori_permintaan_id ? [['Kategori Permintaan', dokumen.kategori_permintaan_nama ?? '-']] : []),
    ...(dokumen.detail_permintaan_id ? [['Detail Permintaan', dokumen.detail_permintaan_nama ?? '-']] : []),
    ['Tahun', dokumen.tahun ?? '-'],
    ['Tanggal', dokumen.tanggal ? formatDate(dokumen.tanggal) : '-'],
    ...(!dokIsNonMaterial ? [['Nominal Realisasi', formatCurrency(dokumen.nominal_realisasi)]] : []),
  ]

  return (
    <PageLayout className="min-h-full bg-[#FFF9F4] px-4 py-4 sm:px-6 lg:px-7 lg:py-5">
      <div className="mx-auto max-w-[92rem] space-y-4">
        <div className="flex items-center gap-3">
          <Link
            to="/ppk/revisi"
            aria-label="Kembali ke daftar revisi PPK"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-800"
          >
            <ChevronLeft size={18} />
          </Link>
          <div className="min-w-0">
            <h1 className="font-headline text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">
              Revisi Dokumen PPK
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <FileEdit size={13} className="text-zinc-500" />
              <span className="font-medium text-zinc-800">Dokumen Perlu Revisi PPK</span>
              <ChevronRight size={12} className="text-zinc-300" />
              <span className="truncate">{dokumen.judul}</span>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 px-1 py-1 sm:px-2">
            <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl border border-[#F0E1D5] bg-[#F7F2EC] p-1">
              {REVISION_TABS.map(tab => {
                const selected = activeTab === tab.key

                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      'flex min-h-8 min-w-32 items-center justify-center rounded-lg px-3 text-[12px] font-bold transition',
                      selected
                        ? 'bg-[#FFFDF9] text-[#FF5A00] shadow-sm'
                        : 'text-zinc-500 hover:bg-[#FFFAF6] hover:text-zinc-950',
                    )}
                    aria-pressed={selected}
                  >
                    <span>{tab.label}</span>
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
                  {activeTab === 'summary' ? (
                    <Info size={17} />
                  ) : activeTab === 'edit' ? (
                    <FileEdit size={17} />
                  ) : (
                    <CheckCircle2 size={17} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-headline text-base font-bold tracking-tight text-white sm:text-lg">
                    {REVISION_TABS.find(tab => tab.key === activeTab)?.label}
                  </h2>
                  <p className="mt-0.5 max-w-2xl text-[10px] font-medium leading-relaxed text-white/90 sm:text-xs">
                    {activeTab === 'summary'
                      ? 'Alur dan metadata utama.'
                      : activeTab === 'edit'
                        ? 'Perbarui metadata atau lampiran.'
                        : 'Riwayat aktivitas dokumen.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="min-w-0 rounded-b-[1.5rem] border border-t-0 border-[#F1E5DA] bg-[#FFFDF9] p-4 sm:p-5">
              <section className={cn(activeTab === 'summary' ? 'block' : 'hidden', 'space-y-3')}>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-500">Alur Dokumen</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                    {WORKFLOW_STEPS.map((step, i) => {
                      const isCurrent = step.key === dokumen.status
                      const isPast = workflowIdx > i || dokumen.status === 'COMPLETED'
                      const showAsRevision = dokumen.status === 'NEED_REVISION' && step.key === 'IN_BENDAHARA_APPROVAL'
                      const showAsRevisionPpk = dokumen.status === 'NEED_REVISION' && step.key === 'IN_PPK_VALIDATION'

                      return (
                        <div key={step.key} className="flex items-center gap-2">
                          <span className={cn(
                            'inline-flex items-center gap-1 text-xs font-semibold',
                            showAsRevision ? 'text-rose-600'
                              : showAsRevisionPpk ? 'text-[#FF5A00]'
                                : isCurrent || isPast ? 'text-emerald-700' : 'text-zinc-500',
                          )}>
                            {showAsRevision ? (
                              <AlertTriangle size={13} />
                            ) : (showAsRevisionPpk || isPast) && !isCurrent ? (
                              <CheckCircle2 size={13} />
                            ) : (
                              <span className="size-1.5 rounded-full bg-current" />
                            )}
                            {step.label}
                          </span>
                          {i < WORKFLOW_STEPS.length - 1 && (
                            <ChevronRight size={12} className="text-[#D8C8BA]" />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="pt-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-500">Metadata Dokumen</p>
                  <div className="mt-1.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {metadataItems.map(([label, value]) => (
                      <div
                        key={label}
                        className={cn(
                          'rounded-xl border bg-[#FFFDF9] px-3 py-2.5',
                          label === 'Nominal Realisasi' ? 'border-orange-200 bg-orange-50/35' : 'border-orange-100',
                        )}
                      >
                        <p className={cn(
                          'mb-1 text-[10px] font-black uppercase tracking-[0.14em]',
                          label === 'Nominal Realisasi' ? 'text-[#EA580C]' : 'text-zinc-500',
                        )}>{label}</p>
                        <p className={cn(
                          'text-sm font-semibold leading-relaxed',
                          label === 'Nominal Realisasi' ? 'text-[#FF5A00]' : 'text-zinc-950',
                        )}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className={cn(activeTab === 'edit' ? 'block' : 'hidden')}>
                {submitError && (
                  <ErrorState
                    title="Gagal mengajukan ulang"
                    description={submitError}
                    variant="destructive"
                    className="mb-4 border-red-200"
                  />
                )}

                <AttachmentEditor
                  dokumen={dokumen}
                  lampiranUrls={lampiranUrls}
                  kelengkapan={dokIsNonMaterial ? [] : kelengkapan}
                  isNonMaterial={dokIsNonMaterial}
                  nominalValue={dokumen.nominal_realisasi}
                  submitLabel="Ajukan Ulang ke PPSPM"
                  onSubmit={handleSubmit}
                  confirmBeforeSubmit={confirmBeforeSubmit}
                  hideDefaultActions
                  submitRequestSignal={submitRequestSignal}
                  cancelRequestSignal={cancelRequestSignal}
                  onCancel={handleCancel}
                  onDirtyChange={setAttachmentDirty}
                  confirmIfDirty={confirmIfDirty}
                />
              </section>

              <section className={cn(activeTab === 'history' ? 'block' : 'hidden')}>
                {activeTab === 'history' && <ActivityLog dokumenId={id} />}
              </section>
            </div>
          </WorkflowPanel>

          <aside className="min-w-0 space-y-2.5 xl:sticky xl:top-3">
            <WorkflowPanel className="border-rose-100 bg-rose-50/55 p-3 shadow-none">
              <div className="flex items-start gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white text-rose-600">
                  <AlertCircle size={13} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-rose-700">Catatan Revisi</p>
                  <p className="mt-1.5 text-[11px] font-medium text-rose-700">
                    Dikembalikan oleh: <span className="font-bold">PPSPM</span>
                  </p>
                  <div className="mt-1.5 rounded-lg bg-white/75 p-2">
                    <p className="line-clamp-3 text-[11px] font-medium italic leading-relaxed text-rose-950">
                      "{dokumen.revision_notes || 'Tidak ada catatan revisi tertulis.'}"
                    </p>
                  </div>
                </div>
              </div>
            </WorkflowPanel>

            <WorkflowPanel className="border-[#FDBA8C] bg-[#FFF1E7] p-3 shadow-none">
              <div className="flex items-start gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center text-[#FF5A00]">
                  <Info size={13} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#FF5A00]">Aksi Revisi PPK</p>
                  <p className="mt-1 text-[11px] font-medium leading-relaxed text-[#FF5A00]">
                    Perbarui lampiran atau nominal jika diperlukan. Jika dokumen sudah sesuai, ajukan ulang ke PPSPM.
                  </p>
                </div>
              </div>
            </WorkflowPanel>

            <div className="space-y-2.5 px-0.5 py-1">
              <div className="flex items-center justify-between gap-2 px-1 text-[11px]">
                <span className="font-semibold text-zinc-500">Kelengkapan</span>
                <span className="font-bold text-zinc-900">
                  {dokIsNonMaterial
                    ? `${lampiranUrls.length} file pendukung`
                    : `${uploadedRequiredCount}/${requiredCount || 0} wajib terunggah`}
                </span>
              </div>
              <div className={cn(
                'flex min-h-9 items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.08em]',
                attachmentDirty
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-[#E8E2DC] bg-[#F7F2EC] text-zinc-500',
              )}>
                {attachmentDirty ? (
                  <>
                    <span className="size-1.5 rounded-full bg-amber-500" />
                    Revisi siap diajukan
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={12} />
                    Tidak ada perubahan
                  </>
                )}
              </div>
              <div className="space-y-2.5">
                <Button
                  type="button"
                  size="lg"
                  onClick={() => {
                    setActiveTab('edit')
                    setSubmitRequestSignal(current => current + 1)
                  }}
                  className="h-10 w-full gap-2 rounded-xl bg-[#FF5A00] text-sm font-bold text-white shadow-sm shadow-orange-500/20 hover:bg-[#EA580C]"
                >
                  <Send size={15} />
                  Ajukan Ulang
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  onClick={() => setReturnConfirmationOpen(true)}
                  disabled={kembalikanLoading}
                  className="h-10 w-full gap-2 rounded-xl border-orange-300 bg-transparent text-sm font-bold text-[#EA580C] hover:bg-orange-50 hover:text-[#C2410C]"
                >
                  {kembalikanLoading ? <Loader2 size={15} className="animate-spin" /> : <ArrowLeft size={15} />}
                  Kembalikan ke Pegawai
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  onClick={() => {
                    setActiveTab('edit')
                    setCancelRequestSignal(current => current + 1)
                  }}
                  className="h-10 w-full gap-2 rounded-xl border-rose-400 bg-transparent text-sm font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  <X size={15} />
                  Batal
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <AppDialog
        open={leaveBlocker.status === 'blocked' || manualLeaveConfirmationOpen}
        onOpenChange={(open) => {
          if (!open) keepEditing()
        }}
        title={
          <span className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#FFF3D6] text-[#D97706]">
              <Info size={22} />
            </span>
            <span className="font-headline text-lg font-bold tracking-tight text-zinc-950">
              Keluar tanpa menyimpan?
            </span>
          </span>
        }
        description="Perubahan yang belum disimpan akan hilang."
        descriptionClassName="text-sm font-medium leading-relaxed text-zinc-600"
        contentClassName="border-[#F0E1D5] bg-[#FFFAF6] shadow-2xl shadow-zinc-950/10 sm:rounded-3xl sm:p-6"
        showCloseButton
        size="sm"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={keepEditing}
              className="border-[#F0E1D5] bg-[#FFFAF6]"
            >
              Tetap di halaman
            </Button>
            <Button
              type="button"
              onClick={() => { void leaveWithoutSaving() }}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              Keluar tanpa menyimpan
            </Button>
          </>
        }
      >
        <div />
      </AppDialog>

      <AppDialog
        open={submitConfirmation !== null}
        onOpenChange={(open) => {
          if (!open && submitConfirmation) resolveSubmitConfirmation(false)
        }}
        title={
          <span className="flex items-center gap-3 pr-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF3D6] text-[#D97706]">
              <Send size={20} />
            </span>
            <span className="font-headline text-xl font-extrabold tracking-tight text-zinc-950">
              {submitConfirmation?.hasUnsavedChanges ? 'Ajukan ulang dokumen?' : 'Ajukan ulang tanpa perubahan?'}
            </span>
          </span>
        }
        description={
          submitConfirmation?.hasUnsavedChanges
            ? 'Dokumen akan disimpan lalu dikirim kembali ke PPSPM.'
            : 'Tidak ada perubahan baru yang terdeteksi. Jika dokumen sudah sesuai, dokumen tetap dapat dikirim kembali ke PPSPM.'
        }
        descriptionClassName="text-sm font-medium leading-relaxed text-zinc-600"
        contentClassName="border-[#F0E1D5] bg-[#FFFAF6] shadow-lg shadow-zinc-950/5 sm:rounded-2xl sm:p-6"
        showCloseButton
        size="md"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => resolveSubmitConfirmation(false)}
              className="border-[#F0E1D5] bg-white"
            >
              Periksa Kembali
            </Button>
            <Button
              type="button"
              size="lg"
              onClick={() => resolveSubmitConfirmation(true)}
              className="bg-[#F97316] text-white hover:bg-[#EA580C]"
            >
              <Send size={14} />
              Ajukan Ulang
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[#F0E1D5] bg-[#FFFDF9] p-4">
              <p className="text-[10px] font-semibold text-zinc-500">Lampiran</p>
              <p className="mt-1 text-sm font-extrabold text-zinc-950">
                {submitConfirmation?.lampiranUrls.length ?? 0} file akan diproses
              </p>
            </div>
            <div className="rounded-xl border border-[#F0E1D5] bg-[#FFFDF9] p-4">
              <p className="text-[10px] font-semibold text-zinc-500">Nominal</p>
              <p className="mt-1 text-sm font-extrabold text-zinc-950">
                {dokIsNonMaterial ? '-' : formatCurrency(submitConfirmation?.nominalRealisasi)}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl bg-[#FFF3D6] p-4">
            {submitInFlightRef.current ? (
              <Loader2 size={17} className="mt-0.5 shrink-0 animate-spin text-[#D97706]" />
            ) : (
              <Info size={17} className="mt-0.5 shrink-0 text-[#D97706]" />
            )}
            <div>
              <p className="text-xs font-bold text-zinc-950">Urutan proses tetap sama</p>
              <p className="mt-1 text-xs font-medium leading-relaxed text-zinc-700">
                Perubahan disimpan terlebih dahulu, lalu dokumen diajukan ulang melalui alur revisi PPK yang sudah berjalan.
              </p>
            </div>
          </div>
        </div>
      </AppDialog>

      <AppDialog
        open={returnConfirmationOpen}
        onOpenChange={setReturnConfirmationOpen}
        title={
          <span className="flex items-center gap-3 pr-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-[#EA580C]">
              <ArrowLeft size={20} />
            </span>
            <span className="font-headline text-xl font-extrabold tracking-tight text-zinc-950">
              Kembalikan ke Pegawai?
            </span>
          </span>
        }
        description="Dokumen akan dikembalikan ke Pegawai melalui alur PPK yang sudah berjalan."
        descriptionClassName="text-sm font-medium leading-relaxed text-zinc-600"
        contentClassName="border-[#F0E1D5] bg-[#FFFAF6] shadow-lg shadow-zinc-950/5 sm:rounded-2xl sm:p-6"
        showCloseButton
        size="md"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setReturnConfirmationOpen(false)}
              className="border-[#F0E1D5] bg-white"
            >
              Periksa Kembali
            </Button>
            <Button
              type="button"
              size="lg"
              onClick={() => {
                setGuardEnabled(false)
                void handleKembalikan()
              }}
              disabled={kembalikanLoading}
              className="bg-[#F97316] text-white hover:bg-[#EA580C]"
            >
              {kembalikanLoading ? <Loader2 size={14} className="animate-spin" /> : <ArrowLeft size={14} />}
              Kembalikan
            </Button>
          </>
        }
      >
        <div className="rounded-xl border border-orange-100 bg-[#FFFDF9] p-4">
          <p className="text-xs font-bold text-zinc-950">Perubahan editor yang belum diajukan tidak ikut disimpan.</p>
          <p className="mt-1 text-xs font-medium leading-relaxed text-zinc-600">
            Gunakan aksi ini hanya jika dokumen memang perlu dikembalikan kepada Pegawai.
          </p>
        </div>
      </AppDialog>
    </PageLayout>
  )
}
