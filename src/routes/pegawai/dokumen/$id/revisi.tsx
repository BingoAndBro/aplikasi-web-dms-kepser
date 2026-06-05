import { createFileRoute, Link, useBlocker, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { AppDialog } from '#/components/ui/AppDialog'
import { useAppToast } from '#/components/ui/AppToast'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { StatusBadge } from '#/components/ui/StatusBadge'
import { ActivityLog } from '#/components/dokumen/ActivityLog'
import { AttachmentEditor, type KelengkapanItem } from '#/components/dokumen/AttachmentEditor'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  FileEdit,
  Info,
  Loader2,
  Send,
  X,
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
        setError('Dokumen ini tidak bisa direvisi')
        setLoading(false)
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

          <div className="mt-6 grid w-full gap-3 rounded-2xl border border-[#F0E1D5] bg-white p-4 text-left shadow-sm sm:grid-cols-3">
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
            <Link to="/pegawai/revisi">
              <Button variant="outline" size="lg" className="w-full border-[#F0E1D5] bg-white sm:w-auto">
                Lihat Daftar Revisi
              </Button>
            </Link>
            <Link to="/pegawai/dokumen/$id" params={{ id: resubmitSuccess.documentId }}>
              <Button size="lg" className="w-full bg-[#F97316] text-white hover:bg-[#EA580C] sm:w-auto">
                Lihat Detail Dokumen
              </Button>
            </Link>
            <Link to="/pegawai/dokumen">
              <Button variant="ghost" size="lg" className="w-full sm:w-auto">
                Kembali ke Daftar Dokumen
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
    ...(dok.jenis_permintaan_id ? [['Jenis Permintaan', dok.jenis_permintaan_nama ?? '-']] : []),
    ...(dok.kategori_permintaan_id ? [['Kategori Permintaan', dok.kategori_permintaan_nama ?? '-']] : []),
    ...(dok.detail_permintaan_id ? [['Detail Permintaan', dok.detail_permintaan_nama ?? '-']] : []),
    ['Tahun', dok.tahun ?? '-'],
    ['Tanggal', dok.tanggal ? formatDate(dok.tanggal) : '-'],
    ...(!isNonMaterial ? [['Nominal Realisasi', formatCurrency(dok.nominal_realisasi)]] : []),
  ]

  return (
    <PageLayout>
      <div className="mx-auto max-w-[92rem] space-y-4">
        <div className="border-b border-[#F0E1D5] bg-transparent px-1 pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-500">
                <Link
                  to="/pegawai/revisi"
                  aria-label="Kembali ke daftar revisi dokumen"
                  className="flex size-8 items-center justify-center rounded-full bg-white text-zinc-500 transition hover:bg-[#FFF1E7] hover:text-[#EA580C]"
                >
                  <ArrowLeft size={15} />
                </Link>
                <FileEdit size={13} className="text-[#EA580C]" />
                <Link to="/pegawai/revisi" className="hover:text-[#EA580C]">Revisi Dokumen</Link>
                <ChevronRight size={12} className="text-zinc-300" />
                <span>Perbaiki</span>
              </div>
              <h1 className="font-headline text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">
                {dok.judul}
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-zinc-600">
                Periksa catatan revisi, ubah metadata atau lampiran yang diperlukan, lalu ajukan ulang dokumen.
              </p>
            </div>
            <StatusBadge status={dok.status} className="self-start text-xs font-semibold" />
          </div>
        </div>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_22.5rem] xl:items-start">
          <main className="min-w-0 space-y-4 xl:border-r xl:border-[#F0E1D5] xl:pr-6">
            <div className="flex w-full max-w-3xl flex-wrap gap-1 rounded-2xl border border-[#F0E1D5] bg-[#F7F2EC] p-1">
              {REVISION_TABS.map(tab => {
                const selected = activeTab === tab.key

                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      'flex min-h-10 flex-1 items-center justify-center rounded-xl px-3 text-xs font-bold transition',
                      selected
                        ? 'bg-white text-[#FF5A00] shadow-sm'
                        : 'text-zinc-500 hover:bg-[#FFFAF6] hover:text-zinc-950',
                    )}
                    aria-pressed={selected}
                  >
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </div>

            <section className={cn(activeTab === 'summary' ? 'block' : 'hidden', 'space-y-4')}>
              <div className="rounded-2xl border border-orange-200/70 bg-[#FFF5EC] p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-orange-100 bg-white text-[#EA580C]">
                    <AlertCircle size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-orange-950">
                        Catatan dari PPK
                      </p>
                      <p className="text-[10px] font-semibold text-orange-800/70">
                        {dok.updated_at ? formatDate(dok.updated_at) : 'Perlu revisi'}
                      </p>
                    </div>
                    <div className="mt-3 rounded-xl border border-orange-100 bg-white/70 px-3 py-2">
                      <p className="text-sm font-medium leading-relaxed text-orange-950">
                        {dok.revision_notes || 'Tidak ada catatan revisi tertulis.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="py-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">Alur Dokumen</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                  {WORKFLOW_STEPS.map((step, i) => {
                    const isCurrent = step.key === dok.status
                    const isPast = workflowIdx > i || dok.status === 'COMPLETED'
                    const showAsRevision = dok.status === 'NEED_REVISION' && step.key === 'IN_PPK_VALIDATION'
                    return (
                      <div key={step.key} className="flex items-center gap-3">
                        <span className={cn(
                          'inline-flex items-center gap-1.5 text-sm font-semibold',
                          isCurrent || showAsRevision ? 'text-[#FF5A00]' : isPast ? 'text-emerald-700' : 'text-zinc-500',
                        )}>
                          {showAsRevision ? (
                            <AlertTriangle size={14} />
                          ) : isPast && !isCurrent ? (
                            <CheckCircle2 size={14} />
                          ) : (
                            <span className="size-1.5 rounded-full bg-current" />
                          )}
                          {step.label}
                        </span>
                        {i < WORKFLOW_STEPS.length - 1 && (
                          <ChevronRight size={13} className="text-[#D8C8BA]" />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="pt-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">Metadata Dokumen</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {metadataItems.map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{label}</p>
                      <p className="mt-1 text-sm font-semibold text-zinc-950">{value}</p>
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
          </main>

          <aside className="min-w-0 space-y-4 xl:sticky xl:top-6">
            <div className="rounded-[1.35rem] border border-rose-100 bg-rose-50/55 p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-rose-600">
                  <AlertCircle size={17} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-rose-700">Catatan Revisi</p>
                  <p className="mt-3 text-xs font-medium text-rose-700">
                    Dikembalikan oleh: <span className="font-bold">PPK</span>
                  </p>
                  <div className="mt-4 rounded-xl bg-white/75 p-3">
                    <p className="text-sm font-medium italic leading-relaxed text-rose-950">
                      "{dok.revision_notes || 'Tidak ada catatan revisi tertulis.'}"
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[1.35rem] border border-orange-200/70 bg-[#FFF5EC] p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-[#FF5A00]">
                  <Info size={17} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#FF5A00]">Aksi Revisi</p>
                  <p className="mt-3 text-sm font-medium leading-relaxed text-[#FF5A00]">
                    Anda dapat mengubah metadata atau lampiran jika diperlukan. Jika dokumen sudah sesuai, Anda dapat langsung mengajukan ulang.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-[1.35rem] bg-white/70 p-3">
              <div className="flex items-center justify-between gap-3 px-1 text-xs">
                <span className="font-semibold text-zinc-500">Kelengkapan</span>
                <span className="font-bold text-zinc-900">
                  {isNonMaterial
                    ? `${lampiranUrls.length} file pendukung`
                    : `${uploadedRequiredCount}/${requiredCount || 0} wajib terunggah`}
                </span>
              </div>
              <div className={cn(
                'flex items-center justify-center gap-2 rounded-full border px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em]',
                attachmentDirty
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-[#F0E1D5] bg-[#F7F2EC] text-zinc-500',
              )}>
                {attachmentDirty ? (
                  <>
                    <span className="size-1.5 rounded-full bg-amber-500" />
                    Revisi siap diajukan
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={13} />
                    Tidak ada perubahan
                  </>
                )}
              </div>
              <div className="space-y-3">
                <Button
                  type="button"
                  size="lg"
                  onClick={() => {
                    setActiveTab('edit')
                    setSubmitRequestSignal(current => current + 1)
                  }}
                  className="w-full gap-2 rounded-2xl bg-[#FF5A00] text-white shadow-sm shadow-orange-500/20 hover:bg-[#EA580C]"
                >
                  <Send size={16} />
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
                  className="w-full gap-2 rounded-2xl border-rose-300 bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  <X size={16} />
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
        contentClassName="border-[#F0E1D5] bg-white shadow-2xl shadow-zinc-950/10 sm:rounded-3xl sm:p-6"
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
            ? `Dokumen akan disimpan lalu dikirim kembali ke ${targetLabel}.`
            : `Tidak ada perubahan baru yang terdeteksi. Jika dokumen sudah sesuai, dokumen tetap dapat dikirim kembali ke ${targetLabel}.`
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
            <div className="rounded-xl border border-[#F0E1D5] bg-white p-4">
              <p className="text-[10px] font-semibold text-zinc-500">Lampiran</p>
              <p className="mt-1 text-sm font-extrabold text-zinc-950">
                {submitConfirmation?.lampiranUrls.length ?? 0} file akan diproses
              </p>
            </div>
            <div className="rounded-xl border border-[#F0E1D5] bg-white p-4">
              <p className="text-[10px] font-semibold text-zinc-500">Nominal</p>
              <p className="mt-1 text-sm font-extrabold text-zinc-950">
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
      </AppDialog>
    </PageLayout>
  )
}
