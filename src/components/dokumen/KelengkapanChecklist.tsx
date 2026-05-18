/**
 * KelengkapanChecklist — shows required/optional documents for a kegiatan + role.
 * Allows file upload per kelengkapan item.
 * For Non-Material: only shows user-created optional documents.
 * For Material: shows admin kelengkapan + user-created optional documents.
 */
import { useEffect, useState } from 'react'
import { FileText, AlertCircle, Plus, X, User, Trash2 } from 'lucide-react'
import { cn } from '#/lib/utils'
import { apiFetch } from '#/lib/api-client'
import { FileUploadButton } from './FileUploadButton'
import type { LampiranUrl } from '#/lib/dokumen-helpers'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'

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
    if (!newDocTitle.trim()) return
    const id = `user-custom-${crypto.randomUUID()}`
    setUserDocs(prev => [...prev, { id, nama_dokumen: newDocTitle.trim() }])
    setNewDocTitle('')
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

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between text-xs text-on-surface-variant">
        <span>
          {lampiranUrls.length} dari {items.length + userDocs.length} dokumen diunggah
          {requiredCount > 0 && (
            <span className="ml-1">
              ({uploadedCount}/{requiredCount} wajib)
            </span>
          )}
          {userDocs.length > 0 && (
            <span className="ml-1 text-blue-600">
              ({userUploadedCount}/{userDocs.length} tambahan)
            </span>
          )}
        </span>
        {requiredCount > 0 && uploadedCount < requiredCount && (
          <span className="flex items-center gap-1 text-amber-600">
            <AlertCircle size={12} />
            {requiredCount - uploadedCount} wajib belum diunggah
          </span>
        )}
      </div>

      {/* Admin Kelengkapan */}
      {!isNonMaterial && items.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
            Kelengkapan Admin
          </p>
          {items.map(item => {
            const uploaded = lampiranUrls.find(l => l.kelengkapan_id === item.id)
            return (
              <div
                key={item.id}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border transition-colors',
                  uploaded
                    ? 'border-green-200 bg-green-50/50'
                    : item.required
                      ? 'border-amber-200 bg-amber-50/30'
                      : 'border-border bg-background'
                )}
              >
                <div className="shrink-0 mt-0.5">
                  <FileText
                    size={14}
                    className={cn(
                      uploaded ? 'text-green-500' : item.required ? 'text-amber-500' : 'text-outline'
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-medium text-on-surface">{item.nama_dokumen}</p>
                    {item.required && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                        WAJIB
                      </span>
                    )}
                    {!item.required && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
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
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
            {isNonMaterial ? 'Dokumen Pendukung' : 'Dokumen Tambahan Anda'}
          </p>
          {!showAddForm && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddForm(true)}
              className="gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
            >
              <Plus size={14} />
              <span className="text-xs">Tambah Dokumen</span>
            </Button>
          )}
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div className="flex items-center gap-2 p-3 border border-blue-200 bg-blue-50/30 rounded-lg">
            <Input
              value={newDocTitle}
              onChange={(e) => setNewDocTitle(e.target.value)}
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
              onClick={() => {
                setShowAddForm(false)
                setNewDocTitle('')
              }}
              className="h-8 w-8"
            >
              <X size={14} />
            </Button>
          </div>
        )}

        {/* User Documents List */}
        {userDocs.map(doc => {
          const uploaded = lampiranUrls.find(l => l.kelengkapan_id === doc.id)
          return (
            <div
              key={doc.id}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border transition-colors',
                uploaded
                  ? 'border-green-200 bg-green-50/50'
                  : 'border-blue-200 bg-blue-50/30'
              )}
            >
              <div className="shrink-0 mt-0.5">
                <User
                  size={14}
                  className={uploaded ? 'text-green-500' : 'text-blue-500'}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-medium text-on-surface">{doc.nama_dokumen}</p>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                    TAMBAHAN ANDA
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
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
