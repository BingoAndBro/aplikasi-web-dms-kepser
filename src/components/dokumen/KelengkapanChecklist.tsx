/**
 * KelengkapanChecklist — shows required/optional documents for a kegiatan + role.
 * Allows file upload per kelengkapan item.
 * For Non-Material: only shows user-created optional documents.
 * For Material: shows admin kelengkapan + user-created optional documents.
 */
import { useEffect, useState } from 'react'
import { FileText, AlertCircle, CheckCircle2, Plus, X, Trash2 } from 'lucide-react'
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

  const totalCount = items.length + userDocs.length
  const requiredReady = requiredCount === 0 || uploadedCount >= requiredCount
  const attachmentReady = requiredReady && lampiranUrls.length > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
            {isNonMaterial ? 'Dokumen Pendukung' : 'Dokumen Wajib'}
          </p>
        </div>
        <span className={cn(
          'rounded-lg border px-2.5 py-1.5 text-[9px] font-bold',
          attachmentReady
            ? 'border-emerald-200 text-emerald-700'
            : 'border-[#F6C768] text-[#C55A00]',
        )}>
          {lampiranUrls.length}/{Math.max(totalCount, 1)} diunggah
        </span>
      </div>

      {!isNonMaterial && items.length > 0 && (
        <div className="space-y-3">
          {items.map(item => {
            const uploaded = lampiranUrls.find(l => l.kelengkapan_id === item.id)
            return (
              <div
                key={item.id}
                className={cn(
                  'flex min-w-0 flex-col gap-3 rounded-2xl border px-4 py-4 transition-colors sm:flex-row sm:items-center',
                  uploaded
                    ? 'border-emerald-200 bg-white'
                    : 'border-stone-200 bg-white',
                )}
              >
                <div className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-xl',
                  uploaded ? 'bg-emerald-50 text-emerald-600' : 'bg-stone-100 text-stone-400',
                )}>
                  {uploaded ? <CheckCircle2 size={18} /> : <FileText size={18} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-stone-900">{item.nama_dokumen}</p>
                    <span className={item.required
                      ? 'rounded bg-[#FFF0F0] px-1.5 py-0.5 text-[8px] font-semibold text-rose-600'
                      : 'rounded bg-stone-100 px-1.5 py-0.5 text-[8px] font-semibold text-stone-500'
                    }>
                      {item.required ? 'WAJIB' : 'OPSIONAL'}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                    Format PDF
                  </p>
                </div>
                <FileUploadButton
                  kelengkapanId={item.id}
                  namaDokumen={item.nama_dokumen}
                  initialLampiran={uploaded}
                  onUploaded={(lamp) => handleUploaded(item.id, lamp)}
                  onRemoved={() => handleRemoved(item.id)}
                  className="shrink-0"
                />
              </div>
            )
          })}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
              {isNonMaterial ? 'Dokumen Tambahan' : 'Dokumen Opsional'}
            </p>
          </div>
          {!showAddForm && userDocs.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddForm(true)}
              className="gap-1 text-[#B45309] hover:bg-[#FFF3D6] hover:text-[#92400E]"
            >
              <Plus size={13} /> Tambah
            </Button>
          )}
        </div>

        {showAddForm && (
          <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-[#F6C768] bg-white p-4 sm:flex-row sm:items-center">
            <Input
              value={newDocTitle}
              onChange={(e) => {
                setNewDocTitle(e.target.value)
                setUserDocError('')
              }}
              placeholder="Nama dokumen..."
              className="h-10 flex-1 border-[#F6C768] bg-white text-sm"
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
            <Button size="sm" onClick={addUserDoc} className="h-10 bg-[#F97316] px-5 font-bold uppercase tracking-wide text-white hover:bg-[#EA580C]">
              Tambah
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Batal tambah dokumen pendukung"
              onClick={() => {
                setShowAddForm(false)
                setNewDocTitle('')
                setUserDocError('')
              }}
              className="h-9 w-9"
            >
              <X size={14} />
            </Button>
          </div>
        )}
        {userDocError && (
          <p className="flex items-center gap-1 text-xs text-error">
            <AlertCircle size={12} /> {userDocError}
          </p>
        )}

        {userDocs.map(doc => {
          const uploaded = lampiranUrls.find(l => l.kelengkapan_id === doc.id)
          return (
            <div
              key={doc.id}
              className={cn(
                'flex min-w-0 flex-col gap-3 rounded-2xl border px-4 py-4 transition-colors sm:flex-row sm:items-center',
                uploaded ? 'border-emerald-200 bg-white' : 'border-stone-200 bg-white',
              )}
            >
              <div className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-xl',
                uploaded ? 'bg-emerald-50 text-emerald-600' : 'bg-stone-100 text-stone-400',
              )}>
                {uploaded ? <CheckCircle2 size={15} /> : <FileText size={15} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-stone-900">{doc.nama_dokumen}</p>
                <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                  PDF, Word, atau Excel
                </p>
              </div>
              <FileUploadButton
                kelengkapanId={doc.id}
                namaDokumen={doc.nama_dokumen}
                initialLampiran={uploaded}
                onUploaded={(lamp) => handleUploaded(doc.id, lamp)}
                onRemoved={() => handleRemoved(doc.id)}
                className="shrink-0"
              />
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Hapus dokumen pendukung ${doc.nama_dokumen}`}
                onClick={() => removeUserDoc(doc.id)}
                className="shrink-0 text-stone-400 hover:bg-red-50 hover:text-error"
              >
                <Trash2 size={14} />
              </Button>
            </div>
          )
        })}

        {userDocs.length === 0 && !showAddForm && (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#F0E1D5] bg-[#FFFAF6] px-3 py-3 text-[10px] font-semibold text-stone-500 transition hover:border-[#F6C768] hover:bg-[#FFF8E8] hover:text-[#B45309]"
          >
            <Plus size={14} /> Tambah Dokumen Opsional
          </button>
        )}
      </div>
    </div>
  )
}
