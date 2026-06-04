/**
 * KelengkapanChecklist — shows required/optional documents for a kegiatan + role.
 * Allows file upload per kelengkapan item.
 * For Non-Material: only shows user-created optional documents.
 * For Material: shows admin kelengkapan + user-created optional documents.
 */
import { useEffect, useState } from 'react'
import { FileText, AlertCircle, CheckCircle2, Plus, X, User, Trash2 } from 'lucide-react'
import { cn } from '#/lib/utils'
import { createClientId } from '#/lib/utils/client-id'
import { apiFetch } from '#/lib/api-client'
import { FileUploadButton } from './FileUploadButton'
import type { LampiranUrl } from '#/lib/dokumen-helpers'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  DUPLICATE_ADDITIONAL_KELENGKAPAN_ERROR,
  normalizeKelengkapanName,
} from '#/lib/kelengkapan-validation'

type KelengkapanItem = {
  id: string
  nama_dokumen: string
  is_ketua_tim: boolean
  required: boolean
}

type KelengkapanApiItem = KelengkapanItem & {
  kegiatan_id?: string | null
  jenis_permintaan_id?: string | null
  kategori_permintaan_id?: string | null
  detail_permintaan_id?: string | null
}

type UserOptionalDoc = {
  id: string           // temp UUID: "user-custom-{uuid}"
  nama_dokumen: string // judul yang diisi user
  lampiran?: LampiranUrl
}

interface KelengkapanChecklistProps {
  kegiatanId: string
  isKetuaTim: boolean
  initialLampirans?: LampiranUrl[]
  onComplete: (lampirans: LampiranUrl[], missingRequired: KelengkapanItem[]) => void
  jenisPermintaanId?: string
  kategoriPermintaanId?: string
  detailPermintaanId?: string
  isNonMaterial?: boolean  // NEW: jika true, skip admin kelengkapan
}

function matchesCurrentChain(
  item: KelengkapanApiItem,
  filters: {
    jenisPermintaanId?: string
    kategoriPermintaanId?: string
    detailPermintaanId?: string
  },
): boolean {
  const {
    jenisPermintaanId,
    kategoriPermintaanId,
    detailPermintaanId,
  } = filters

  if (detailPermintaanId) {
    return item.detail_permintaan_id === detailPermintaanId
  }

  if (kategoriPermintaanId) {
    return item.kategori_permintaan_id === kategoriPermintaanId
      && item.detail_permintaan_id == null
  }

  if (jenisPermintaanId) {
    return item.jenis_permintaan_id === jenisPermintaanId
      && item.kategori_permintaan_id == null
      && item.detail_permintaan_id == null
  }

  return true
}

export function KelengkapanChecklist({
  kegiatanId,
  isKetuaTim,
  initialLampirans = [],
  onComplete,
  jenisPermintaanId,
  kategoriPermintaanId,
  detailPermintaanId,
  isNonMaterial = false,
}: KelengkapanChecklistProps) {
  const [items, setItems] = useState<KelengkapanItem[]>([])
  const [loading, setLoading] = useState(true)
  const [lampiranUrls, setLampiranUrls] = useState<LampiranUrl[]>(initialLampirans)
  const [error, setError] = useState('')

  // User-created optional documents state
  const [userDocs, setUserDocs] = useState<UserOptionalDoc[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newDocTitle, setNewDocTitle] = useState('')
  const [userDocError, setUserDocError] = useState('')

  useEffect(() => {
    async function fetchKelengkapan() {
      if (!kegiatanId) return
      // Skip fetch untuk Non-Material — tidak ada kelengkapan admin
      if (isNonMaterial) {
        setItems([])
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')
      try {
        const data = await apiFetch<KelengkapanApiItem[]>('/master-kelengkapan', {
          query: {
            kegiatan_id: kegiatanId,
            is_ketua_tim: isKetuaTim,
          },
        })

        const filtered = data
          .filter(item => matchesCurrentChain(item, {
            jenisPermintaanId,
            kategoriPermintaanId,
            detailPermintaanId,
          }))
          .map(({ id, nama_dokumen, is_ketua_tim, required }) => ({
            id,
            nama_dokumen,
            is_ketua_tim,
            required,
          }))

        setItems(filtered)
      } catch {
        setError('Gagal mengambil daftar kelengkapan')
      } finally {
        setLoading(false)
      }
    }

    fetchKelengkapan()
  }, [kegiatanId, isKetuaTim, jenisPermintaanId, kategoriPermintaanId, detailPermintaanId, isNonMaterial])

  // Notify parent when lampiranUrls changes
  useEffect(() => {
    const missing = items.filter(
      item => item.required && !lampiranUrls.some(l => l.kelengkapan_id === item.id)
    )
    onComplete(lampiranUrls, missing)
  }, [lampiranUrls, items, onComplete])

  // User-created document handlers
  function handleUploaded(kelengkapanId: string, lampiran: LampiranUrl) {
    setLampiranUrls(prev => {
      const filtered = prev.filter(l => l.kelengkapan_id !== kelengkapanId)
      return [...filtered, lampiran]
    })
  }

  function handleRemoved(kelengkapanId: string) {
    setLampiranUrls(prev => prev.filter(l => l.kelengkapan_id !== kelengkapanId))
  }

  function addUserDoc() {
    const trimmedTitle = newDocTitle.trim()
    if (!trimmedTitle) return

    const normalizedTitle = normalizeKelengkapanName(trimmedTitle)
    const duplicate = userDocs.some(doc => normalizeKelengkapanName(doc.nama_dokumen) === normalizedTitle)
    if (duplicate) {
      setUserDocError(`${DUPLICATE_ADDITIONAL_KELENGKAPAN_ERROR}: "${trimmedTitle}"`)
      return
    }

    const id = createClientId('user-custom')
    setUserDocs(prev => [...prev, { id, nama_dokumen: trimmedTitle }])
    setNewDocTitle('')
    setUserDocError('')
    setShowAddForm(false)
  }

  function removeUserDoc(id: string) {
    setUserDocs(prev => prev.filter(d => d.id !== id))
    // Also remove from lampiranUrls
    setLampiranUrls(prev => prev.filter(l => l.kelengkapan_id !== id))
  }

  function updateUserDocTitle(id: string, newTitle: string) {
    setUserDocs(prev => prev.map(d => d.id === id ? { ...d, nama_dokumen: newTitle } : d))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-on-surface-variant">Memuat kelengkapan...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-error text-xs px-3 py-2 bg-error/10 rounded-lg">
        <AlertCircle size={14} />
        {error}
      </div>
    )
  }

  // Don't show "no kelengkapan" message if we have user docs or it's Non-Material
  if (items.length === 0 && userDocs.length === 0 && !isNonMaterial) {
    return (
      <div className="text-center py-6 text-xs text-on-surface-variant">
        Tidak ada kelengkapan untuk kegiatan dan peran ini.
      </div>
    )
  }

  const requiredCount = items.filter(i => i.required).length
  const uploadedCount = lampiranUrls.filter(l =>
    items.some(i => i.id === l.kelengkapan_id && i.required)
  ).length

  const userUploadedCount = lampiranUrls.filter(l =>
    userDocs.some(d => d.id === l.kelengkapan_id)
  ).length
  const totalCount = items.length + userDocs.length
  const progressPercentage = totalCount > 0
    ? Math.min(100, Math.round((lampiranUrls.length / totalCount) * 100))
    : 0
  const requiredReady = requiredCount === 0 || uploadedCount >= requiredCount
  const attachmentReady = requiredReady && lampiranUrls.length > 0

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-2xl border border-orange-100 bg-[#FFF9F3] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
              attachmentReady
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-amber-100 text-amber-700'
            }`}>
              {attachmentReady ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            </div>
            <div>
              <p className="text-sm font-black text-zinc-950">Progress Lampiran</p>
              <p className="mt-0.5 text-[10px] font-medium text-zinc-600">
                {lampiranUrls.length} dari {totalCount} dokumen diunggah
                {requiredCount > 0 && ` - ${uploadedCount}/${requiredCount} wajib`}
                {userDocs.length > 0 && ` - ${userUploadedCount}/${userDocs.length} tambahan`}
                {totalCount === 0 && ' - tambahkan minimal satu dokumen pendukung'}
              </p>
            </div>
          </div>
          {!attachmentReady ? (
            <span className="w-fit rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-800">
              {requiredCount > uploadedCount
                ? `${requiredCount - uploadedCount} wajib belum diunggah`
                : 'Belum ada lampiran'}
            </span>
          ) : (
            <span className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-800">
              Lampiran wajib siap
            </span>
          )}
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-orange-100">
          <div
            className="h-full rounded-full bg-orange-500 transition-[width]"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Admin Kelengkapan */}
      {!isNonMaterial && items.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
            Kelengkapan Admin
          </p>
          {items.map(item => {
            const uploaded = lampiranUrls.find(l => l.kelengkapan_id === item.id)
            return (
              <div
                key={item.id}
                className={cn(
                  'flex min-w-0 flex-col gap-3 rounded-2xl border p-3.5 transition-colors sm:flex-row',
                  uploaded
                    ? 'border-emerald-200 bg-emerald-50/60'
                    : item.required
                      ? 'border-amber-200 bg-amber-50/50'
                      : 'border-orange-100 bg-[#FFFDF9]'
                )}
              >
                <div className="shrink-0 mt-0.5">
                  <FileText
                    size={14}
                    className={cn(
                      uploaded ? 'text-emerald-600' : item.required ? 'text-amber-600' : 'text-orange-500'
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-bold text-zinc-950">{item.nama_dokumen}</p>
                    {item.required && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                        WAJIB
                      </span>
                    )}
                    {!item.required && (
                      <span className="rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">
                        OPSIONAL
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5">
                    {uploaded ? (
                      <FileUploadButton
                        kelengkapanId={item.id}
                        namaDokumen={item.nama_dokumen}
                        initialLampiran={uploaded}
                        onUploaded={(lamp) => handleUploaded(item.id, lamp)}
                        onRemoved={() => handleRemoved(item.id)}
                      />
                    ) : (
                      <FileUploadButton
                        kelengkapanId={item.id}
                        namaDokumen={item.nama_dokumen}
                        onUploaded={(lamp) => handleUploaded(item.id, lamp)}
                      />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* User-Created Documents Section - always shown */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-700">
            {isNonMaterial ? 'Dokumen Pendukung' : 'Dokumen Tambahan Anda'}
          </p>
          {!showAddForm && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddForm(true)}
              className="gap-1 text-orange-700 hover:bg-orange-50 hover:text-orange-800"
            >
              <Plus size={14} />
              <span className="text-xs">Tambah Dokumen</span>
            </Button>
          )}
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div className="flex flex-col gap-2 rounded-2xl border border-orange-200 bg-orange-50/60 p-3 sm:flex-row sm:items-center">
            <Input
              value={newDocTitle}
              onChange={(e) => {
                setNewDocTitle(e.target.value)
                setUserDocError('')
              }}
              placeholder="Ketik judul dokumen..."
              className="flex-1 h-8 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addUserDoc()
                }
                if (e.key === 'Escape') {
                  setShowAddForm(false)
                  setNewDocTitle('')
                }
              }}
              autoFocus
            />
            <Button size="sm" onClick={addUserDoc} className="h-8">Tambah</Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Batal tambah dokumen pendukung"
              onClick={() => {
                setShowAddForm(false)
                setNewDocTitle('')
                setUserDocError('')
              }}
              className="h-8 w-8"
            >
              <X size={14} />
            </Button>
          </div>
        )}
        {userDocError && (
          <p className="text-xs text-error flex items-center gap-1">
            <AlertCircle size={12} /> {userDocError}
          </p>
        )}

        {/* User Documents List */}
        {userDocs.map(doc => {
          const uploaded = lampiranUrls.find(l => l.kelengkapan_id === doc.id)
          return (
            <div
              key={doc.id}
              className={cn(
                'flex min-w-0 flex-col gap-3 rounded-2xl border p-3.5 transition-colors sm:flex-row',
                uploaded
                  ? 'border-emerald-200 bg-emerald-50/60'
                  : 'border-orange-200 bg-orange-50/50'
              )}
            >
              <div className="shrink-0 mt-0.5">
                <User
                  size={14}
                  className={uploaded ? 'text-emerald-600' : 'text-orange-600'}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-bold text-zinc-950">{doc.nama_dokumen}</p>
                  <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">
                    TAMBAHAN ANDA
                  </span>
                </div>
                <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                  {uploaded ? (
                    <FileUploadButton
                      kelengkapanId={doc.id}
                      namaDokumen={doc.nama_dokumen}
                      initialLampiran={uploaded}
                      onUploaded={(lamp) => handleUploaded(doc.id, lamp)}
                      onRemoved={() => handleRemoved(doc.id)}
                    />
                  ) : (
                    <FileUploadButton
                      kelengkapanId={doc.id}
                      namaDokumen={doc.nama_dokumen}
                      onUploaded={(lamp) => handleUploaded(doc.id, lamp)}
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Hapus dokumen pendukung ${doc.nama_dokumen}`}
                    onClick={() => removeUserDoc(doc.id)}
                    className="text-error hover:text-error hover:bg-error/10"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}

        {userDocs.length === 0 && !showAddForm && (
          <p className="text-xs text-on-surface-variant italic">
            {isNonMaterial
              ? 'Klik "+ Tambah Dokumen" untuk menambahkan dokumen pendukung.'
              : 'Belum ada dokumen tambahan. Klik "+ Tambah Dokumen" untuk menambahkan.'}
          </p>
        )}
      </div>
    </div>
  )
}
