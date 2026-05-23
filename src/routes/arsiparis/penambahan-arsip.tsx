import { createFileRoute, Link } from '@tanstack/react-router'
import {
  AlertCircle,
  Archive,
  ChevronRight,
  Loader2,
  Plus,
  ShieldX,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'

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

type ManualArsipFormState = {
  nama: string
  tanggal: string
  keterangan: string
  category_id: string
  nominal_realisasi: string
}

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
              Arsip manual metadata-only. Fase ini tidak menyediakan upload, preview, download, lifecycle action, atau ekspor.
            </p>
          </div>

          {authChecked && !accessDenied && (
            <Button onClick={() => setFormOpen(true)} className="w-full lg:w-auto">
              <Plus size={14} />
              Tambah Arsip
            </Button>
          )}
        </div>

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
              <EmptyState onCreate={() => setFormOpen(true)} />
            ) : (
              <ManualArsipTable items={items} limit={limit} />
            )}
          </>
        )}

        <CreateManualArsipModal
          categories={categories}
          isOpen={formOpen}
          onClose={() => setFormOpen(false)}
          onSuccess={async () => {
            await fetchData()
            setFormOpen(false)
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
        Menampilkan {items.length}{limit ? ` dari maksimal ${limit}` : ''} arsip manual. Tidak ada kontrol upload, preview, download, lifecycle, atau ekspor pada halaman ini.
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
  onSuccess: () => void | Promise<void>
}) {
  const [form, setForm] = useState<ManualArsipFormState>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setForm(emptyForm())
    setErrors({})
    setSubmitError(null)
    setSubmitting(false)
  }, [isOpen])

  if (!isOpen) return null

  function setField<K extends keyof ManualArsipFormState>(field: K, value: ManualArsipFormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: '' }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const validation = validateForm(form)
    if (Object.keys(validation.errors).length > 0) {
      setErrors(validation.errors)
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      await apiMutation<ManualArsipCreateResponse>('/api/arsiparis/manual-arsip', {
        method: 'POST',
        body: {
          nama: form.nama.trim(),
          tanggal: form.tanggal,
          keterangan: form.keterangan.trim(),
          category_id: form.category_id,
          nominal_realisasi: validation.nominal,
        },
      })

      await onSuccess()
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
            <p className="text-xs text-outline mt-0.5">Create parent record tanpa lampiran file.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup dialog tambah arsip" className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-surface-container-low transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            Fase ini tidak menerima upload lampiran. Klasifikasi arsip belum dipilih dari UI pada fase ini; data klasifikasi yang sudah ada tetap ditampilkan di daftar jika API mengembalikannya.
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
                type="number"
                min="0"
                step="0.01"
                value={form.nominal_realisasi}
                onChange={(event) => setField('nominal_realisasi', event.target.value)}
                placeholder="0"
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
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-on-surface">
        {label}
        {required && <span className="text-error">*</span>}
        {hint && <span className="font-normal text-outline">({hint})</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-[10px] text-error">{error}</span>}
    </label>
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
        <p className="text-on-surface-variant text-xs mt-1">Tambahkan parent record arsip tanpa lampiran file.</p>
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
  const trimmedNominal = form.nominal_realisasi.trim()
  let nominal: number | null = null

  if (!form.nama.trim()) errors.nama = 'Nama wajib diisi'
  if (!isValidDateOnly(form.tanggal)) errors.tanggal = 'Tanggal harus valid'
  if (!form.keterangan.trim()) errors.keterangan = 'Keterangan wajib diisi'
  if (!form.category_id) errors.category_id = 'Kategori wajib dipilih'

  if (trimmedNominal) {
    nominal = Number(trimmedNominal)
    if (!Number.isFinite(nominal)) {
      errors.nominal_realisasi = 'Nominal harus berupa angka'
    } else if (nominal < 0) {
      errors.nominal_realisasi = 'Nominal realisasi tidak boleh negatif'
    }
  }

  return { errors, nominal }
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
