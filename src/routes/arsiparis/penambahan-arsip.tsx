import { createFileRoute, useBlocker, useNavigate } from '@tanstack/react-router'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Loader2,
  Plus,
  Search,
  ShieldX,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode, RefObject } from 'react'

import {
  ARCHIVE_TABLE_HEAD_CLASS,
  ARCHIVE_TABLE_ROW_CLASS,
  ArchivePanel,
} from '#/components/archive/ArchivePagePrimitives'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { StepIndicator } from '#/components/dokumen/StepIndicator'
import { AppDialog } from '#/components/ui/AppDialog'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { DatePicker } from '#/components/ui/date-picker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { StatusBadge as SharedStatusBadge } from '#/components/ui/StatusBadge'
import { ApiError, apiFetch } from '#/lib/api-client'
import { apiMutation } from '#/lib/api-mutation'
import { ROLES } from '#/lib/constants/roles'
import { ROUTES } from '#/lib/constants/routes'
import { cn } from '#/lib/utils'
import { formatDate, formatDateTime } from '#/lib/utils/format'

export const Route = createFileRoute('/arsiparis/penambahan-arsip')({
  component: PenambahanArsipPage,
})

type AuthSessionResponse = {
  session: { userId: string; email: string; userName?: string | null } | null
  roles: string[]
  activeRole: string | null
}

type ManualArsipCategory = {
  id: string
  nama: string
  deskripsi: string | null
}

type KlasifikasiNode = {
  id: string
  nama: string
  kode?: string | null
  is_root?: boolean
  children?: KlasifikasiNode[]
}

type FlatKlasifikasiOption = {
  id: string
  kode: string | null
  nama: string
  node: KlasifikasiNode
}

type ManualArsipListItem = {
  id: string
  nama: string
  tanggal: string
  keterangan: string
  nominal_realisasi: number | null
  status_arsip: string
  category: ManualArsipCategory
  klasifikasi: {
    id: string | null
    nama: string | null
    nama_snapshot: string | null
  }
  created_by: string
  created_at: string
  updated_at: string
}

type CategoriesResponse = {
  categories?: ManualArsipCategory[]
  error?: string
}

type KlasifikasiResponse = {
  klasifikasi?: KlasifikasiNode[]
  error?: string
}

type ManualArsipListResponse = {
  manual_arsip?: ManualArsipListItem[]
  meta?: { limit: number }
  error?: string
}

type ManualArsipCreateResponse = {
  manual_arsip?: ManualArsipListItem
  error?: string
}

type ManualArsipAttachmentMetadata = {
  id: string
  judul_lampiran: string
  content_type: string
  size_bytes: number
  created_at: string
}

type ManualArsipUploadResponse = {
  attachments?: ManualArsipAttachmentMetadata[]
  error?: string
}

type ManualArsipDetail = ManualArsipListItem & {
  attachments: ManualArsipAttachmentMetadata[]
}

type ManualArsipDetailResponse = {
  manual_arsip?: ManualArsipDetail
  error?: string
}

type ManualArsipFormState = {
  nama: string
  tanggal: string
  keterangan: string
  category_id: string
  klasifikasi_id: string
  nominal_realisasi: string
}

type SubmissionNotice = {
  tone: 'success' | 'warning'
  message: string
}

type CreateManualArsipResult = {
  notice: SubmissionNotice
  manualArsip: ManualArsipListItem
  uploadedCount: number
}

type AttachmentRow = {
  id: string
  title: string
  file: File | null
}

type PreviewingAttachment = {
  title: string
  url: string
}

type SubmittedManualArsip = {
  id: string
  nama: string
  categoryName: string
  klasifikasiName: string
  attachmentCount: number
  warning?: string
}

type ManualCreateDraftState = {
  form: ManualArsipFormState
  attachmentTitles: string[]
  step: number
}

const MANUAL_ARSIP_ATTACHMENT_FIELD_NAME = 'files'
const MANUAL_ARSIP_ATTACHMENT_TITLE_FIELD_NAME = 'titles'
const MANUAL_ARSIP_ATTACHMENT_MAX_FILES = 5
const MANUAL_ARSIP_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
const MANUAL_ARSIP_ATTACHMENT_TITLE_MAX_LENGTH = 120
const MANUAL_ARSIP_ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'image/bmp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/tiff',
  'image/webp',
] as const
const MANUAL_ARSIP_ATTACHMENT_ACCEPT = MANUAL_ARSIP_ALLOWED_CONTENT_TYPES.join(',')
const MANUAL_ARSIP_ALLOWED_CONTENT_TYPE_SET = new Set<string>(MANUAL_ARSIP_ALLOWED_CONTENT_TYPES)
const MANUAL_CREATE_STEP_LABELS = [
  'Informasi Dokumen',
  'Jenis Pembayaran',
  'Lampiran',
  'Review',
]
const MANUAL_CREATE_STEP_SUBTITLES = [
  'Detail Dokumen',
  'Klasifikasi & Nominal',
  'Berkas Pendukung',
  'Pratinjau & Simpan',
]
const MANUAL_CREATE_STEP_DESCRIPTIONS = [
  'Lengkapi informasi dasar dokumen kearsipan dalam satu form compact.',
  'Pilih jenis pembayaran dan nominal realisasi belanja fisik.',
  'Tambah atau unggah berkas pendukung sebagai berkas lampiran opsional.',
  'Tinjau kembali seluruh rincian informasi sebelum disimpan.',
]
const MANUAL_CREATE_DRAFT_STORAGE_KEY = 'dms:arsiparis:penambahan-dokumen:draft'
const emptyForm = (): ManualArsipFormState => ({
  nama: '',
  tanggal: new Date().toISOString().slice(0, 10),
  keterangan: '',
  category_id: '',
  klasifikasi_id: '',
  nominal_realisasi: '',
})

function readManualCreateDraft(): ManualCreateDraftState | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(MANUAL_CREATE_DRAFT_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<ManualCreateDraftState>
    const form = parsed.form
    if (!form || typeof form !== 'object') return null

    return {
      form: {
        ...emptyForm(),
        nama: typeof form.nama === 'string' ? form.nama : '',
        tanggal: typeof form.tanggal === 'string' ? form.tanggal : emptyForm().tanggal,
        keterangan: typeof form.keterangan === 'string' ? form.keterangan : '',
        category_id: typeof form.category_id === 'string' ? form.category_id : '',
        klasifikasi_id: typeof form.klasifikasi_id === 'string' ? form.klasifikasi_id : '',
        nominal_realisasi: typeof form.nominal_realisasi === 'string' ? form.nominal_realisasi : '',
      },
      attachmentTitles: Array.isArray(parsed.attachmentTitles)
        ? parsed.attachmentTitles.filter((title): title is string => typeof title === 'string')
        : [],
      step: clampManualCreateStep(parsed.step),
    }
  } catch {
    return null
  }
}

function writeManualCreateDraft(draft: ManualCreateDraftState) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(MANUAL_CREATE_DRAFT_STORAGE_KEY, JSON.stringify({
      form: draft.form,
      attachmentTitles: draft.attachmentTitles,
      step: clampManualCreateStep(draft.step),
    }))
  } catch {
    // Ignore quota/storage failures; the form itself remains usable.
  }
}

function clearManualCreateDraft() {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(MANUAL_CREATE_DRAFT_STORAGE_KEY)
  } catch {
    // Ignore storage failures.
  }
}

function clampManualCreateStep(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  return Math.min(Math.max(Math.round(value), 1), MANUAL_CREATE_STEP_LABELS.length)
}

function isManualCreateDraftDirty(
  form: ManualArsipFormState,
  attachmentRows: AttachmentRow[],
  step: number,
  newAttachmentTitle: string,
): boolean {
  const baseline = emptyForm()

  return Boolean(
    form.nama.trim()
    || form.keterangan.trim()
    || form.category_id
    || form.klasifikasi_id
    || form.nominal_realisasi
    || form.tanggal !== baseline.tanggal
    || attachmentRows.some((row) => row.title.trim() || row.file)
    || newAttachmentTitle.trim()
    || step > 1
  )
}

function revokePreviewUrl(url: string | undefined) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

function PenambahanArsipPage() {
  const navigate = useNavigate()
  const [authChecked, setAuthChecked] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [items, setItems] = useState<ManualArsipListItem[]>([])
  const [categories, setCategories] = useState<ManualArsipCategory[]>([])
  const [klasifikasiList, setKlasifikasiList] = useState<KlasifikasiNode[]>([])
  const [limit, setLimit] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formResetKey, setFormResetKey] = useState(0)
  const [notice, setNotice] = useState<SubmissionNotice | null>(null)
  const [submittedManualArsip, setSubmittedManualArsip] = useState<SubmittedManualArsip | null>(null)

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      const [categoryJson, klasifikasiJson] = await Promise.all([
        apiFetch<CategoriesResponse>('/arsiparis/manual-arsip/categories'),
        apiFetch<KlasifikasiResponse>('/arsiparis/klasifikasi', {
          query: { eligible_for_berkas: 'true' },
        }),
      ])

      setCategories(categoryJson.categories ?? [])
      setKlasifikasiList(klasifikasiJson.klasifikasi ?? [])
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setAccessDenied(true)
        return
      }

      if (err instanceof ApiError && err.status === 401) {
        window.location.href = ROUTES.LOGIN
        return
      }

      setError(getApiErrorMessage(err, 'Gagal memuat dokumen manual. Coba muat ulang halaman.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    async function checkAuth() {
      try {
        const auth = await apiFetch<AuthSessionResponse>('/auth/session')
        if (!auth.session) {
          window.location.href = ROUTES.LOGIN
          return
        }

        if (!auth.roles.includes(ROLES.KEPALA_SUB_BAGIAN_UMUM)) {
          setAccessDenied(true)
          setLoading(false)
          setAuthChecked(true)
          return
        }

        setAuthChecked(true)
        await fetchData()
      } catch {
        window.location.href = ROUTES.LOGIN
      }
    }

    void checkAuth()
  }, [])

  function handleCreateAnother() {
    clearManualCreateDraft()
    setSubmittedManualArsip(null)
    setNotice(null)
    setFormResetKey((prev) => prev + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (submittedManualArsip) {
    return (
      <PageLayout className="min-h-full bg-[#FFF9F4] px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex min-h-[calc(100vh-9rem)] items-center justify-center">
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
            <div className="flex size-20 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={38} strokeWidth={2.4} />
            </div>

            <h1 className="mt-8 font-headline text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-3xl">
              Dokumen Berhasil Ditambahkan
            </h1>

            <p className="mt-4 max-w-2xl text-sm font-medium leading-relaxed text-zinc-700 sm:text-base">
              Dokumen <span className="font-extrabold text-zinc-950">{submittedManualArsip.nama || 'baru'}</span>
              {' '}telah diterima sistem.
            </p>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold text-zinc-600">
              <span className="rounded-full bg-[#FFFDF9] px-3 py-1.5 shadow-sm ring-1 ring-[#F0E1D5]">
                Manual
              </span>
              <span className="rounded-full bg-[#FFFDF9] px-3 py-1.5 shadow-sm ring-1 ring-[#F0E1D5]">
                {submittedManualArsip.categoryName || 'Kategori arsip'}
              </span>
              <span className="rounded-full bg-[#FFFDF9] px-3 py-1.5 shadow-sm ring-1 ring-[#F0E1D5]">
                {submittedManualArsip.attachmentCount} file lampiran
              </span>
            </div>

            <p className="mt-4 max-w-xl text-xs font-medium leading-relaxed text-zinc-500 sm:text-sm">
              Dokumen masuk ke folder Jenis Pembayaran{' '}
              <span className="font-bold text-zinc-700">{submittedManualArsip.klasifikasiName || 'yang dipilih'}</span>.
              Metadata arsip final tetap diisi saat berkas ditutup.
            </p>

            {submittedManualArsip.warning && (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-relaxed text-amber-800">
                {submittedManualArsip.warning}
              </div>
            )}

            <div className="mt-10 flex w-full flex-col items-stretch justify-center gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
              <Button
                type="button"
                size="lg"
                onClick={() => navigate({ to: '/arsiparis/berkas' })}
                className="w-full gap-1.5 bg-[#F97316] text-white hover:bg-[#EA580C] sm:w-auto"
              >
                Lihat Pemberkasan Arsip <ArrowRight size={14} />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => navigate({ to: '/arsiparis' })}
                className="w-full border-[#F0E1D5] bg-white sm:w-auto"
              >
                Kembali ke Dashboard
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={handleCreateAnother}
                className="w-full border-[#F0E1D5] bg-white sm:w-auto"
              >
                Tambah Dokumen Lain
              </Button>
            </div>
          </div>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout className="min-h-full bg-[#FFF9F4] px-4 py-4 sm:px-6 lg:px-7 lg:py-5">
      <div className="mx-auto max-w-[92rem] space-y-4">
        {notice && (
          <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />
        )}

        {!authChecked && loading && (
          <LoadingState label="Memeriksa akses..." />
        )}

        {authChecked && accessDenied && (
          <AccessDeniedState />
        )}

        {authChecked && !accessDenied && (
          loading ? (
            <LoadingState label="Memuat form penambahan dokumen..." />
          ) : error ? (
            <ErrorState message={error} onRetry={fetchData} />
          ) : (
            <CreateManualArsipModal
              key={formResetKey}
              categories={categories}
              klasifikasiList={klasifikasiList}
              isOpen
              onClose={() => { window.location.href = '/arsiparis' }}
              onSuccess={async (result) => {
                await fetchData()
                setNotice(result.notice)
                setSubmittedManualArsip({
                  id: result.manualArsip.id,
                  nama: result.manualArsip.nama,
                  categoryName: result.manualArsip.category.nama,
                  klasifikasiName: result.manualArsip.klasifikasi.nama ?? result.manualArsip.klasifikasi.nama_snapshot ?? '',
                  attachmentCount: result.uploadedCount,
                  warning: result.notice.tone === 'warning' ? result.notice.message : undefined,
                })
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            />
          )
        )}
      </div>
    </PageLayout>
  )
}

function ManualArsipTable({
  items,
  limit,
}: {
  items: ManualArsipListItem[]
  limit: number | null
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [detailsById, setDetailsById] = useState<Record<string, ManualArsipDetail>>({})
  const [detailLoadingById, setDetailLoadingById] = useState<Record<string, boolean>>({})
  const [detailErrorsById, setDetailErrorsById] = useState<Record<string, string>>({})
  const [previewingAttachment, setPreviewingAttachment] = useState<PreviewingAttachment | null>(null)

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && previewingAttachment) {
        closePreview()
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [previewingAttachment])

  async function toggleAttachments(item: ManualArsipListItem) {
    const willExpand = !expandedIds.has(item.id)

    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (willExpand) {
        next.add(item.id)
      } else {
        next.delete(item.id)
      }
      return next
    })

    if (!willExpand || detailsById[item.id] || detailLoadingById[item.id]) {
      return
    }

    setDetailLoadingById((prev) => ({ ...prev, [item.id]: true }))
    setDetailErrorsById((prev) => ({ ...prev, [item.id]: '' }))

    try {
      const detailJson = await apiFetch<ManualArsipDetailResponse>(
        `/arsiparis/manual-arsip/${encodeURIComponent(item.id)}`,
      )

      if (!detailJson.manual_arsip) {
        setDetailErrorsById((prev) => ({ ...prev, [item.id]: 'Detail lampiran tidak ditemukan.' }))
        return
      }

      setDetailsById((prev) => ({ ...prev, [item.id]: detailJson.manual_arsip as ManualArsipDetail }))
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = ROUTES.LOGIN
        return
      }

      if (err instanceof ApiError && err.status === 403) {
        setDetailErrorsById((prev) => ({ ...prev, [item.id]: 'Akses ditolak.' }))
        return
      }

      setDetailErrorsById((prev) => ({
        ...prev,
        [item.id]: getApiErrorMessage(err, 'Gagal memuat detail lampiran.'),
      }))
    } finally {
      setDetailLoadingById((prev) => ({ ...prev, [item.id]: false }))
    }
  }

  function openPreview(manualArsipId: string, attachment: ManualArsipAttachmentMetadata) {
    setPreviewingAttachment({
      title: attachment.judul_lampiran || 'Pratinjau lampiran',
      url: buildManualArsipAttachmentFileUrl(manualArsipId, attachment.id, 'preview'),
    })
  }

  function closePreview() {
    setPreviewingAttachment(null)
  }

  return (
    <>
      {previewingAttachment && (
        <ManualArsipPreviewModal
          preview={previewingAttachment}
          onClose={closePreview}
        />
      )}

      <div className="overflow-hidden rounded-[1.35rem] border border-zinc-200/80 bg-[#FFFDF9] shadow-[0_3px_14px_rgba(15,23,42,0.07)]">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-orange-50/60 text-left">
                <th className={`w-10 text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>No</th>
                <th className={`min-w-52 ${ARCHIVE_TABLE_HEAD_CLASS}`}>Nama Dokumen</th>
                <th className={`text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>Tanggal</th>
                <th className={ARCHIVE_TABLE_HEAD_CLASS}>Kategori</th>
                <th className={ARCHIVE_TABLE_HEAD_CLASS}>Jenis Pembayaran</th>
                <th className={`min-w-64 ${ARCHIVE_TABLE_HEAD_CLASS}`}>Keterangan</th>
                <th className={`text-right ${ARCHIVE_TABLE_HEAD_CLASS}`}>Nominal</th>
                <th className={`text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>Status</th>
                <th className={`text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>Diperbarui</th>
                <th className={`text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>Lampiran</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const expanded = expandedIds.has(item.id)
                const detail = detailsById[item.id]
                const detailLoading = detailLoadingById[item.id] === true
                const detailError = detailErrorsById[item.id]

                return (
                  <Fragment key={item.id}>
                    <tr className={ARCHIVE_TABLE_ROW_CLASS}>
                      <td className="px-5 py-4 text-center text-sm font-normal text-zinc-950">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <p className="line-clamp-1 text-[15px] font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-[#FF4D00]">{item.nama}</p>
                        <p className="text-[10px] text-outline mt-0.5">{shortId(item.id)}</p>
                      </td>
                      <td className="px-4 py-3 text-center text-on-surface-variant">{formatDate(item.tanggal)}</td>
                      <td className="px-4 py-3 text-on-surface">{item.category.nama || '-'}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{item.klasifikasi.nama ?? '-'}</td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        <span title={item.keterangan}>{truncateText(item.keterangan, 96)}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-on-surface">{formatNullableCurrency(item.nominal_realisasi)}</td>
                      <td className="px-4 py-3 text-center">
                        <ManualStatusBadge status={item.status_arsip} />
                      </td>
                      <td className="px-4 py-3 text-center text-on-surface-variant">{formatDateTime(item.updated_at)}</td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => { void toggleAttachments(item) }}
                          disabled={detailLoading}
                          className="h-8 gap-1.5"
                        >
                          {detailLoading ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                          {expanded ? 'Tutup' : 'Lihat'}
                        </Button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-t border-outline-variant/20 bg-surface-container-low/20">
                        <td colSpan={10} className="px-4 py-4">
                          <ManualArsipAttachmentPanel
                            item={item}
                            detail={detail}
                            loading={detailLoading}
                            error={detailError}
                            onPreview={openPreview}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-zinc-100 bg-[#FFFAF6] px-4 py-2.5 text-xs text-zinc-500">
          Menampilkan {items.length}{limit ? ` dari maksimal ${limit}` : ''} dokumen manual. Preview/download lampiran menggunakan endpoint API terotorisasi; lifecycle dan ekspor tidak tersedia pada halaman ini.
        </div>
      </div>
    </>
  )
}

function ManualArsipAttachmentPanel({
  item,
  detail,
  loading,
  error,
  onPreview,
}: {
  item: ManualArsipListItem
  detail?: ManualArsipDetail
  loading: boolean
  error?: string
  onPreview: (manualArsipId: string, attachment: ManualArsipAttachmentMetadata) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-orange-100 bg-[#FFFDF9] px-3 py-3 text-xs text-zinc-600">
        <Loader2 size={14} className="animate-spin text-primary" />
        Memuat detail lampiran...
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-error/20 bg-error/5 px-3 py-3 text-xs text-error">
        {error}
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="rounded-xl border border-orange-100 bg-[#FFFDF9] px-3 py-3 text-xs text-zinc-600">
        Detail lampiran belum dimuat.
      </div>
    )
  }

  if (detail.attachments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-orange-200 bg-[#FFFDF9] px-3 py-4 text-center text-xs text-zinc-600">
        Tidak ada lampiran pada dokumen manual ini.
      </div>
    )
  }

  const fileUnavailable = item.status_arsip === 'DIMUSNAHKAN' || detail.status_arsip === 'DIMUSNAHKAN'

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-outline">Lampiran ({detail.attachments.length})</p>
        <p className="mt-1 text-[11px] text-on-surface-variant">
          Link preview/download dibuat hanya dari ID dokumen manual dan ID lampiran. Otorisasi tetap divalidasi server.
        </p>
      </div>

      {fileUnavailable && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          Data file sudah dimusnahkan
        </div>
      )}

      <div className="grid gap-2">
        {detail.attachments.map((attachment, index) => (
          <ManualArsipAttachmentRow
            key={attachment.id}
            attachment={attachment}
            index={index}
            manualArsipId={item.id}
            fileUnavailable={fileUnavailable}
            onPreview={onPreview}
          />
        ))}
      </div>
    </div>
  )
}

function ManualArsipAttachmentRow({
  attachment,
  index,
  manualArsipId,
  fileUnavailable,
  onPreview,
}: {
  attachment: ManualArsipAttachmentMetadata
  index: number
  manualArsipId: string
  fileUnavailable: boolean
  onPreview: (manualArsipId: string, attachment: ManualArsipAttachmentMetadata) => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#F1E5DA] bg-[#FFFDF9] px-3 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText size={15} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-on-surface">
            {attachment.judul_lampiran || `Lampiran ${index + 1}`}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-on-surface-variant">
            {formatFriendlyAttachmentMetadata(attachment)}
          </p>
        </div>
      </div>

      {fileUnavailable ? (
        <p className="text-xs font-medium text-red-700 sm:text-right">
          Data file sudah dimusnahkan
        </p>
      ) : (
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPreview(manualArsipId, attachment)}
            className="h-8 gap-1.5"
          >
            <Eye size={13} />
            Preview
          </Button>
          <a
            href={buildManualArsipAttachmentFileUrl(manualArsipId, attachment.id, 'download')}
            className={attachmentLinkClass('primary')}
          >
            <Download size={13} />
            Download
          </a>
        </div>
      )}
    </div>
  )
}

function ManualArsipPreviewModal({
  preview,
  onClose,
}: {
  preview: PreviewingAttachment
  onClose: () => void
}) {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
  }, [preview.url])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4">
      <button
        type="button"
        aria-label="Tutup pratinjau"
        className="absolute inset-0 bg-black/85 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex h-[calc(100dvh-1rem)] max-h-[90dvh] w-full max-w-[92vw] flex-col overflow-hidden rounded-2xl bg-zinc-950 shadow-2xl ring-1 ring-white/10 sm:h-[88vh] sm:max-w-[88vw]"
        role="dialog"
        aria-modal="true"
        aria-label="Pratinjau lampiran dokumen manual"
      >
        <div className="flex min-h-12 shrink-0 items-center gap-3 border-b border-white/10 bg-zinc-950 px-3 py-2 text-white sm:px-4">
          <Eye size={16} className="shrink-0 text-zinc-300" />
          <p className="flex-1 truncate text-sm font-semibold text-white">{preview.title}</p>
          <a
            href={preview.url}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-200 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={`Unduh ${preview.title}`}
          >
            <Download size={17} />
          </a>
          <span className="hidden text-[10px] font-semibold uppercase tracking-wide text-zinc-500 sm:block">ESC</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pratinjau"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-zinc-900 p-2 sm:p-4">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/70">
              <div className="flex flex-col items-center gap-2 text-xs text-zinc-300">
                <Loader2 size={22} className="animate-spin text-white" />
                Memuat pratinjau...
              </div>
            </div>
          )}
          <iframe
            src={preview.url}
            className="h-full min-h-[60vh] w-full max-w-6xl border-0 bg-white shadow-2xl shadow-black/40"
            title={preview.title}
            onLoad={() => setLoading(false)}
          />
        </div>
      </div>
    </div>
  )
}

function CreateManualArsipModal({
  categories,
  klasifikasiList,
  isOpen,
  onClose,
  onSuccess,
}: {
  categories: ManualArsipCategory[]
  klasifikasiList: KlasifikasiNode[]
  isOpen: boolean
  onClose: () => void
  onSuccess: (result: CreateManualArsipResult) => void | Promise<void>
}) {
  const initialDraftRef = useRef<ManualCreateDraftState | null>(readManualCreateDraft())
  const [form, setForm] = useState<ManualArsipFormState>(() => initialDraftRef.current?.form ?? emptyForm())
  const [attachmentRows, setAttachmentRows] = useState<AttachmentRow[]>(() => (
    initialDraftRef.current?.attachmentTitles.map((title) => createAttachmentRow(title)) ?? []
  ))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [step, setStep] = useState(() => initialDraftRef.current?.step ?? 1)
  const [showAttachmentTitleForm, setShowAttachmentTitleForm] = useState(false)
  const [newAttachmentTitle, setNewAttachmentTitle] = useState('')
  const [newAttachmentTitleError, setNewAttachmentTitleError] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [currentNodes, setCurrentNodes] = useState<KlasifikasiNode[]>([])
  const [selectedNode, setSelectedNode] = useState<KlasifikasiNode | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPath, setCurrentPath] = useState<KlasifikasiNode[]>([])
  const [pendingClose, setPendingClose] = useState(false)
  const [previewingDraftAttachment, setPreviewingDraftAttachment] = useState<PreviewingAttachment | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const skipBeforeUnloadRef = useRef(false)
  const allKlasifikasiOptions = useMemo(() => {
    const rootNode = findRootKlasifikasiNode(klasifikasiList)
    return flattenKlasifikasiTree(rootNode?.children ?? klasifikasiList)
  }, [klasifikasiList])
  const filteredSearchResults = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    if (!normalizedQuery) return []

    return allKlasifikasiOptions.filter((option) => {
      const kode = option.kode?.toLowerCase() ?? ''
      return option.nama.toLowerCase().includes(normalizedQuery) || kode.includes(normalizedQuery)
    })
  }, [allKlasifikasiOptions, searchQuery])
  const visibleNodes = searchQuery.trim() ? [] : currentNodes
  const breadcrumbPath = currentPath.map((node) => formatKlasifikasiLabel(node)).join(' / ')
  const completedSteps = MANUAL_CREATE_STEP_LABELS
    .map((_, index) => index + 1)
    .filter((stepNumber) => stepNumber < step)
  const progressPercentage = Math.round((step / MANUAL_CREATE_STEP_LABELS.length) * 100)
  const hasFormDirty = isManualCreateDraftDirty(form, attachmentRows, step, newAttachmentTitle)
  const isDirty = !submitting && hasFormDirty
  const leaveBlocker = useBlocker({
    shouldBlockFn: ({ current, next }) => isDirty && current.pathname !== next.pathname,
    enableBeforeUnload: false,
    disabled: !isDirty,
    withResolver: true,
  })

  useEffect(() => {
    if (!isOpen) return
    setErrors({})
    setSubmitError(null)
    setSubmitting(false)
    setShowAttachmentTitleForm(false)
    setNewAttachmentTitle('')
    setNewAttachmentTitleError('')
    setDropdownOpen(false)
    setSelectedNode(null)
    setSearchQuery('')
    setCurrentPath([])
    setCurrentNodes(buildInitialKlasifikasiNodes(klasifikasiList))
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !isDirty) {
      return
    }

    writeManualCreateDraft({
      form,
      step,
      attachmentTitles: attachmentRows.map((row) => row.title).filter(Boolean),
    })
  }, [attachmentRows, form, isDirty, isOpen, step])

  useEffect(() => {
    if (!isOpen || isDirty || submitting) {
      return
    }

    clearManualCreateDraft()
  }, [isDirty, isOpen, submitting])

  useEffect(() => {
    if (typeof window === 'undefined' || !isDirty) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (skipBeforeUnloadRef.current) return

      event.preventDefault()
      event.returnValue = 'Perubahan yang belum disimpan akan hilang.'
      return 'Perubahan yang belum disimpan akan hilang.'
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    return () => {
      revokePreviewUrl(previewingDraftAttachment?.url)
    }
  }, [previewingDraftAttachment?.url])

  useEffect(() => {
    if (!isOpen) return

    setCurrentNodes(buildInitialKlasifikasiNodes(klasifikasiList))
    setCurrentPath([])

    if (!form.klasifikasi_id) {
      setSelectedNode(null)
      return
    }

    setSelectedNode(findKlasifikasiNodeById(klasifikasiList, form.klasifikasi_id))
  }, [isOpen, klasifikasiList])

  useEffect(() => {
    if (!dropdownOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false)
        setSearchQuery('')
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [dropdownOpen])

  if (!isOpen) return null

  function setField<K extends keyof ManualArsipFormState>(field: K, value: ManualArsipFormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: '' }))
  }

  function openKlasifikasiDropdown() {
    setDropdownOpen(true)
    setSearchQuery('')

    if (selectedNode) {
      const path = findKlasifikasiPathToNode(klasifikasiList, selectedNode.id)
      if (path.length > 0) {
        const parentPath = path.slice(0, -1)
        const parentNode = parentPath[parentPath.length - 1] ?? null
        setCurrentPath(parentPath)
        setCurrentNodes(sortKlasifikasiByKode(parentNode?.children ?? buildInitialKlasifikasiNodes(klasifikasiList)))
        return
      }
    }

    setCurrentPath([])
    setCurrentNodes(buildInitialKlasifikasiNodes(klasifikasiList))
  }

  function handleKlasifikasiNodeClick(node: KlasifikasiNode) {
    const children = sortKlasifikasiByKode(node.children ?? [])

    if (children.length > 0) {
      setSearchQuery('')
      setCurrentPath((prev) => [...prev, node])
      setCurrentNodes(children)
      return
    }

    setSelectedNode(node)
    setField('klasifikasi_id', node.id)
    setDropdownOpen(false)
    setSearchQuery('')
  }

  function handleKlasifikasiBack() {
    if (currentPath.length === 0) {
      setCurrentNodes(buildInitialKlasifikasiNodes(klasifikasiList))
      return
    }

    const nextPath = currentPath.slice(0, -1)
    const parentNode = nextPath[nextPath.length - 1] ?? null
    setCurrentPath(nextPath)
    setCurrentNodes(sortKlasifikasiByKode(parentNode?.children ?? buildInitialKlasifikasiNodes(klasifikasiList)))
  }

  function handleNominalRealisasiChange(value: string) {
    const raw = value.replace(/[^\d]/g, '')
    const numericValue = parseInt(raw, 10)
    setField('nominal_realisasi', raw ? numericValue.toLocaleString('id-ID') : '')
  }

  function openAttachmentTitleForm() {
    if (attachmentRows.length >= MANUAL_ARSIP_ATTACHMENT_MAX_FILES) {
      setErrors((prev) => ({ ...prev, attachments: 'Maksimal 5 lampiran' }))
      return
    }

    setShowAttachmentTitleForm(true)
    setNewAttachmentTitle('')
    setNewAttachmentTitleError('')
    setErrors((prev) => ({ ...prev, attachments: '' }))
  }

  function cancelAttachmentTitleForm() {
    setShowAttachmentTitleForm(false)
    setNewAttachmentTitle('')
    setNewAttachmentTitleError('')
  }

  function saveAttachmentTitle() {
    const title = newAttachmentTitle.trim()

    if (!title) {
      setNewAttachmentTitleError('Nama dokumen pendukung wajib diisi')
      return
    }

    if (title.length > MANUAL_ARSIP_ATTACHMENT_TITLE_MAX_LENGTH) {
      setNewAttachmentTitleError('Judul lampiran maksimal 120 karakter')
      return
    }

    setAttachmentRows((prev) => [...prev, createAttachmentRow(title)])
    setShowAttachmentTitleForm(false)
    setNewAttachmentTitle('')
    setNewAttachmentTitleError('')
    setErrors((prev) => ({ ...prev, attachments: '' }))
  }

  function removeAttachmentRow(rowId: string) {
    setAttachmentRows((prev) => prev.filter((row) => row.id !== rowId))
    setErrors((prev) => clearAttachmentRowErrors(prev, rowId))
  }

  function updateAttachmentTitle(rowId: string, title: string) {
    setAttachmentRows((prev) => prev.map((row) => (
      row.id === rowId ? { ...row, title } : row
    )))
    setErrors((prev) => ({
      ...prev,
      [attachmentTitleErrorKey(rowId)]: '',
      attachments: '',
    }))
  }

  function updateAttachmentFile(rowId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    const fileError = file ? validateAttachmentFile(file) : null

    if (fileError) {
      event.target.value = ''
      setAttachmentRows((prev) => prev.map((row) => (
        row.id === rowId ? { ...row, file: null } : row
      )))
      setErrors((prev) => ({
        ...prev,
        [attachmentFileErrorKey(rowId)]: fileError,
        attachments: '',
      }))
      return
    }

    setAttachmentRows((prev) => prev.map((row) => (
      row.id === rowId ? { ...row, file } : row
    )))
    setErrors((prev) => ({
      ...prev,
      [attachmentFileErrorKey(rowId)]: '',
      attachments: '',
    }))
  }

  function validateCurrentStep(): boolean {
    const nextErrors: Record<string, string> = {}

    if (step === 1) {
      if (!form.nama.trim()) nextErrors.nama = 'Nama Dokumen wajib diisi'
      if (!form.tanggal) {
        nextErrors.tanggal = 'Tanggal Dokumen/Sumber wajib diisi'
      } else if (!isValidDateOnly(form.tanggal)) {
        nextErrors.tanggal = 'Tanggal Dokumen/Sumber harus valid'
      }
      if (!form.category_id) nextErrors.category_id = 'Kategori wajib dipilih'
      if (!form.keterangan.trim()) nextErrors.keterangan = 'Keterangan wajib diisi'
    }

    if (step === 2) {
      const rawNominal = form.nominal_realisasi.replace(/[^\d]/g, '')
      if (!form.klasifikasi_id) nextErrors.klasifikasi_id = 'Jenis pembayaran wajib dipilih'
      if (!rawNominal) {
        nextErrors.nominal_realisasi = 'Nominal realisasi wajib diisi'
      } else {
        const nominal = parseInt(rawNominal, 10)
        if (!Number.isSafeInteger(nominal) || nominal <= 0) {
          nextErrors.nominal_realisasi = 'Nominal realisasi harus lebih dari 0'
        }
      }
    }

    if (step === 3) {
      Object.assign(nextErrors, validateAttachmentRows(attachmentRows).errors)
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors((prev) => ({ ...prev, ...nextErrors }))
      return false
    }

    return true
  }

  function handleNextStep() {
    if (!validateCurrentStep()) return
    setSubmitError(null)
    setStep((prev) => Math.min(prev + 1, MANUAL_CREATE_STEP_LABELS.length))
  }

  function handleBackStep() {
    setSubmitError(null)
    setStep((prev) => Math.max(prev - 1, 1))
  }

  function handleRequestClose() {
    if (isDirty) {
      setPendingClose(true)
      return
    }

    onClose()
  }

  function handleCancelLeave() {
    setPendingClose(false)
    if (leaveBlocker.status === 'blocked') {
      leaveBlocker.reset()
    }
  }

  function handleConfirmLeave() {
    setPendingClose(false)
    clearManualCreateDraft()
    skipBeforeUnloadRef.current = true

    if (leaveBlocker.status === 'blocked') {
      leaveBlocker.proceed()
      return
    }

    onClose()
  }

  function closeDraftPreview() {
    setPreviewingDraftAttachment((current) => {
      revokePreviewUrl(current?.url)
      return null
    })
  }

  function openDraftPreview(row: AttachmentRow) {
    if (!row.file) return

    closeDraftPreview()
    setPreviewingDraftAttachment({
      title: row.title || row.file.name,
      url: URL.createObjectURL(row.file),
    })
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
  }

  async function handleFinalSubmit() {
    if (step !== MANUAL_CREATE_STEP_LABELS.length) {
      return
    }

    const validation = validateForm(form)
    const attachmentValidation = validateAttachmentRows(attachmentRows)
    Object.assign(validation.errors, attachmentValidation.errors)

    if (Object.keys(validation.errors).length > 0) {
      setErrors(validation.errors)
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      const createResponse = await apiMutation<ManualArsipCreateResponse>('/api/arsiparis/manual-arsip', {
        method: 'POST',
        body: {
          nama: form.nama.trim(),
          tanggal: form.tanggal,
          keterangan: form.keterangan.trim(),
          category_id: form.category_id,
          klasifikasi_id: form.klasifikasi_id,
          nominal_realisasi: validation.nominal,
        },
      })

      const createdId = createResponse.manual_arsip?.id
      const createdManualArsip = createResponse.manual_arsip
      if (attachmentValidation.rows.length === 0) {
        if (!createdManualArsip) {
          throw new Error('Dokumen manual tidak ditemukan pada respons.')
        }

        clearManualCreateDraft()
        await onSuccess({
          manualArsip: createdManualArsip,
          uploadedCount: 0,
          notice: {
            tone: 'success',
            message: 'Dokumen manual berhasil dibuat.',
          },
        })
        return
      }

      if (!createdId || !createdManualArsip) {
        throw new Error('Dokumen manual tidak ditemukan pada respons.')
      }

      const formData = new FormData()
      for (const row of attachmentValidation.rows) {
        formData.append(MANUAL_ARSIP_ATTACHMENT_FIELD_NAME, row.file)
        formData.append(MANUAL_ARSIP_ATTACHMENT_TITLE_FIELD_NAME, row.title)
      }

      try {
        const uploadResponse = await apiMutation<ManualArsipUploadResponse>(
          `/api/arsiparis/manual-arsip/${createdId}/attachments`,
          {
            method: 'POST',
            body: formData,
          },
        )
        const uploadedCount = uploadResponse.attachments?.length ?? attachmentValidation.rows.length

        clearManualCreateDraft()
        await onSuccess({
          manualArsip: createdManualArsip,
          uploadedCount,
          notice: {
            tone: 'success',
            message: `Dokumen manual berhasil dibuat. ${uploadedCount} lampiran berhasil diunggah.`,
          },
        })
      } catch {
        clearManualCreateDraft()
        await onSuccess({
          manualArsip: createdManualArsip,
          uploadedCount: 0,
          notice: {
            tone: 'warning',
            message: 'Dokumen berhasil dibuat, tetapi lampiran gagal diunggah.',
          },
        })
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setSubmitError('Akses ditolak')
        return
      }

      setSubmitError(getApiErrorMessage(err, 'Gagal membuat dokumen manual'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {previewingDraftAttachment && (
        <ManualArsipPreviewModal
          preview={previewingDraftAttachment}
          onClose={closeDraftPreview}
        />
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={handleRequestClose}
              aria-label="Kembali dari penambahan dokumen"
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-800"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="min-w-0">
              <p className="font-headline text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">Penambahan Dokumen</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <FileText size={13} className="text-zinc-500" />
                <span className="font-medium text-zinc-800">Kearsipan KSUB</span>
                <ChevronRight size={12} className="text-zinc-300" />
                <span>Tambahkan dokumen manual ke folder</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 px-1 py-1 sm:px-2">
            <StepIndicator
              currentStep={step}
              completedSteps={completedSteps}
              labels={MANUAL_CREATE_STEP_LABELS}
              subtitles={MANUAL_CREATE_STEP_SUBTITLES}
            />
          </div>
        </div>

        <form onSubmit={handleFormSubmit} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
          <div className="min-w-0 overflow-visible rounded-[1.25rem] bg-transparent">
            <div className="rounded-t-[1.25rem] bg-gradient-to-r from-[#F97316] to-[#FB923C] px-4 py-3 text-white sm:px-4">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white">
                  <FileText size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-headline text-base font-bold tracking-tight text-white">
                    {step === 1
                      ? 'Informasi Dokumen'
                      : step === 2
                        ? 'Klasifikasi & Nominal'
                        : step === 3
                          ? 'Lampiran Dokumen'
                          : 'Tinjauan & Konfirmasi'}
                  </h2>
                  <p className="mt-0.5 max-w-2xl text-[10px] font-medium leading-snug text-white/90">
                    {MANUAL_CREATE_STEP_DESCRIPTIONS[step - 1]}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-b-[1.25rem] border border-t-0 border-[#F1E5DA] bg-[#FFFDF9] p-3.5 sm:p-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium leading-snug text-amber-800">
            Dokumen manual ini belum menjadi arsip final. Dokumen akan menjadi bagian arsip ketika berkas Jenis Pembayaran ditutup.
          </div>

          {step === 1 && (
            <>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Nama Dokumen" required error={errors.nama}>
              <input
                value={form.nama}
                onChange={(event) => setField('nama', event.target.value)}
                placeholder="Contoh: Berita Acara Pemeliharaan"
                className={inputClass(errors.nama)}
              />
            </FormField>

            <FormField
              label="Tanggal Dokumen/Sumber"
              required
              hint="tanggal item yang diarsipkan"
              error={errors.tanggal}
            >
              <DatePicker
                value={form.tanggal}
                onChange={(value) => setField('tanggal', value)}
                placeholder="-- Pilih Tanggal Dokumen --"
              />
            </FormField>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Kategori" required error={errors.category_id}>
              <Select
                value={form.category_id}
                onValueChange={(value) => setField('category_id', value ?? '')}
              >
                <SelectTrigger className="min-h-10 w-full rounded-xl border-[#F0E1D5] bg-[#FFFAF6] px-4 text-sm hover:border-[#FFBC80]">
                  <SelectValue placeholder="-- Pilih Kategori --">
                    {(value) => value ? (categories.find((category) => category.id === value)?.nama ?? '') : '-- Pilih Kategori --'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id} label={category.nama}>
                      {category.nama}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <FormField label="Keterangan" required error={errors.keterangan}>
            <textarea
              value={form.keterangan}
              onChange={(event) => setField('keterangan', event.target.value)}
              rows={3}
              placeholder="Berikan ringkasan singkat konteks atau isi berkas fisik..."
              className={cn(inputClass(errors.keterangan), 'h-auto resize-none')}
            />
          </FormField>
            </>
          )}

          {step === 2 && (
            <>
          <div className="grid gap-3">
            <KlasifikasiFormField
              error={errors.klasifikasi_id}
              selectedNode={selectedNode}
              dropdownOpen={dropdownOpen}
              dropdownRef={dropdownRef}
              searchQuery={searchQuery}
              visibleNodes={visibleNodes}
              filteredSearchResults={filteredSearchResults}
              breadcrumbPath={breadcrumbPath}
              currentPath={currentPath}
              onToggle={() => {
                if (dropdownOpen) {
                  setDropdownOpen(false)
                  setSearchQuery('')
                  return
                }

                openKlasifikasiDropdown()
              }}
              onSearchChange={setSearchQuery}
              onBack={handleKlasifikasiBack}
              onSelect={handleKlasifikasiNodeClick}
            />
          </div>

          <div className="grid gap-3">
            <FormField label="Nominal Realisasi" required hint="Rupiah tanpa desimal" error={errors.nominal_realisasi}>
              <input
                type="text"
                inputMode="numeric"
                value={form.nominal_realisasi}
                onChange={(event) => handleNominalRealisasiChange(event.target.value)}
                placeholder="Contoh: 1.500.000"
                className={inputClass(errors.nominal_realisasi)}
              />
            </FormField>
          </div>

          <div className="rounded-lg border border-outline-variant/30 bg-surface-container-low/20 px-3 py-1.5 text-[10px] text-on-surface-variant">
            <p>Catatan: Dokumen akan masuk ke folder Jenis Pembayaran yang dipilih. Metadata arsip baru diisi ketika berkas ditutup.</p>
          </div>
            </>
          )}

          {step === 3 && (
          <div className="space-y-2.5">
            <div className="rounded-xl border border-orange-200 bg-[#FFFDF9]">
              <div className="border-b border-orange-100 px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[13px] font-semibold text-[#FF5A00]">Dokumen Pendukung</h3>
                    <p className="mt-0.5 text-[11px] text-[#FF5A00]">
                      Tambahkan dokumen pendukung untuk melengkapi
                    </p>
                  </div>
                  {attachmentRows.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={openAttachmentTitleForm}
                      disabled={submitting || showAttachmentTitleForm || attachmentRows.length >= MANUAL_ARSIP_ATTACHMENT_MAX_FILES}
                      className="h-8 shrink-0 cursor-pointer gap-1 text-[#FF5A00] hover:bg-[#FFF1E7] hover:text-[#EA580C]"
                    >
                      <Plus size={13} /> Tambah
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-2 p-2">
              {attachmentRows.length === 0 ? (
                <>
                  {!showAttachmentTitleForm && (
                    <>
                      <div className="py-1.5 text-center text-[11px] text-on-surface-variant">
                        Belum ada dokumen. Klik tombol di bawah untuk menambahkan.
                      </div>
                      <button
                        type="button"
                        onClick={openAttachmentTitleForm}
                        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-orange-300 bg-[#FFFCF8] p-3 text-[#FF5A00] transition-colors hover:border-[#FF5A00] hover:bg-[#FFF1E7]"
                      >
                        <Plus size={14} />
                        <span className="text-[13px] font-semibold">Tambah Dokumen Pendukung</span>
                      </button>
                    </>
                  )}
                </>
              ) : (
                <div className="space-y-2.5">
                  {attachmentRows.map((row, index) => (
                    <div
                      key={row.id}
                      className={cn(
                        'flex min-w-0 flex-col gap-1.5 rounded-xl border px-2.5 py-1.5 transition-colors',
                        row.file ? 'border-orange-100 bg-[#FFF7F0]' : 'border-[#F4E7DC] bg-[#FFFCF8]',
                      )}
                    >
                      <div className="flex min-w-0 items-start gap-2.5">
                        <div className={cn(
                          'mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border',
                          row.file ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-orange-300 bg-white text-orange-300',
                        )}>
                          {row.file && <CheckCircle2 size={11} strokeWidth={2.5} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate text-[13px] font-semibold text-stone-900">{row.title}</p>
                            <span className="rounded-md bg-orange-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#FF5A00]">
                              Tambahan
                            </span>
                          </div>
                          {errors[attachmentTitleErrorKey(row.id)] ? (
                            <p className="mt-1 text-[10px] text-error">{errors[attachmentTitleErrorKey(row.id)]}</p>
                          ) : row.file ? (
                            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] font-bold text-emerald-700">
                              <FileText size={12} className="shrink-0" />
                              <span className="truncate">{row.file.name} - {formatFileSize(row.file.size)}</span>
                            </p>
                          ) : (
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">
                              PDF atau gambar pendukung
                            </p>
                          )}
                        </div>
                        {row.file && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openDraftPreview(row)}
                            disabled={submitting}
                            aria-label={`Pratinjau lampiran ${index + 1}`}
                            className="flex size-9 shrink-0 items-center justify-center rounded-full text-zinc-700 transition hover:bg-white hover:text-zinc-950"
                          >
                            <Eye size={13} />
                          </Button>
                        )}
                        <label className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-full border border-[#FF5A00] bg-white px-4 text-xs font-bold text-[#FF5A00] transition hover:bg-[#FFF1E7]">
                          <Upload size={13} />
                          {row.file ? 'Ganti' : 'Unggah'}
                          <input
                            type="file"
                            accept={MANUAL_ARSIP_ATTACHMENT_ACCEPT}
                            onChange={(event) => updateAttachmentFile(row.id, event)}
                            className="sr-only"
                          />
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeAttachmentRow(row.id)}
                          disabled={submitting}
                          aria-label={`Hapus lampiran ${index + 1}`}
                          className="flex size-9 shrink-0 items-center justify-center rounded-full text-zinc-700 transition hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                      {errors[attachmentFileErrorKey(row.id)] && (
                        <p className="text-[10px] text-error">{errors[attachmentFileErrorKey(row.id)]}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {showAttachmentTitleForm && (
                <div className="flex flex-col gap-2 rounded-xl border border-orange-100 bg-[#FFF7F0] p-2.5 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <input
                      value={newAttachmentTitle}
                      onChange={(event) => {
                        setNewAttachmentTitle(event.target.value)
                        setNewAttachmentTitleError('')
                      }}
                      placeholder="Nama dokumen pendukung"
                      className={cn(
                        'h-10 w-full rounded-xl border border-orange-200 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-[#FF5A00] focus:ring-2 focus:ring-orange-100',
                        newAttachmentTitleError && 'border-error',
                      )}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          saveAttachmentTitle()
                        }
                        if (event.key === 'Escape') {
                          cancelAttachmentTitleForm()
                        }
                      }}
                      autoFocus
                    />
                    {newAttachmentTitleError && (
                      <p className="mt-1 text-[10px] text-error">{newAttachmentTitleError}</p>
                    )}
                  </div>
                  <Button type="button" onClick={saveAttachmentTitle} disabled={!newAttachmentTitle.trim()} className="h-10 bg-[#FF5A00] px-4 text-xs font-bold text-white hover:bg-[#EA580C]">
                    Simpan
                  </Button>
                  <Button type="button" variant="ghost" onClick={cancelAttachmentTitleForm} className="h-10 px-3 text-xs">
                    Batal
                  </Button>
                </div>
              )}

              {errors.attachments && (
                <p className="flex items-center gap-1 text-xs text-error">
                  <AlertCircle size={12} /> {errors.attachments}
                </p>
              )}
              </div>
            </div>
          </div>
          )}

          {step === 4 && (
            <ManualCreateReview
              form={form}
              categories={categories}
              selectedNode={selectedNode}
              attachmentRows={attachmentRows}
            />
          )}

          {submitError && (
            <div className="rounded-lg border border-error/20 bg-error/5 px-3 py-2 text-xs text-error">
              {submitError}
            </div>
          )}

          <div className="sticky bottom-0 z-10 -mx-3.5 flex flex-col-reverse gap-2 border-t border-[#F0E1D5] bg-[#FFFDF9]/95 px-3.5 py-2.5 backdrop-blur sm:static sm:mx-0 sm:flex-row sm:justify-between sm:bg-transparent sm:px-0 sm:pb-0">
            <Button type="button" variant="outline" onClick={step === 1 ? handleRequestClose : handleBackStep} disabled={submitting}>
              {step === 1 ? 'Kembali' : 'Kembali'}
            </Button>
            {step < MANUAL_CREATE_STEP_LABELS.length ? (
              <Button
                type="button"
                onClick={handleNextStep}
                disabled={submitting || categories.length === 0 || klasifikasiList.length === 0}
              >
                Lanjutkan
                <ChevronRight size={14} />
              </Button>
            ) : (
              <Button type="button" onClick={handleFinalSubmit} disabled={submitting || categories.length === 0 || klasifikasiList.length === 0}>
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Simpan Dokumen
              </Button>
            )}
          </div>
            </div>
          </div>

          <aside className="min-w-0 space-y-3 xl:sticky xl:top-3">
            <ArchivePanel className="hidden border-[#F1E5DA] bg-[#FFFDF9] p-3.5 shadow-none xl:block">
              <p className="text-[11px] font-semibold text-zinc-600">Progress Pengisian</p>
              <div className="mt-1.5 flex items-end justify-between gap-2">
                <span className="font-headline text-2xl font-bold tracking-tight text-zinc-950">
                  {progressPercentage}%
                </span>
                <span className="mb-1 text-[10px] font-bold text-zinc-500">
                  {step} dari {MANUAL_CREATE_STEP_LABELS.length} bagian
                </span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-[#F97316] transition-[width]"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>

              <div className="mt-3 space-y-1">
                {MANUAL_CREATE_STEP_LABELS.map((label, index) => {
                  const stepNumber = index + 1
                  const isComplete = stepNumber < step
                  const isActive = stepNumber === step

                  return (
                  <div key={label} className="flex w-full items-center gap-2 px-0 py-1.5 text-left">
                    <span className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold',
                      isComplete ? 'bg-emerald-100 text-emerald-700' : isActive ? 'bg-[#F97316] text-white' : 'bg-zinc-100 text-zinc-400',
                    )}>
                      {isComplete ? <CheckCircle2 size={15} strokeWidth={2.5} /> : stepNumber}
                    </span>
                    <span className="min-w-0 flex-1 text-[11px] font-semibold text-zinc-950">{label}</span>
                    <span className={cn(
                      'text-[9px] font-bold uppercase tracking-wide',
                      isComplete ? 'text-emerald-600' : isActive ? 'text-[#D97706]' : 'text-zinc-400',
                    )}>
                      {isComplete ? 'Selesai' : isActive ? 'Aktif' : 'Belum'}
                    </span>
                  </div>
                  )
                })}
              </div>
            </ArchivePanel>

            <ArchivePanel className="border-[#FDBA8C] bg-[#FFF1E7] p-3 shadow-none">
              <div className="flex items-start gap-2.5">
                <div className="flex size-5 shrink-0 items-center justify-center text-[#FF5A00]">
                  <AlertCircle size={14} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#FF5A00]">
                    Perhatian
                  </p>
                  <p className="mt-1 text-[10px] font-medium leading-snug text-zinc-700">
                    Pengisian dokumen manual ini akan terhubung langsung sebagai bagian dari lampiran berkas keuangan yang sah.
                  </p>
                </div>
              </div>
            </ArchivePanel>

          </aside>
        </form>
      </div>

      <AppDialog
        open={pendingClose || leaveBlocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open) handleCancelLeave()
        }}
        title={
          <span className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#FFF3D6] text-[#D97706]">
              <AlertCircle size={22} />
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
              onClick={handleCancelLeave}
              className="border-[#F0E1D5] bg-[#FFFAF6]"
            >
              Tetap di halaman
            </Button>
            <Button
              type="button"
              onClick={handleConfirmLeave}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              Keluar tanpa menyimpan
            </Button>
          </>
        }
      >
        <div />
      </AppDialog>
    </>
  )
}

function KlasifikasiFormField({
  error,
  selectedNode,
  dropdownOpen,
  dropdownRef,
  searchQuery,
  visibleNodes,
  filteredSearchResults,
  breadcrumbPath,
  currentPath,
  onToggle,
  onSearchChange,
  onBack,
  onSelect,
}: {
  error?: string
  selectedNode: KlasifikasiNode | null
  dropdownOpen: boolean
  dropdownRef: RefObject<HTMLDivElement | null>
  searchQuery: string
  visibleNodes: KlasifikasiNode[]
  filteredSearchResults: FlatKlasifikasiOption[]
  breadcrumbPath: string
  currentPath: KlasifikasiNode[]
  onToggle: () => void
  onSearchChange: (value: string) => void
  onBack: () => void
  onSelect: (node: KlasifikasiNode) => void
}) {
  return (
    <FormField
      label="Jenis Pembayaran"
      required
      hint="pilih kode dan nama"
      error={error}
    >
      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border bg-[#FFFAF6] px-4 py-2 text-left text-sm outline-none transition hover:border-[#FFBC80] focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70',
            error ? 'border-error' : 'border-[#F0E1D5]',
          )}
        >
          <div className="min-w-0">
            {selectedNode ? (
              <>
                <p className="truncate font-medium text-on-surface">
                  {formatKlasifikasiLabel(selectedNode)}
                </p>
                <p className="truncate text-[10px] text-on-surface-variant">
                  {selectedNode.kode ? 'Kode klasifikasi tersedia dari data master' : 'Tanpa kode klasifikasi'}
                </p>
              </>
            ) : (
              <p className="text-on-surface-variant">Pilih jenis pembayaran</p>
            )}
          </div>
          <ChevronDown
            size={16}
            className={cn('shrink-0 text-outline transition-transform', dropdownOpen && 'rotate-180')}
          />
        </button>

        {dropdownOpen && (
          <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-[#F0E1D5] bg-[#FFFAF6] shadow-lg">
            <div className="border-b border-[#F0E1D5] p-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline/50" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="Cari nama atau kode jenis pembayaran"
                  className="w-full rounded-xl border border-[#F0E1D5] bg-white py-2 pr-3 pl-9 text-xs outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70"
                />
              </div>

              {!searchQuery.trim() && (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onBack}
                    disabled={currentPath.length === 0}
                    className="gap-1.5 px-2 text-xs"
                  >
                    <ChevronLeft size={14} />
                    Back
                  </Button>
                  <p className="truncate text-[10px] text-on-surface-variant">
                    {breadcrumbPath || 'Root'}
                  </p>
                </div>
              )}
            </div>

            <div className="max-h-72 overflow-y-auto p-2">
              {searchQuery.trim() ? (
                filteredSearchResults.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-on-surface-variant">
                    Tidak ada hasil pencarian.
                  </div>
                ) : (
                  filteredSearchResults.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onSelect(option.node)}
                      className="flex w-full cursor-pointer items-start justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-[#FFF4EA]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-on-surface">
                          {formatKlasifikasiLabel(option.node)}
                        </p>
                        <p className="truncate text-[10px] text-on-surface-variant">
                          Pilih klasifikasi ini
                        </p>
                      </div>
                    </button>
                  ))
                )
              ) : visibleNodes.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-on-surface-variant">
                  Tidak ada klasifikasi pada level ini.
                </div>
              ) : (
                visibleNodes.map((node) => {
                  const hasChildren = (node.children?.length ?? 0) > 0

                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => onSelect(node)}
                      className="flex w-full cursor-pointer items-start justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-[#FFF4EA]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-on-surface">
                          {formatKlasifikasiLabel(node)}
                        </p>
                        <p className="truncate text-[10px] text-on-surface-variant">
                          {hasChildren ? 'Buka sub-klasifikasi' : 'Pilih klasifikasi ini'}
                        </p>
                      </div>
                      {hasChildren && (
                        <ChevronRight size={14} className="mt-0.5 shrink-0 text-outline" />
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>
    </FormField>
  )
}

function ManualCreateReview({
  form,
  categories,
  selectedNode,
  attachmentRows,
}: {
  form: ManualArsipFormState
  categories: ManualArsipCategory[]
  selectedNode: KlasifikasiNode | null
  attachmentRows: AttachmentRow[]
}) {
  const category = categories.find((item) => item.id === form.category_id)
  const finalName = [
    form.nama.trim() || '-',
    category?.nama ?? '-',
    new Date(form.tanggal).getFullYear() || new Date().getFullYear(),
  ].join(' - ')

  return (
    <div className="space-y-3">
      <div className="rounded-[1rem] border border-orange-200 bg-[#FFF8F1] px-3 py-2.5">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#FF4D00]">
          Nama Dokumen Hasil Sistem (Final)
        </p>
        <p className="mt-1 text-sm font-extrabold uppercase tracking-tight text-zinc-950">
          {finalName}
        </p>
      </div>

      <ReviewSection title="1. Informasi Dokumen">
        <ReviewItem label="Nama Dokumen" value={form.nama || '-'} />
        <ReviewItem label="Kategori" value={category?.nama ?? '-'} />
        <ReviewItem label="Tanggal Dokumen/Sumber" value={form.tanggal ? formatDate(form.tanggal) : '-'} />
        <ReviewItem label="Keterangan" value={form.keterangan || '-'} />
      </ReviewSection>

      <ReviewSection title="2. Klasifikasi & Nominal">
        <ReviewItem label="Jenis Pembayaran" value={selectedNode ? formatKlasifikasiLabel(selectedNode) : '-'} emphasis />
        <ReviewItem label="Nominal Realisasi" value={`Rp ${form.nominal_realisasi || '-'}`} emphasis />
      </ReviewSection>

      <ReviewSection title="3. Lampiran Dokumen">
        {attachmentRows.length === 0 ? (
          <p className="text-xs font-medium text-zinc-600">Tidak ada lampiran yang ditambahkan.</p>
        ) : (
          <div className="space-y-2">
            {attachmentRows.map((row, index) => (
              <div key={row.id} className="rounded-xl border border-[#F0E1D5] bg-[#FFFAF6] px-3 py-2">
                <p className="text-xs font-extrabold text-zinc-950">{row.title || `Lampiran ${index + 1}`}</p>
                <p className="mt-0.5 text-[10px] font-medium text-emerald-700">
                  {row.file ? `${row.file.name} (${formatFileSize(row.file.size)})` : 'File belum dipilih'}
                </p>
              </div>
            ))}
          </div>
        )}
      </ReviewSection>

      <div className="rounded-[1rem] border border-amber-200 bg-amber-50 px-3 py-2.5">
        <div className="flex items-start gap-3">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-[#FF5A00]" />
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-zinc-950">Pemberitahuan Konsekuensi</p>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-orange-800">
              Dokumen akan masuk ke folder Jenis Pembayaran yang dipilih. Metadata arsip baru diisi ketika berkas ditutup.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReviewSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-2 border-t border-[#F0E1D5] pt-3">
      <p className="text-[11px] font-black uppercase tracking-[0.24em] text-zinc-400">{title}</p>
      <div className="grid gap-2.5 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function ReviewItem({
  label,
  value,
  emphasis,
}: {
  label: string
  value: ReactNode
  emphasis?: boolean
}) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">{label}</p>
      <p className={cn(
        'mt-0.5 text-sm font-extrabold text-zinc-950',
        emphasis && 'text-[#FF4D00]',
      )}>
        {value}
      </p>
    </div>
  )
}

function FormField({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="block">
      <span className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-on-surface">
        {label}
        {required && <span className="text-error">*</span>}
        {hint && <span className="font-normal text-outline">({hint})</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-[10px] text-error">{error}</span>}
    </div>
  )
}

function NoticeBanner({
  notice,
  onDismiss,
}: {
  notice: SubmissionNotice
  onDismiss: () => void
}) {
  const isWarning = notice.tone === 'warning'

  return (
    <div className={cn(
      'flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-xs',
      isWarning
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-green-200 bg-green-50 text-green-700',
    )}>
      <p>{notice.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded p-0.5 hover:bg-black/5"
        aria-label="Tutup pesan"
      >
        <X size={14} />
      </button>
    </div>
  )
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="flex flex-col items-center gap-3">
        <Loader2 size={24} className="animate-spin text-primary" />
        <p className="text-sm text-on-surface-variant">{label}</p>
      </div>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void | Promise<void> }) {
  return (
    <div className="flex flex-col items-center py-20 gap-4 bg-error/5 rounded-2xl border border-error/20 text-center">
      <AlertCircle size={32} className="text-error" />
      <p className="text-sm text-on-surface-variant">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>Coba Lagi</Button>
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center py-20 gap-4 bg-white/5 rounded-2xl border border-white/10 text-center">
      <div className="w-14 h-14 rounded-xl bg-blue-500/10 flex items-center justify-center">
        <FileText size={24} className="text-blue-500" />
      </div>
      <div>
        <p className="font-headline text-lg font-bold text-on-surface">Belum ada dokumen manual</p>
        <p className="text-on-surface-variant text-xs mt-1">Tambahkan dokumen manual dengan lampiran opsional.</p>
      </div>
      <Button size="sm" onClick={onCreate}>
        <Plus size={14} />
        Tambah Dokumen
      </Button>
    </div>
  )
}

function AccessDeniedState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <div className="rounded-full bg-error/10 p-5">
        <ShieldX className="h-10 w-10 text-error/60" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium text-on-surface">Akses ditolak</p>
        <p className="text-sm text-on-surface-variant max-w-sm">
          Penambahan Dokumen hanya dapat diakses oleh Kepala Sub Bagian Umum.
        </p>
      </div>
      <Button onClick={() => { window.location.href = ROUTES.HOME }}>
        Kembali ke Dashboard
      </Button>
    </div>
  )
}

function ManualStatusBadge({ status }: { status: string }) {
  return <SharedStatusBadge kind="archive" status={status} fallbackLabel={status} />
}

function buildManualArsipAttachmentFileUrl(
  manualArsipId: string,
  attachmentId: string,
  purpose: 'preview' | 'download',
) {
  return `/api/arsiparis/manual-arsip/${encodeURIComponent(manualArsipId)}/attachments/${encodeURIComponent(attachmentId)}/${purpose}`
}

function formatFriendlyAttachmentMetadata(attachment: ManualArsipAttachmentMetadata) {
  return `${getFriendlyDocumentType(attachment.content_type)} • ${formatFileSize(attachment.size_bytes)}`
}

function getFriendlyDocumentType(contentType: string) {
  switch (contentType.trim().toLowerCase()) {
    case 'application/pdf':
      return 'PDF'
    case 'image/jpeg':
    case 'image/jpg':
      return 'Gambar JPEG'
    case 'image/png':
      return 'Gambar PNG'
    case 'image/webp':
      return 'Gambar WEBP'
    case 'image/gif':
      return 'Gambar GIF'
    case 'image/bmp':
      return 'Gambar BMP'
    case 'image/tiff':
      return 'Gambar TIFF'
    case 'image/heic':
      return 'Gambar HEIC'
    case 'image/heif':
      return 'Gambar HEIF'
    default:
      return 'File'
  }
}

function attachmentLinkClass(variant: 'outline' | 'primary') {
  return cn(
    'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
    variant === 'primary'
      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
      : 'border border-border bg-background hover:bg-accent hover:text-accent-foreground',
  )
}

function formatKlasifikasiLabel(node: Pick<KlasifikasiNode, 'kode' | 'nama'>) {
  const kode = node.kode?.trim()
  return kode ? `${kode} - ${node.nama}` : node.nama
}

function compareKlasifikasiKode(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const aParts = (a ?? '').split('.')
  const bParts = (b ?? '').split('.')
  const maxLength = Math.max(aParts.length, bParts.length)

  for (let index = 0; index < maxLength; index += 1) {
    const aPart = aParts[index] ?? ''
    const bPart = bParts[index] ?? ''
    const comparison = aPart.localeCompare(bPart, undefined, {
      numeric: true,
      sensitivity: 'base',
    })

    if (comparison !== 0) return comparison
  }

  return 0
}

function sortKlasifikasiByKode(nodes: KlasifikasiNode[]): KlasifikasiNode[] {
  return [...nodes].sort((left, right) => {
    const kodeComparison = compareKlasifikasiKode(left.kode, right.kode)
    if (kodeComparison !== 0) return kodeComparison

    return left.nama.localeCompare(right.nama, undefined, { sensitivity: 'base' })
  })
}

function flattenKlasifikasiTree(
  nodes: KlasifikasiNode[],
): FlatKlasifikasiOption[] {
  const flattened: FlatKlasifikasiOption[] = []

  for (const node of sortKlasifikasiByKode(nodes)) {
    flattened.push({
      id: node.id,
      kode: node.kode ?? null,
      nama: node.nama,
      node,
    })

    if (node.children?.length) {
      flattened.push(...flattenKlasifikasiTree(node.children))
    }
  }

  return flattened
}

function findRootKlasifikasiNode(nodes: KlasifikasiNode[]): KlasifikasiNode | null {
  if (nodes.length === 1 && nodes[0]?.is_root) return nodes[0]
  return nodes.find((node) => node.is_root) ?? null
}

function buildInitialKlasifikasiNodes(nodes: KlasifikasiNode[]): KlasifikasiNode[] {
  const rootNode = findRootKlasifikasiNode(nodes)
  return sortKlasifikasiByKode(rootNode?.children ?? nodes)
}

function findKlasifikasiNodeById(
  nodes: KlasifikasiNode[],
  targetId: string,
): KlasifikasiNode | null {
  for (const node of nodes) {
    if (node.id === targetId) return node

    const childMatch = findKlasifikasiNodeById(node.children ?? [], targetId)
    if (childMatch) return childMatch
  }

  return null
}

function findKlasifikasiPathToNode(
  nodes: KlasifikasiNode[],
  targetId: string,
): KlasifikasiNode[] {
  for (const node of nodes) {
    if (node.id === targetId) return [node]

    const childPath = findKlasifikasiPathToNode(node.children ?? [], targetId)
    if (childPath.length > 0) return [node, ...childPath]
  }

  return []
}

function validateForm(form: ManualArsipFormState): {
  errors: Record<string, string>
  nominal: number
} {
  const errors: Record<string, string> = {}
  const rawNominal = form.nominal_realisasi.replace(/[^\d]/g, '')
  let nominal = 0

  if (!form.nama.trim()) errors.nama = 'Nama Dokumen wajib diisi'

  if (!form.tanggal) {
    errors.tanggal = 'Tanggal Dokumen/Sumber wajib diisi'
  } else if (!isValidDateOnly(form.tanggal)) {
    errors.tanggal = 'Tanggal Dokumen/Sumber harus valid'
  }

  if (!form.keterangan.trim()) errors.keterangan = 'Keterangan wajib diisi'
  if (!form.category_id) errors.category_id = 'Kategori wajib dipilih'
  if (!form.klasifikasi_id) errors.klasifikasi_id = 'Jenis pembayaran wajib dipilih'

  if (!rawNominal) {
    errors.nominal_realisasi = 'Nominal realisasi wajib diisi'
  } else {
    nominal = parseInt(rawNominal, 10)
    if (!Number.isSafeInteger(nominal)) {
      errors.nominal_realisasi = 'Nominal harus berupa angka'
    } else if (nominal <= 0) {
      errors.nominal_realisasi = 'Nominal realisasi harus lebih dari 0'
    }
  }

  return { errors, nominal }
}

function validateAttachmentRows(rows: AttachmentRow[]): {
  errors: Record<string, string>
  rows: Array<{ title: string; file: File }>
} {
  const errors: Record<string, string> = {}
  const validatedRows: Array<{ title: string; file: File }> = []

  if (rows.length > MANUAL_ARSIP_ATTACHMENT_MAX_FILES) {
    errors.attachments = 'Maksimal 5 lampiran'
  }

  for (const row of rows) {
    const title = row.title.trim()
    let rowHasError = false

    if (!title) {
      errors[attachmentTitleErrorKey(row.id)] = 'Judul lampiran wajib diisi'
      rowHasError = true
    } else if (title.length > MANUAL_ARSIP_ATTACHMENT_TITLE_MAX_LENGTH) {
      errors[attachmentTitleErrorKey(row.id)] = 'Judul lampiran maksimal 120 karakter'
      rowHasError = true
    }

    if (!row.file) {
      errors[attachmentFileErrorKey(row.id)] = 'File lampiran wajib dipilih'
      rowHasError = true
    } else {
      const fileError = validateAttachmentFile(row.file)
      if (fileError) {
        errors[attachmentFileErrorKey(row.id)] = fileError
        rowHasError = true
      }
    }

    if (!rowHasError && row.file) {
      validatedRows.push({ title, file: row.file })
    }
  }

  return { errors, rows: validatedRows }
}

function validateAttachmentFile(file: File): string | null {
  if (file.size <= 0) {
    return 'File lampiran tidak valid'
  }

  if (file.size > MANUAL_ARSIP_ATTACHMENT_MAX_BYTES) {
    return 'Ukuran file maksimal 10MB per file'
  }

  const contentType = file.type.trim().toLowerCase()
  if (!contentType || !MANUAL_ARSIP_ALLOWED_CONTENT_TYPE_SET.has(contentType)) {
    return 'Tipe file tidak diizinkan. Gunakan PDF atau gambar yang didukung.'
  }

  return null
}

let attachmentRowCounter = 0

function createAttachmentRow(title = ''): AttachmentRow {
  attachmentRowCounter += 1
  return {
    id: `attachment-row-${Date.now()}-${attachmentRowCounter}`,
    title,
    file: null,
  }
}

function attachmentTitleErrorKey(rowId: string): string {
  return `attachment_${rowId}_title`
}

function attachmentFileErrorKey(rowId: string): string {
  return `attachment_${rowId}_file`
}

function clearAttachmentRowErrors(
  errors: Record<string, string>,
  rowId: string,
): Record<string, string> {
  const next = { ...errors }
  delete next[attachmentTitleErrorKey(rowId)]
  delete next[attachmentFileErrorKey(rowId)]
  delete next.attachments
  return next
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))

  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
}

function inputClass(error?: string) {
  return cn(
    'h-10 w-full rounded-xl border bg-[#FFFDF9] px-3 py-2 text-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70',
    error ? 'border-error' : 'border-orange-100',
  )
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const payload = error.payload
    if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
      return payload.error
    }

    return error.message || fallback
  }

  return fallback
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 3)}...`
}

function shortId(id: string) {
  return id.slice(0, 8)
}

function formatNullableCurrency(value: number | null) {
  if (value === null) return '-'
  return formatCurrency(value)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
