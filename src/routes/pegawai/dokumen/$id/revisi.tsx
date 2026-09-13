import { createFileRoute, Link, useBlocker, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { PegawaiPanel } from '#/components/pegawai/PegawaiPagePrimitives'
import { Button } from '#/components/ui/button'
import { ConfirmDialog } from '#/components/ui/ConfirmDialog'
import { useAppToast } from '#/components/ui/AppToast'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { ActivityLog } from '#/components/dokumen/ActivityLog'
import { AttachmentEditor, type KelengkapanItem } from '#/components/dokumen/AttachmentEditor'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileEdit,
  Info,
  Loader2,
  Send,
} from 'lucide-react'
import type { DokumenRow, LampiranUrl } from '#/lib/dokumen-helpers'
import { cn } from '#/lib/utils'
import { formatDate } from '#/lib/utils/format'
import { ApiError, apiMutation } from '#/lib/api-mutation'
import { apiFetch } from '#/lib/api-client'

export const Route = createFileRoute('/pegawai/dokumen/$id/revisi')({
  component: DokumenRevisiPage,
})

const WORKFLOW_STEPS = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'IN_PPK_VALIDATION', label: 'PPK' },
  { key: 'IN_PPSPM_APPROVAL', label: 'PPSPM' },
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
  targetLabel: string
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
  komponen_permintaan_id?: string | null
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

  if (dokumen.komponen_id) {
    return item.komponen_permintaan_id === dokumen.komponen_id
      && item.jenis_permintaan_id == null
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

function DokumenRevisiPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { showToast } = useAppToast()
  const submitInFlightRef = useRef(false)
  const submitConfirmationResolverRef = useRef<((confirmed: boolean) => void) | null>(null)
  const manualLeaveActionRef = useRef<GuardedCallback | null>(null)
  const manualLeaveResolveRef = useRef<(() => void) | null>(null)

  const [dok, setDok] = useState<DokumenRow | null>(null)
  const [kelengkapan, setKelengkapan] = useState<KelengkapanItem[]>([])
  const [lampiranUrls, setLampiranUrls] = useState<LampiranUrl[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isNonMaterial, setIsNonMaterial] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [attachmentDirty, setAttachmentDirty] = useState(false)
  const [guardEnabled, setGuardEnabled] = useState(true)
  const [activeTab, setActiveTab] = useState<RevisionTab>('summary')
  const [submitConfirmation, setSubmitConfirmation] = useState<SubmitConfirmationState | null>(null)
  const [manualLeaveConfirmationOpen, setManualLeaveConfirmationOpen] = useState(false)
  const [resubmitSuccess, setResubmitSuccess] = useState<ResubmitSuccess | null>(null)
  const [submitRequestSignal, setSubmitRequestSignal] = useState(0)
  const [cancelRequestSignal, setCancelRequestSignal] = useState(0)

  const isDirty = guardEnabled && attachmentDirty && !resubmitSuccess
  const targetLabel = isNonMaterial ? 'Ketua Tim' : 'PPK'

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
    setError(null)
    try {
      const json = await apiFetch<{ dokumen: DokumenRow }>(`/dokumen/${id}`)
      const dokumen = json.dokumen as DokumenRow

      if (dokumen.status !== 'NEED_REVISION' || dokumen.revision_target !== 'USER') {
        navigate({ to: '/pegawai/dokumen/$id', params: { id }, replace: true })
        return
      }

      setDok(dokumen)
      setLampiranUrls(dokumen.lampiran_urls as LampiranUrl[] ?? [])
      setAttachmentDirty(false)
      setGuardEnabled(true)
      setResubmitSuccess(null)

      const nonMaterial = dokumen.is_non_material === true ||
        (!dokumen.jenis_permintaan_id && !dokumen.kategori_permintaan_id && !dokumen.detail_permintaan_id)
      setIsNonMaterial(nonMaterial)
      setKelengkapan([])

      if (!nonMaterial && dokumen.kegiatan_jenis_id) {
        try {
          const kelData = await fetchKelengkapanForDokumen(dokumen)
          setKelengkapan(kelData)
        } catch (err) {
          console.error('Failed to load kelengkapan for revisi:', err)
          setKelengkapan([])
        }
      }
    } catch (err) {
      setError(getSafeErrorMessage(err, 'Terjadi kesalahan'))
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
    if (submitInFlightRef.current || !dok) return

    submitInFlightRef.current = true
    setSubmitError(null)
    setGuardEnabled(false)

    try {
      try {
        await apiMutation(`/api/dokumen/${id}`, {
          method: 'PATCH',
          body: { lampiranUrls: data.lampiranUrls, nominalRealisasi: data.nominalRealisasi },
        })
      } catch (err) {
        throw new Error(getSafeErrorMessage(err, 'Gagal menyimpan'))
      }

      try {
        await apiMutation(`/api/dokumen/${id}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (err) {
        throw new Error(getSafeErrorMessage(err, 'Gagal mengajukan ulang'))
      }

      setAttachmentDirty(false)
      setResubmitSuccess({
        documentId: dok.id,
        title: dok.judul,
        targetLabel,
        attachmentCount: data.lampiranUrls.length,
        isNonMaterial,
      })
      showToast({
        id: `revisi-resubmit-success-${dok.id}`,
        title: 'Revisi berhasil diajukan ulang',
        description: `Dokumen dikirim kembali ke ${targetLabel}.`,
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
    navigate({ to: '/pegawai/revisi' })
  }

  if (loading) {
    return (
      <PageLayout>
        <div className="mx-auto max-w-4xl">
          <LoadingState variant="page" label="Memuat revisi dokumen" />
        </div>
      </PageLayout>
    )
  }

  if (error) {
    return (
      <PageLayout>
        <ErrorState
          title="Tidak bisa merevisi"
          description={error}
          variant="page"
          action={<Link to="/pegawai/revisi"><Button variant="outline" size="sm">Kembali ke Daftar</Button></Link>}
        />
      </PageLayout>
    )
  }

  if (!dok) return null

  if (resubmitSuccess) {
    return (
      <PageLayout>
        <div className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-3xl flex-col items-center justify-center px-2 py-8 text-center">
          <div className="flex size-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={38} />
          </div>
          <p className="mt-6 text-xs font-bold text-[#EA580C]">
            Pengajuan ulang selesai
          </p>
          <h1 className="mt-2 font-headline text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl">
            Revisi Berhasil Dikirim
          </h1>
          <p className="mt-3 max-w-xl text-sm font-medium leading-relaxed text-zinc-600">
            Dokumen <span className="font-bold text-zinc-950">{resubmitSuccess.title}</span> telah dikirim kembali ke {resubmitSuccess.targetLabel}.
          </p>

          <div className="mt-6 grid w-full gap-3 rounded-2xl border border-[#F0E1D5] bg-[#FFFAF6] p-4 text-left shadow-sm sm:grid-cols-3">
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
                Review {resubmitSuccess.targetLabel}
              </p>
            </div>
          </div>

          <div className="mt-7 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Link to="/pegawai/revisi" replace>
              <Button size="lg" className="w-full bg-[#F97316] text-white hover:bg-[#EA580C] sm:w-auto">
                Revisi Dokumen Lain
              </Button>
            </Link>
            <Link to="/pegawai/dokumen/$id" params={{ id: resubmitSuccess.documentId }} replace>
              <Button variant="outline" size="lg" className="w-full border-[#F0E1D5] bg-white sm:w-auto">
                Lihat Detail Dokumen
              </Button>
            </Link>
            <Link to="/pegawai" replace>
              <Button variant="ghost" size="lg" className="w-full sm:w-auto">
                Kembali ke Beranda
              </Button>
            </Link>
          </div>
        </div>
      </PageLayout>
    )
  }

  const workflowIdx = getWorkflowIndex(dok.status)
  const requiredCount = kelengkapan.filter(item => item.required).length
  const uploadedRequiredCount = kelengkapan
    .filter(item => item.required)
    .filter(item => lampiranUrls.some(lampiran => lampiran.kelengkapan_id === item.id))
    .length
  const metadataItems = [
    ['Fungsi', dok.fungsi_nama ?? '-'],
    ['Kegiatan', dok.kegiatan_nama ?? '-'],
    ...(dok.komponen_id ? [['Komponen', dok.komponen_nama ?? '-']] : []),
    ...(dok.jenis_permintaan_id ? [['Jenis Permintaan', dok.jenis_permintaan_nama ?? '-']] : []),
    ...(dok.kategori_permintaan_id ? [['Kategori Permintaan', dok.kategori_permintaan_nama ?? '-']] : []),
    ...(dok.detail_permintaan_id ? [['Detail Permintaan', dok.detail_permintaan_nama ?? '-']] : []),
    ['Tahun', dok.tahun ?? '-'],
    ['Tanggal', dok.tanggal ? formatDate(dok.tanggal) : '-'],
    ...(!isNonMaterial ? [['Nominal Realisasi', formatCurrency(dok.nominal_realisasi)]] : []),
  ]

  return (
    <PageLayout className="min-h-full bg-[#FFF9F4] px-4 py-4 sm:px-6 lg:px-7 lg:py-5">
      <div className="mx-auto max-w-[92rem] space-y-4">
        <div className="flex items-center gap-3">
          <Link
            to="/pegawai/revisi"
            aria-label="Kembali ke daftar revisi dokumen"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-800"
          >
            <ChevronLeft size={18} />
          </Link>
          <div className="min-w-0">
            <h1 className="font-headline text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">
              Revisi Dokumen
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <FileEdit size={13} className="text-zinc-500" />
              <span className="font-medium text-zinc-800">Dokumen Perlu Revisi</span>
              <ChevronRight size={12} className="text-zinc-300" />
              <span className="truncate">{dok.judul}</span>
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
                        ? 'bg-[#FFFAF6] text-[#FF5A00] shadow-sm'
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
          <PegawaiPanel className="min-w-0 overflow-visible border-0 bg-transparent p-0 shadow-none">
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

            <div className="min-w-0 rounded-b-[1.5rem] border border-t-0 border-[#F1E5DA] bg-[#FFFAF6] p-4 sm:p-5">

            <section className={cn(activeTab === 'summary' ? 'block' : 'hidden', 'space-y-3')}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-500">Alur Dokumen</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                  {WORKFLOW_STEPS.map((step, i) => {
                    const isCurrent = step.key === dok.status
                    const isPast = workflowIdx > i || dok.status === 'COMPLETED'
                    const showAsRevision = dok.status === 'NEED_REVISION' && step.key === 'IN_PPK_VALIDATION'
                    const showAsRevisionDraft = dok.status === 'NEED_REVISION' && step.key === 'DRAFT'
                    return (
                      <div key={step.key} className="flex items-center gap-2">
                        <span className={cn(
                          'inline-flex items-center gap-1 text-xs font-semibold',
                          showAsRevision ? 'text-rose-600' :
                            isCurrent || showAsRevisionDraft ? 'text-[#FF5A00]' :
                              isPast ? 'text-emerald-700' : 'text-zinc-500',
                        )}>
                          {showAsRevision ? (
                            <AlertTriangle size={13} />
                          ) : (showAsRevisionDraft || isPast) && !isCurrent ? (
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
                        'rounded-xl border bg-[#FFFAF6] px-3 py-2.5',
                        label === 'Nominal Realisasi' ? 'border-orange-200 bg-orange-50/35' : 'border-orange-100',
                      )}
                    >
                      <p className={cn(
                        'mb-1 text-[10px] font-black uppercase tracking-[0.14em]',
                        label === 'Nominal Realisasi' ? 'text-[#FF5A00]' : 'text-zinc-500',
                      )}>{label}</p>
                      <p className={cn(
                        'text-sm font-semibold leading-relaxed',
                        label === 'Nominal Realisasi' ? 'font-mono font-bold text-[#FF5A00]' : 'text-zinc-950',
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
                dokumen={dok}
                lampiranUrls={lampiranUrls}
                kelengkapan={isNonMaterial ? [] : kelengkapan}
                isNonMaterial={isNonMaterial}
                nominalValue={dok.nominal_realisasi}
                submitLabel={isNonMaterial ? 'Ajukan Ulang ke Ketua Tim' : 'Ajukan Ulang ke PPK'}
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
              <ActivityLog dokumenId={id} />
            </section>
            </div>
          </PegawaiPanel>

          <aside className="min-w-0 space-y-2.5 xl:sticky xl:top-3">
            <PegawaiPanel className="border-rose-100 bg-rose-50/55 p-3 shadow-none">
              <div className="flex items-start gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#FFFAF6] text-rose-600">
                  <AlertCircle size={13} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-rose-700">Catatan dari PPK</p>
                  <p className="mt-1.5 text-[11px] font-medium text-rose-700">
                    Dikembalikan oleh: <span className="font-bold">PPK</span>
                  </p>
                  <div className="mt-1.5 rounded-lg bg-[#FFFAF6] p-2">
                    <p className="line-clamp-3 text-[11px] font-medium italic leading-relaxed text-rose-950">
                      "{dok.revision_notes || 'Tidak ada catatan revisi tertulis.'}"
                    </p>
                  </div>
                </div>
              </div>
            </PegawaiPanel>

            <PegawaiPanel className="border-[#FDBA8C] bg-[#FFF1E7] p-3 shadow-none">
              <div className="flex items-start gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center text-[#FF5A00]">
                  <Info size={13} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#FF5A00]">Aksi Revisi</p>
                  <p className="mt-1 text-[11px] font-medium leading-relaxed text-[#FF5A00]">
                    Anda dapat mengubah metadata atau lampiran jika diperlukan. Jika dokumen sudah sesuai, Anda dapat langsung mengajukan ulang.
                  </p>
                </div>
              </div>
            </PegawaiPanel>

            <div className="space-y-2.5 px-0.5 py-1">
              <div className="flex items-center justify-between gap-2 px-1 text-[11px]">
                <span className="font-semibold text-zinc-500">Kelengkapan</span>
                <span className="font-bold text-zinc-900">
                  {isNonMaterial
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
                  onClick={() => {
                    setActiveTab('edit')
                    setCancelRequestSignal(current => current + 1)
                  }}
                  className="h-10 w-full gap-2 rounded-xl border-[#F0E1D5] bg-[#FFFDF9] text-sm font-bold text-zinc-950 hover:bg-[#FFFAF6]"
                >
                  <ChevronLeft size={15} />
                  Kembali
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <ConfirmDialog
        open={leaveBlocker.status === 'blocked' || manualLeaveConfirmationOpen}
        onOpenChange={(open) => {
          if (!open) keepEditing()
        }}
        tone="warning"
        title="Keluar tanpa menyimpan?"
        description="Perubahan yang belum disimpan akan hilang."
        confirmLabel="Keluar tanpa menyimpan"
        cancelLabel="Tetap di halaman"
        onConfirm={() => { void leaveWithoutSaving() }}
      />

      <ConfirmDialog
        open={submitConfirmation !== null}
        onOpenChange={(open) => {
          if (!open && submitConfirmation) resolveSubmitConfirmation(false)
        }}
        tone="primary"
        title={submitConfirmation?.hasUnsavedChanges ? 'Ajukan ulang dokumen?' : 'Ajukan ulang tanpa perubahan?'}
        description={
          submitConfirmation?.hasUnsavedChanges
            ? `Dokumen akan disimpan lalu dikirim kembali ke ${targetLabel}.`
            : `Tidak ada perubahan baru yang terdeteksi. Jika dokumen sudah sesuai, dokumen tetap dapat dikirim kembali ke ${targetLabel}.`
        }
        confirmLabel="Ajukan Ulang"
        cancelLabel="Periksa Kembali"
        size="md"
        pending={submitInFlightRef.current}
        onConfirm={() => resolveSubmitConfirmation(true)}
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[#F0E1D5] bg-[#FFFAF6] p-4">
              <p className="text-[10px] font-semibold text-zinc-500">Lampiran</p>
              <p className="mt-1 text-sm font-extrabold text-zinc-950">
                {submitConfirmation?.lampiranUrls.length ?? 0} file akan diproses
              </p>
            </div>
            <div className="rounded-xl border border-[#F0E1D5] bg-[#FFFAF6] p-4">
              <p className="text-[10px] font-semibold text-zinc-500">Nominal</p>
              <p className="mt-1 font-mono text-sm font-bold text-zinc-950">
                {isNonMaterial ? '-' : formatCurrency(submitConfirmation?.nominalRealisasi)}
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
                Perubahan disimpan terlebih dahulu, lalu dokumen diajukan ulang melalui alur revisi yang sudah berjalan.
              </p>
            </div>
          </div>
        </div>
      </ConfirmDialog>
    </PageLayout>
  )
}
