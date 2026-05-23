import { createFileRoute, Link } from '@tanstack/react-router'
import {
  AlertCircle,
  Archive,
  ChevronRight,
  Loader2,
  Plus,
  ShieldX,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'

import { PageLayout } from '#/components/dashboard/PageLayout'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
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
  original_filename: string
  content_type: string
  size_bytes: number
  created_at: string
}

type ManualArsipUploadResponse = {
  attachments?: ManualArsipAttachmentMetadata[]
  error?: string
}

type ManualArsipFormState = {
  nama: string
  tanggal: string
  keterangan: string
  category_id: string
  nominal_realisasi: string
}

type SubmissionNotice = {
  tone: 'success' | 'warning'
  message: string
}

type CreateManualArsipResult = {
  notice: SubmissionNotice
}

type AttachmentRow = {
  id: string
  title: string
  file: File | null
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

const emptyForm = (): ManualArsipFormState => ({
  nama: '',
  tanggal: new Date().toISOString().slice(0, 10),
  keterangan: '',
  category_id: '',
  nominal_realisasi: '',
})

function PenambahanArsipPage() {
  const [authChecked, setAuthChecked] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [items, setItems] = useState<ManualArsipListItem[]>([])
  const [categories, setCategories] = useState<ManualArsipCategory[]>([])
  const [limit, setLimit] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [notice, setNotice] = useState<SubmissionNotice | null>(null)

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      const [categoryJson, listJson] = await Promise.all([
        apiFetch<CategoriesResponse>('/arsiparis/manual-arsip/categories'),
        apiFetch<ManualArsipListResponse>('/arsiparis/manual-arsip'),
      ])

      setCategories(categoryJson.categories ?? [])
      setItems(listJson.manual_arsip ?? [])
      setLimit(listJson.meta?.limit ?? null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setAccessDenied(true)
        return
      }

      if (err instanceof ApiError && err.status === 401) {
        window.location.href = ROUTES.LOGIN
        return
      }

      setError(getApiErrorMessage(err, 'Gagal memuat arsip manual. Coba muat ulang halaman.'))
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

  const totalNominal = useMemo(() => {
    return items.reduce((total, item) => total + (item.nominal_realisasi ?? 0), 0)
  }, [items])

  function openCreateModal() {
    setNotice(null)
    setFormOpen(true)
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
              <Link to="/arsiparis" className="hover:text-primary">Kepala Sub Bagian Umum</Link>
              <ChevronRight size={10} />
              <span className="text-primary">Penambahan Arsip</span>
            </div>
            <h2 className="font-headline text-2xl font-extrabold text-on-surface">Penambahan Arsip</h2>
            <p className="text-on-surface-variant text-xs mt-1">
              Arsip manual dengan lampiran bukti opsional. Fase ini tidak menyediakan preview, download, lifecycle action, atau ekspor.
            </p>
          </div>

          {authChecked && !accessDenied && (
            <Button onClick={openCreateModal} className="w-full lg:w-auto">
              <Plus size={14} />
              Tambah Arsip
            </Button>
          )}
        </div>

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
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <SummaryCard label="Arsip Manual" value={String(items.length)} />
              <SummaryCard label="Total Nominal Tampil" value={formatCurrency(totalNominal)} />
              <SummaryCard label="Batas API" value={limit ? `${limit} record` : '-'} />
            </div>

            {loading ? (
              <LoadingState label="Memuat arsip manual..." />
            ) : error ? (
              <ErrorState message={error} onRetry={fetchData} />
            ) : items.length === 0 ? (
              <EmptyState onCreate={openCreateModal} />
            ) : (
              <ManualArsipTable items={items} limit={limit} />
            )}
          </>
        )}

        <CreateManualArsipModal
          categories={categories}
          isOpen={formOpen}
          onClose={() => setFormOpen(false)}
          onSuccess={async (result) => {
            await fetchData()
            setFormOpen(false)
            setNotice(result.notice)
          }}
        />
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
  return (
    <div className="bg-white rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-surface-container-low/30 text-left">
              <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider w-10 text-center">No</th>
              <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider min-w-52">Nama</th>
              <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center">Tanggal</th>
              <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Kategori</th>
              <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider">Klasifikasi</th>
              <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider min-w-64">Keterangan</th>
              <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-right">Nominal</th>
              <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center">Status</th>
              <th className="px-4 py-3 font-semibold text-outline uppercase tracking-wider text-center">Diperbarui</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id} className="border-t border-outline-variant/20 hover:bg-primary/5 transition-colors">
                <td className="px-4 py-3 text-center text-outline">{idx + 1}</td>
                <td className="px-4 py-3">
                  <p className="font-semibold text-on-surface">{item.nama}</p>
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
                  <StatusBadge status={item.status_arsip} />
                </td>
                <td className="px-4 py-3 text-center text-on-surface-variant">{formatDateTime(item.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2.5 border-t bg-surface-container-low/20 text-xs text-outline">
        Menampilkan {items.length}{limit ? ` dari maksimal ${limit}` : ''} arsip manual. Tidak ada preview, download, lifecycle, atau ekspor pada halaman ini.
      </div>
    </div>
  )
}

function CreateManualArsipModal({
  categories,
  isOpen,
  onClose,
  onSuccess,
}: {
  categories: ManualArsipCategory[]
  isOpen: boolean
  onClose: () => void
  onSuccess: (result: CreateManualArsipResult) => void | Promise<void>
}) {
  const [form, setForm] = useState<ManualArsipFormState>(emptyForm)
  const [attachmentRows, setAttachmentRows] = useState<AttachmentRow[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setForm(emptyForm())
    setAttachmentRows([])
    setErrors({})
    setSubmitError(null)
    setSubmitting(false)
  }, [isOpen])

  if (!isOpen) return null

  function setField<K extends keyof ManualArsipFormState>(field: K, value: ManualArsipFormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: '' }))
  }

  function handleNominalRealisasiChange(value: string) {
    const raw = value.replace(/[^\d]/g, '')
    const numericValue = parseInt(raw, 10)
    setField('nominal_realisasi', raw ? numericValue.toLocaleString('id-ID') : '')
  }

  function addAttachmentRow() {
    if (attachmentRows.length >= MANUAL_ARSIP_ATTACHMENT_MAX_FILES) {
      setErrors((prev) => ({ ...prev, attachments: 'Maksimal 5 lampiran' }))
      return
    }

    setAttachmentRows((prev) => [...prev, createAttachmentRow()])
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

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
          nominal_realisasi: validation.nominal,
        },
      })

      const createdId = createResponse.manual_arsip?.id
      if (attachmentValidation.rows.length === 0) {
        await onSuccess({
          notice: {
            tone: 'success',
            message: 'Arsip manual berhasil dibuat.',
          },
        })
        return
      }

      if (!createdId) {
        await onSuccess({
          notice: {
            tone: 'warning',
            message: 'Arsip berhasil dibuat, tetapi lampiran gagal diunggah.',
          },
        })
        return
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

        await onSuccess({
          notice: {
            tone: 'success',
            message: `Arsip manual berhasil dibuat. ${uploadedCount} lampiran berhasil diunggah.`,
          },
        })
      } catch {
        await onSuccess({
          notice: {
            tone: 'warning',
            message: 'Arsip berhasil dibuat, tetapi lampiran gagal diunggah.',
          },
        })
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setSubmitError('Akses ditolak')
        return
      }

      setSubmitError(getApiErrorMessage(err, 'Gagal membuat arsip manual'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-2xl bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-label="Tambah arsip manual">
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/30">
          <div>
            <p className="font-semibold text-on-surface">Tambah Arsip Manual</p>
            <p className="text-xs text-outline mt-0.5">Create parent record dengan bukti dokumen opsional.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup dialog tambah arsip" className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-surface-container-low transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            Fase ini menerima lampiran opsional sebagai metadata aman. Tidak ada preview/download pada fase ini. Klasifikasi arsip belum dipilih dari UI; data klasifikasi yang sudah ada tetap ditampilkan di daftar jika API mengembalikannya.
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Nama" required error={errors.nama}>
              <input
                value={form.nama}
                onChange={(event) => setField('nama', event.target.value)}
                placeholder="Contoh: Berita Acara Pemeliharaan"
                className={inputClass(errors.nama)}
              />
            </FormField>

            <FormField label="Tanggal" required error={errors.tanggal}>
              <input
                type="date"
                value={form.tanggal}
                onChange={(event) => setField('tanggal', event.target.value)}
                className={inputClass(errors.tanggal)}
              />
            </FormField>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Kategori" required error={errors.category_id}>
              <select
                value={form.category_id}
                onChange={(event) => setField('category_id', event.target.value)}
                className={inputClass(errors.category_id)}
              >
                <option value="">Pilih kategori</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.nama}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Nominal Realisasi" hint="Opsional pada fase ini" error={errors.nominal_realisasi}>
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

          <FormField label="Keterangan" required error={errors.keterangan}>
            <textarea
              value={form.keterangan}
              onChange={(event) => setField('keterangan', event.target.value)}
              rows={4}
              placeholder="Keterangan arsip manual..."
              className={cn(inputClass(errors.keterangan), 'h-auto resize-none')}
            />
          </FormField>

          <FormField label="Bukti dokumen (opsional)" error={errors.attachments}>
            <div className="space-y-3">
              {attachmentRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-outline-variant/50 bg-surface-container-low/20 px-3 py-4 text-center text-xs text-on-surface-variant">
                  Belum ada lampiran tambahan.
                </div>
              ) : (
                <div className="space-y-3">
                  {attachmentRows.map((row, index) => (
                    <div key={row.id} className="rounded-lg border border-outline-variant/30 bg-white p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-on-surface">Lampiran {index + 1}</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => removeAttachmentRow(row.id)}
                          disabled={submitting}
                          aria-label={`Hapus lampiran ${index + 1}`}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <FormField label="Judul lampiran" required error={errors[attachmentTitleErrorKey(row.id)]}>
                          <input
                            value={row.title}
                            onChange={(event) => updateAttachmentTitle(row.id, event.target.value)}
                            placeholder="Contoh: Bukti Kegiatan"
                            className={inputClass(errors[attachmentTitleErrorKey(row.id)])}
                          />
                        </FormField>
                        <FormField label="File lampiran" required error={errors[attachmentFileErrorKey(row.id)]}>
                          <input
                            type="file"
                            accept={MANUAL_ARSIP_ATTACHMENT_ACCEPT}
                            onChange={(event) => updateAttachmentFile(row.id, event)}
                            className={cn(
                              inputClass(errors[attachmentFileErrorKey(row.id)]),
                              'h-auto file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary',
                            )}
                          />
                          {row.file && (
                            <p className="mt-1 text-[10px] text-on-surface-variant">
                              {row.file.name} - {formatFileSize(row.file.size)}
                            </p>
                          )}
                        </FormField>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addAttachmentRow}
                disabled={submitting || attachmentRows.length >= MANUAL_ARSIP_ATTACHMENT_MAX_FILES}
              >
                <Plus size={14} />
                Tambah Lampiran
              </Button>
            </div>
            <div className="mt-2 rounded-lg border border-outline-variant/30 bg-surface-container-low/20 px-3 py-2 text-[11px] text-on-surface-variant">
              <p>Maksimal 5 lampiran.</p>
              <p>Maksimal 10MB per file.</p>
              <p>Format: PDF, JPG/JPEG, PNG, WEBP, GIF, BMP, TIFF, HEIC/HEIF.</p>
              <p>Tidak ada preview/download pada fase ini.</p>
            </div>
          </FormField>

          {submitError && (
            <div className="rounded-lg border border-error/20 bg-error/5 px-3 py-2 text-xs text-error">
              {submitError}
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting || categories.length === 0}>
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Simpan Arsip
            </Button>
          </div>
        </form>
      </div>
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

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-widest text-outline">{label}</p>
      <p className="mt-2 text-xl font-extrabold text-on-surface">{value}</p>
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
        <Archive size={24} className="text-blue-500" />
      </div>
      <div>
        <p className="font-headline text-lg font-bold text-on-surface">Belum ada arsip manual</p>
        <p className="text-on-surface-variant text-xs mt-1">Tambahkan arsip manual dengan bukti dokumen opsional.</p>
      </div>
      <Button size="sm" onClick={onCreate}>
        <Plus size={14} />
        Tambah Arsip
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
          Penambahan Arsip hanya dapat diakses oleh Kepala Sub Bagian Umum.
        </p>
      </div>
      <Button onClick={() => { window.location.href = ROUTES.HOME }}>
        Kembali ke Dashboard
      </Button>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'AKTIF') {
    return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">AKTIF</Badge>
  }

  if (status === 'INAKTIF') {
    return <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">INAKTIF</Badge>
  }

  if (status === 'USUL_MUSNAH') {
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">USUL MUSNAH</Badge>
  }

  if (status === 'DIMUSNAHKAN') {
    return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">DIMUSNAHKAN</Badge>
  }

  return <Badge variant="outline" className="text-xs">{status}</Badge>
}

function validateForm(form: ManualArsipFormState): {
  errors: Record<string, string>
  nominal: number | null
} {
  const errors: Record<string, string> = {}
  const rawNominal = form.nominal_realisasi.replace(/[^\d]/g, '')
  let nominal: number | null = null

  if (!form.nama.trim()) errors.nama = 'Nama wajib diisi'
  if (!isValidDateOnly(form.tanggal)) errors.tanggal = 'Tanggal harus valid'
  if (!form.keterangan.trim()) errors.keterangan = 'Keterangan wajib diisi'
  if (!form.category_id) errors.category_id = 'Kategori wajib dipilih'

  if (rawNominal) {
    nominal = parseInt(rawNominal, 10)
    if (!Number.isSafeInteger(nominal)) {
      errors.nominal_realisasi = 'Nominal harus berupa angka'
    } else if (nominal < 0) {
      errors.nominal_realisasi = 'Nominal realisasi tidak boleh negatif'
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

function createAttachmentRow(): AttachmentRow {
  attachmentRowCounter += 1
  return {
    id: `attachment-row-${Date.now()}-${attachmentRowCounter}`,
    title: '',
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
    'w-full h-10 px-3 py-2 border rounded-lg text-sm bg-white outline-none focus:ring-1 focus:ring-ring',
    error ? 'border-error' : 'border-border',
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
