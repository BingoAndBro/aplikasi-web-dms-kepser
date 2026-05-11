/**
 * ============================================================================
 * ATTACHMENT EDITOR - Smart Component untuk Edit/Revisi/Resubmit
 * ============================================================================
 */

import { useState, useEffect, useRef } from 'react'
import { CheckCircle2, XCircle, Eye, Download, Upload, RotateCcw, X, Loader2, Plus, AlertCircle } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  buildStorageFilename,
  isStoragePathPending,
} from '#/lib/dokumen-helpers'
import { getSignedUrl, downloadWithSignedUrl, formatDateTime } from '#/lib/storage-client'
import { getBrowserClient } from '#/lib/supabase-browser'
import type { DokumenRow, LampiranUrl } from '#/lib/dokumen-helpers'
import { cn } from '#/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

export interface KelengkapanItem {
  id: string
  nama_dokumen: string
  required: boolean
}

interface PendingFile {
  url: string
  filename: string
}

interface AttachmentEditorProps {
  dokumen: DokumenRow
  lampiranUrls: LampiranUrl[]
  kelengkapan?: KelengkapanItem[]
  isNonMaterial?: boolean
  nominalValue?: number | null
  submitLabel: string
  extraActions?: React.ReactNode
  onSubmit: (data: {
    lampiranUrls: LampiranUrl[]
    nominalRealisasi: number | null
  }) => Promise<void> | void
  onCancel: () => void
  onDirtyChange?: (isDirty: boolean) => void
  confirmIfDirty?: (callback: () => void | Promise<void>) => void | Promise<void>
}

// ============================================================================
// KOMPONEN: AttachmentEditor
// ============================================================================
export function AttachmentEditor({
  dokumen,
  lampiranUrls: initialLampirans,
  kelengkapan = [],
  isNonMaterial = false,
  nominalValue,
  submitLabel,
  extraActions,
  onSubmit,
  onCancel,
  onDirtyChange,
  confirmIfDirty,
}: AttachmentEditorProps) {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const [lampiranUrls, setLampiranUrls] = useState<LampiranUrl[]>(initialLampirans)
  const [originalLampirans, setOriginalLampirans] = useState<LampiranUrl[]>(initialLampirans)
  const [pendingFiles, setPendingFiles] = useState<Map<string, PendingFile>>(new Map())
  const [userDocs, setUserDocs] = useState<{ id: string; nama: string; lamp?: LampiranUrl }[]>([])
  const [uploadStatuses, setUploadStatuses] = useState<Map<string, string>>(new Map()) // docId -> success message

  // Form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [newDocTitle, setNewDocTitle] = useState('')
  const [nominalRealisasi, setNominalRealisasi] = useState<string>('')
  const [nominalError, setNominalError] = useState<string>('')

  // Preview modal state
  const [previewingUrl, setPreviewingUrl] = useState<string | null>(null)
  const [previewFilename, setPreviewFilename] = useState<string>('')
  const [previewLoading, setPreviewLoading] = useState(false)

  // Submit/Cancel state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  // Refs for file inputs
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())

  // ---------------------------------------------------------------------------
  // Effect: Initialize
  // ---------------------------------------------------------------------------
  useEffect(() => {
    console.log('[AttachmentEditor] Mounted:', {
      lampiranCount: initialLampirans.length,
      kelengkapanCount: kelengkapan.length,
      isNonMaterial
    })

    if (!isNonMaterial && nominalValue !== undefined && nominalValue !== null) {
      const formatted = typeof nominalValue === 'number'
        ? nominalValue.toLocaleString('id-ID')
        : String(nominalValue || '').replace(/[^\d]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
      setNominalRealisasi(formatted)
    }

    const userCreated: { id: string; nama: string; lamp?: LampiranUrl }[] = []
    for (const lamp of initialLampirans) {
      if (lamp.kelengkapan_id.startsWith('user-custom-')) {
        userCreated.push({ id: lamp.kelengkapan_id, nama: lamp.nama, lamp })
      }
    }
    setUserDocs(userCreated)
    setLampiranUrls(initialLampirans)
    setOriginalLampirans(initialLampirans)
  }, [])

  useEffect(() => {
    setLampiranUrls(initialLampirans)
    setOriginalLampirans(initialLampirans)
  }, [initialLampirans])

  // ---------------------------------------------------------------------------
  // Effect: ESC to close preview
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && previewingUrl !== null) closePreview()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [previewingUrl])

  // ---------------------------------------------------------------------------
  // Helper: Get lampiran by docId
  // ---------------------------------------------------------------------------
  function getLampByDocId(docId: string): LampiranUrl | undefined {
    return lampiranUrls.find(l => l.kelengkapan_id === docId)
  }

  // ---------------------------------------------------------------------------
  // Handler: Preview (modal popup) - build filename client-side
  // ---------------------------------------------------------------------------
  async function handlePreview(docId: string) {
    const lamp = getLampByDocId(docId)
    if (!lamp?.url) return

    console.log('[AttachmentEditor] Preview:', { kelengkapan_id: lamp.kelengkapan_id, nama: lamp.nama, url: lamp.url })

    setPreviewingUrl(null)
    setPreviewLoading(true)

    try {
      const signedUrl = await getSignedUrl(lamp.url)
      if (!signedUrl) {
        alert('Gagal memuat pratinjau')
        closePreview()
        setPreviewLoading(false)
        return
      }

      // Build filename dari metadata dokumen (client-side)
      const filename = buildStorageFilename(dokumen, lamp)
      setPreviewingUrl(signedUrl)
      setPreviewFilename(filename)
    } catch {
      alert('Gagal memuat pratinjau')
      closePreview()
    } finally {
      setPreviewLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Handler: Close preview modal
  // ---------------------------------------------------------------------------
  function closePreview() {
    setPreviewingUrl(null)
    setPreviewFilename('')
  }

  // ---------------------------------------------------------------------------
  // Handler: Download - build filename client-side
  // ---------------------------------------------------------------------------
  async function handleDownload(docId: string) {
    const lamp = getLampByDocId(docId)
    if (!lamp?.url) return

    console.log('[AttachmentEditor] Download:', { kelengkapan_id: lamp.kelengkapan_id, nama: lamp.nama })

    try {
      const signedUrl = await getSignedUrl(lamp.url)
      if (!signedUrl) {
        alert('Gagal mengunduh file')
        return
      }

      // Build filename dari metadata dokumen (client-side)
      const filename = buildStorageFilename(dokumen, lamp)
      await downloadWithSignedUrl(signedUrl, filename)
    } catch {
      alert('Gagal mengunduh file')
    }
  }

  // ---------------------------------------------------------------------------
  // Handler: Reset file (undo upload/replace)
  // ---------------------------------------------------------------------------
  async function handleResetFile(docId: string) {
    const lamp = lampiranUrls.find(l => l.kelengkapan_id === docId)
    const pending = pendingFiles.get(docId)
    const isUserDoc = docId.startsWith('user-custom-')

    console.log('[AttachmentEditor] Reset file:', { docId, lamp, pending, isUserDoc })

    if (pending?.url) {
      const supabase = getBrowserClient()
      if (supabase) {
        console.log('[AttachmentEditor] Deleting uploaded file:', pending.url)
        await supabase.storage.from('dokumen-lampiran').remove([pending.url])
      }
    }

    if (isUserDoc) {
      const originalUserDoc = originalLampirans.find(l => l.kelengkapan_id === docId)
      if (originalUserDoc) {
        setUserDocs(prev => prev.map(d => d.id === docId ? { ...d, lamp: originalUserDoc } : d))
        setLampiranUrls(prev => {
          const idx = prev.findIndex(l => l.kelengkapan_id === docId)
          if (idx >= 0) {
            const updated = [...prev]
            updated[idx] = originalUserDoc
            return updated
          }
          return prev
        })
      } else {
        setUserDocs(prev => prev.filter(d => d.id !== docId))
        setLampiranUrls(prev => prev.filter(l => l.kelengkapan_id !== docId))
      }
    } else {
      const originalLamp = originalLampirans.find(l => l.kelengkapan_id === docId)
      if (originalLamp) {
        setLampiranUrls(prev => {
          const idx = prev.findIndex(l => l.kelengkapan_id === docId)
          if (idx >= 0) {
            const updated = [...prev]
            updated[idx] = originalLamp
            return updated
          }
          return prev
        })
      } else {
        setLampiranUrls(prev => prev.filter(l => l.kelengkapan_id !== docId))
      }
    }

    setPendingFiles(prev => {
      const next = new Map(prev)
      next.delete(docId)
      return next
    })
    setUploadStatuses(prev => {
      const next = new Map(prev)
      next.delete(docId)
      return next
    })
  }

  // ---------------------------------------------------------------------------
  // Handler: Upload file
  // ---------------------------------------------------------------------------
  async function handleFileChange(docId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    console.log('[AttachmentEditor] Upload:', { docId, filename: file.name })

    try {
      const supabase = getBrowserClient()
      if (!supabase) throw new Error('Supabase not initialized')

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeFilename}`

      const { data, error } = await supabase.storage
        .from('dokumen-lampiran')
        .upload(path, file, { cacheControl: '3600', upsert: false })

      if (error || !data) throw new Error(`Upload failed: ${error?.message}`)

      console.log('[AttachmentEditor] Upload success:', path)

      const kel = kelengkapan.find(k => k.id === docId)
      const doc = userDocs.find(d => d.id === docId)
      const lampName = kel?.nama_dokumen ?? doc?.nama ?? file.name

      const newLamp: LampiranUrl = {
        kelengkapan_id: docId,
        nama: lampName,
        url: path,
        uploaded_at: new Date().toISOString(),
      }

      setPendingFiles(prev => new Map(prev).set(docId, { url: path, filename: file.name }))

      setLampiranUrls(prev => {
        const idx = prev.findIndex(l => l.kelengkapan_id === docId)
        if (idx >= 0) {
          const updated = [...prev]
          updated[idx] = newLamp
          return updated
        }
        return [...prev, newLamp]
      })

      setUploadStatuses(prev => new Map(prev).set(docId, `${file.name} berhasil diupload`))

      if (docId.startsWith('user-custom-')) {
        const currentLamp = lampiranUrls.find(l => l.kelengkapan_id === docId)
        if (!currentLamp) {
          setUserDocs(prev => {
            if (prev.some(d => d.id === docId)) return prev
            return [...prev, { id: docId, nama: doc?.nama ?? file.name, lamp: newLamp }]
          })
        }
      }

    } catch (err) {
      console.error('[AttachmentEditor] Upload error:', err)
      alert('Gagal mengupload file')
    }
  }

  // ---------------------------------------------------------------------------
  // Handler: Add user document
  // ---------------------------------------------------------------------------
  function handleAddUserDoc() {
    if (!newDocTitle.trim()) return
    const docId = `user-custom-${crypto.randomUUID()}`
    console.log('[AttachmentEditor] Added user doc:', { id: docId, nama: newDocTitle.trim() })
    setUserDocs(prev => [...prev, { id: docId, nama: newDocTitle.trim() }])
    setNewDocTitle('')
    setShowAddForm(false)
  }

  // ---------------------------------------------------------------------------
  // Handler: Remove user document (only for docs WITHOUT uploaded file)
  // ---------------------------------------------------------------------------
  function handleRemoveUserDoc(docId: string) {
    const doc = userDocs.find(d => d.id === docId)
    const lamp = lampiranUrls.find(l => l.kelengkapan_id === docId)
    const pending = pendingFiles.get(docId)

    console.log('[AttachmentEditor] Removing user doc:', { docId, nama: doc?.nama, lamp, pending })

    // Only allow removal if no file has been uploaded
    if (lamp || pending) {
      console.log('[AttachmentEditor] Cannot remove: file exists, use Reset instead')
      return
    }

    setUserDocs(prev => prev.filter(d => d.id !== docId))
    setLampiranUrls(prev => prev.filter(l => l.kelengkapan_id !== docId))
    setPendingFiles(prev => {
      const next = new Map(prev)
      next.delete(docId)
      return next
    })
    setUploadStatuses(prev => {
      const next = new Map(prev)
      next.delete(docId)
      return next
    })
  }

  // ---------------------------------------------------------------------------
  // Handler: Nominal change
  // ---------------------------------------------------------------------------
  function handleNominalChange(value: string) {
    const raw = value.replace(/[^\d]/g, '')
    const num = parseInt(raw, 10)
    setNominalRealisasi(raw ? num.toLocaleString('id-ID') : '')
    setNominalError('')
  }

  // ---------------------------------------------------------------------------
  // Handler: Reset nominal
  // ---------------------------------------------------------------------------
  function handleResetNominal() {
    if (nominalValue !== undefined && nominalValue !== null) {
      const formatted = typeof nominalValue === 'number'
        ? nominalValue.toLocaleString('id-ID')
        : ''
      setNominalRealisasi(formatted)
    } else {
      setNominalRealisasi('')
    }
    setNominalError('')
  }

  // ---------------------------------------------------------------------------
  // Handler: Cancel
  // ---------------------------------------------------------------------------
  async function handleCancel() {
    console.log('[AttachmentEditor] Cancel:', { hasFileChanges, hasNominalChanged, hasUserDocChanges })

    const proceedCancel = async () => {
      setIsCancelling(true)

      try {
        if (hasFileChanges) {
          const supabase = getBrowserClient()
          if (supabase) {
            console.log('[AttachmentEditor] Cleaning up pending files...')
            for (const [, pending] of pendingFiles) {
              if (pending?.url) {
                console.log('[AttachmentEditor] Deleting:', pending.url)
                await supabase.storage.from('dokumen-lampiran').remove([pending.url])
              }
            }
          }
        }

        setPendingFiles(new Map())
        onCancel()
      } finally {
        setIsCancelling(false)
      }
    }

    if (confirmIfDirty) {
      await confirmIfDirty(proceedCancel)
      return
    }

    if (!hasUnsavedChanges) {
      onCancel()
      return
    }

    if (!confirm('Perubahan belum disimpan. Yakin ingin keluar?')) {
      return
    }

    await proceedCancel()
  }

  // ---------------------------------------------------------------------------
  // Handler: Submit
  // ---------------------------------------------------------------------------
  async function handleSubmit() {
    console.log('[AttachmentEditor] Submit requested')

    if (!isNonMaterial) {
      const rawNominal = nominalRealisasi.replace(/[^\d]/g, '')
      if (!rawNominal || rawNominal === '0') {
        setNominalError('Nominal Realisasi wajib diisi dan harus lebih dari 0')
        return
      }
    }

    setIsSubmitting(true)

    try {
      const finalLampirans = lampiranUrls.filter(l => {
        if (!l.kelengkapan_id.startsWith('user-custom-')) return true
        return userDocs.some(d => d.id === l.kelengkapan_id)
      })

      const nominalValueFinal = !isNonMaterial
        ? parseInt(nominalRealisasi.replace(/[^\d]/g, ''), 10) || null
        : null

      console.log('[AttachmentEditor] Submit:', { lampiranCount: finalLampirans.length, nominal: nominalValueFinal })

      await onSubmit({
        lampiranUrls: finalLampirans,
        nominalRealisasi: nominalValueFinal,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------
  const nominalValid = isNonMaterial || (
    nominalRealisasi.replace(/[^\d]/g, '') !== '' &&
    parseInt(nominalRealisasi.replace(/[^\d]/g, ''), 10) > 0
  )
  const canSubmit = lampiranUrls.length > 0 && nominalValid

  const originalNominalFormatted = nominalValue !== undefined && nominalValue !== null
    ? (typeof nominalValue === 'number' ? nominalValue.toLocaleString('id-ID') : String(nominalValue ?? '').replace(/[^\d]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.'))
    : ''
  const hasNominalChanged = nominalRealisasi !== originalNominalFormatted
  const originalUserDocSignature = originalLampirans
    .filter(l => l.kelengkapan_id.startsWith('user-custom-'))
    .map(l => `${l.kelengkapan_id}:${l.nama}`)
    .sort()
    .join('|')
  const currentUserDocSignature = userDocs
    .map(d => `${d.id}:${d.nama}`)
    .sort()
    .join('|')
  const hasFileChanges = pendingFiles.size > 0
  const hasUserDocChanges = currentUserDocSignature !== originalUserDocSignature
  const hasUnsavedChanges = hasFileChanges || hasNominalChanged || hasUserDocChanges

  const requiredItems = kelengkapan.filter(k => k.required)
  const uploadedIds = new Set(lampiranUrls.map(l => l.kelengkapan_id))
  const missingRequired = requiredItems.filter(r => !uploadedIds.has(r.id))

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges)
  }, [hasUnsavedChanges, onDirtyChange])

  // ---------------------------------------------------------------------------
  // Render: Preview Modal
  // ---------------------------------------------------------------------------
  return (
    <>
      {previewingUrl !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={e => { if (e.target === e.currentTarget) closePreview() }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl flex flex-col max-h-[70vh]">
            <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
              <CheckCircle2 size={16} className="text-primary shrink-0" />
              <p className="text-sm font-semibold text-on-surface truncate flex-1">{previewFilename}</p>
              <span className="text-[10px] text-outline hidden sm:block">ESC</span>
              <button onClick={closePreview} className="w-7 h-7 rounded-full hover:bg-surface-container-low flex items-center justify-center">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-surface-container-low/30">
              {previewLoading ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 size={22} className="animate-spin text-primary" />
                </div>
              ) : previewingUrl ? (
                <iframe src={previewingUrl} className="w-full h-[calc(70vh-96px)] border-0" title={previewFilename} />
              ) : (
                <div className="flex items-center justify-center h-48">
                  <p className="text-sm text-on-surface-variant">Gagal memuat pratinjau.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* ========== NOMINAL REALISASI ========== */}
        {!isNonMaterial && (
          <div className={cn(
            'bg-white rounded-xl border p-5 shadow-sm transition-colors',
            hasNominalChanged ? 'border-amber-400 bg-amber-50/30' : 'border-outline-variant/30'
          )}>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-on-surface mb-1.5">
                  Nominal Realisasi (Rp) <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  value={nominalRealisasi}
                  onChange={e => handleNominalChange(e.target.value)}
                  placeholder="Contoh: 1.500.000"
                  className={cn(
                    'w-full px-3 py-2 border rounded-lg text-sm bg-surface text-on-surface',
                    'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
                    'placeholder:text-outline',
                    hasNominalChanged ? 'border-amber-400' : 'border-border'
                  )}
                />
                {nominalError && (
                  <p className="text-[10px] text-error mt-1 flex items-center gap-1">
                    <AlertCircle size={12} /> {nominalError}
                  </p>
                )}
              </div>
              {hasNominalChanged && (
                <button
                  onClick={handleResetNominal}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors shrink-0 mt-5"
                >
                  <RotateCcw size={14} />
                  Reset
                </button>
              )}
            </div>
          </div>
        )}

        {/* ========== KELENGKAPAN DOKUMEN ========== */}
        {/* Material documents: show kelengkapan from master + dokumen pendukung */}
        {/* Non-Material documents: only show empty dokumen pendukung section */}
        {!isNonMaterial && kelengkapan.length > 0 && (
          <div className="bg-white rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm">
            <div className="bg-surface-container-low/30 px-4 py-3 border-b border-outline-variant/30">
              <h3 className="text-sm font-semibold text-on-surface">Kelengkapan Dokumen</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">
                {requiredItems.length > 0
                  ? `${requiredItems.filter(r => uploadedIds.has(r.id)).length} dari ${requiredItems.length} lampiran wajib terunggah`
                  : 'Kelola kelengkapan dokumen'}
              </p>
            </div>
            <div className="p-4 space-y-3">
              {kelengkapan.map(kel => {
                const lamp = lampiranUrls.find(l => l.kelengkapan_id === kel.id)
                const isPending = pendingFiles.has(kel.id)
                const successMsg = uploadStatuses.get(kel.id)

                return (
                  <div key={kel.id} className="space-y-1.5">
                    <div className={cn(
                      'flex items-center gap-3 p-3 rounded-lg transition-colors',
                      isPending ? 'bg-amber-50 border border-amber-200' : 'bg-surface-container-low/20'
                    )}>
                      {/* Status icon */}
                      {isPending ? (
                        <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                      ) : lamp ? (
                        <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                      ) : kel.required ? (
                        <XCircle size={16} className="text-red-500 shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-outline shrink-0" />
                      )}

                      {/* Nama kelengkapan */}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-on-surface font-medium">{kel.nama_dokumen}</span>
                        {kel.required && <span className="text-red-500 ml-1">*</span>}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {lamp && (
                          <>
                            <Button size="icon-xs" variant="ghost" onClick={() => handlePreview(kel.id)} aria-label="Pratinjau">
                              <Eye size={14} />
                            </Button>
                            {isPending ? (
                              <button
                                onClick={() => handleResetFile(kel.id)}
                                className="inline-flex items-center gap-1 h-6 px-2 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded transition-colors"
                              >
                                <RotateCcw size={12} />
                                Reset
                              </button>
                            ) : (
                              <Button size="icon-xs" variant="ghost" onClick={() => handleDownload(kel.id)} aria-label="Unduh">
                                <Download size={14} />
                              </Button>
                            )}
                          </>
                        )}

                        <input
                          ref={el => { if (el) fileInputRefs.current.set(kel.id, el) }}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                          className="hidden"
                          onChange={e => handleFileChange(kel.id, e)}
                        />
                        <button
                          onClick={() => fileInputRefs.current.get(kel.id)?.click()}
                          className="inline-flex items-center gap-1 h-6 px-2 text-xs font-medium border border-border bg-background hover:bg-muted text-foreground rounded transition-colors"
                        >
                          <Upload size={12} />
                          {lamp ? 'Ganti' : 'Unggah'}
                        </button>
                      </div>
                    </div>

                    {/* Success message */}
                    {successMsg && (
                      <p className="text-xs text-green-600 pl-4 flex items-center gap-1">
                        <CheckCircle2 size={12} />
                        {successMsg}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ========== DOKUMEN PENDUKUNG ========== */}
        <div className="bg-white rounded-xl border border-blue-200 overflow-hidden shadow-sm">
          <div className="bg-blue-50/50 px-4 py-3 border-b border-blue-200">
            <h3 className="text-sm font-semibold text-blue-700">Dokumen Pendukung</h3>
            <p className="text-xs text-blue-600 mt-0.5">
              Tambahkan dokumen pendukung untuk melengkapi
            </p>
          </div>
          <div className="p-4 space-y-3">
            {userDocs.length === 0 && !showAddForm && (
              <div className="text-center py-4 text-on-surface-variant text-xs">
                Belum ada dokumen. Klik tombol di bawah untuk menambahkan.
              </div>
            )}

            {userDocs.map(doc => {
              const lamp = lampiranUrls.find(l => l.kelengkapan_id === doc.id)
              const isPending = pendingFiles.has(doc.id)
              const successMsg = uploadStatuses.get(doc.id)
              const hasFile = !!lamp

              return (
                <div key={doc.id} className="space-y-1.5">
                  <div className={cn(
                    'flex items-center gap-3 p-3 rounded-lg transition-colors',
                    isPending ? 'bg-amber-50 border border-amber-200' : hasFile ? 'bg-blue-50/50' : 'bg-blue-50/30'
                  )}>
                    {/* Status icon */}
                    {isPending ? (
                      <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                    ) : hasFile ? (
                      <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-blue-300 shrink-0" />
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{doc.nama}</span>
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium ml-2">TAMBAHAN</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {hasFile && (
                        <>
                          <Button size="icon-xs" variant="ghost" onClick={() => handlePreview(doc.id)} aria-label="Pratinjau">
                            <Eye size={14} />
                          </Button>
                          {isPending ? (
                            <button
                              onClick={() => handleResetFile(doc.id)}
                              className="inline-flex items-center gap-1 h-6 px-2 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded transition-colors"
                            >
                              <RotateCcw size={12} />
                              Reset
                            </button>
                          ) : (
                            <Button size="icon-xs" variant="ghost" onClick={() => handleDownload(doc.id)} aria-label="Unduh">
                              <Download size={14} />
                            </Button>
                          )}
                        </>
                      )}

                      <input
                        ref={el => { if (el) fileInputRefs.current.set(doc.id, el) }}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                        className="hidden"
                        onChange={e => handleFileChange(doc.id, e)}
                      />
                      <button
                        onClick={() => fileInputRefs.current.get(doc.id)?.click()}
                        className="inline-flex items-center gap-1 h-6 px-2 text-xs font-medium border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded transition-colors"
                      >
                        <Upload size={12} />
                        {hasFile ? 'Ganti' : 'Unggah'}
                      </button>

                      {/* X button - only if no file uploaded */}
                      {!hasFile && (
                        <button
                          onClick={() => handleRemoveUserDoc(doc.id)}
                          className="w-6 h-6 flex items-center justify-center text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Success message */}
                  {successMsg && (
                    <p className="text-xs text-green-600 pl-4 flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      {successMsg}
                    </p>
                  )}
                </div>
              )
            })}

            {/* Add form */}
            {showAddForm ? (
              <div className="flex items-center gap-2 p-3 bg-blue-50/30 rounded-lg">
                <input
                  type="text"
                  value={newDocTitle}
                  onChange={e => setNewDocTitle(e.target.value)}
                  placeholder="Nama dokumen (misal: Bukti Transfer)"
                  className="flex-1 h-8 px-3 text-sm border border-blue-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddUserDoc()
                    if (e.key === 'Escape') { setShowAddForm(false); setNewDocTitle('') }
                  }}
                  autoFocus
                />
                <Button size="sm" onClick={handleAddUserDoc} disabled={!newDocTitle.trim()}>Simpan</Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowAddForm(false); setNewDocTitle('') }}>Batal</Button>
              </div>
            ) : (
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-2 w-full p-3 rounded-lg border border-dashed border-blue-300 text-blue-600 hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
              >
                <Plus size={16} />
                <span className="text-sm font-medium">Tambah Dokumen</span>
              </button>
            )}
          </div>
        </div>

        {/* ========== ACTIONS ========== */}
        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" onClick={handleCancel} disabled={isCancelling}>
            {isCancelling ? <Loader2 size={14} className="animate-spin" /> : 'Batal'}
          </Button>
          {extraActions}
          <Button onClick={handleSubmit} disabled={isSubmitting || !canSubmit} className="gap-1.5">
            {isSubmitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CheckCircle2 size={14} />
            )}
            {submitLabel}
          </Button>
        </div>
      </div>
    </>
  )
}
