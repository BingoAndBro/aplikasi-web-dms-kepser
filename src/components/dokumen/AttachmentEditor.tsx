/**
 * ============================================================================
 * ATTACHMENT EDITOR - Smart Component untuk Edit/Revisi/Resubmit
 * ============================================================================
 */

import { useState, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, XCircle, Eye, Download, Upload, RotateCcw, X, Loader2, Plus, AlertCircle } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { buildStorageFilename } from '#/lib/dokumen-helpers'
import { getSignedUrl, downloadWithSignedUrl } from '#/lib/storage-client'
import type { DokumenRow, LampiranUrl } from '#/lib/dokumen-helpers'
import { cn } from '#/lib/utils'
import { createClientId } from '#/lib/utils/client-id'
import { logDev, warnDev } from '#/lib/dev-logger'
import {
  DUPLICATE_ADDITIONAL_KELENGKAPAN_ERROR,
  findDuplicateAdditionalKelengkapanName,
  normalizeKelengkapanName,
} from '#/lib/kelengkapan-validation'
import {
  addPendingUploadUrl,
  collectUnreferencedPendingUploadUrls,
  removePendingUploadUrls,
  replaceLampiranByKelengkapanId,
  resetLampiranByKelengkapanId,
} from '#/lib/storage/pending-upload-session'

const ACCEPTED_ATTACHMENT_FILE_TYPES = '.pdf,.doc,.docx,.xls,.xlsx'
const PENDING_CLEANUP_ENDPOINT = '/api/upload?cleanup=pending'
const PENDING_CLEANUP_TIMEOUT_MS = 10_000

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

type UploadResponse = {
  url?: unknown
  nama?: unknown
  kelengkapan_id?: unknown
  uploaded_at?: unknown
  error?: unknown
}

function ResetActionButton({
  onClick,
  className,
}: {
  onClick: () => void | Promise<void>
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={() => { void onClick() }}
      className={cn(
        'inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-orange-100 px-2.5 text-[11px] font-semibold text-[#E65100] transition-colors hover:bg-orange-200',
        className,
      )}
    >
      <RotateCcw size={12} />
      Reset
    </button>
  )
}

function FileActionButton({
  onClick,
  children,
  ariaLabel,
}: {
  onClick: () => void | Promise<void>
  children: ReactNode
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      onClick={() => { void onClick() }}
      aria-label={ariaLabel}
      className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[#F0E1D5] bg-white text-zinc-700 shadow-sm shadow-zinc-950/5 transition-colors hover:border-orange-200 hover:bg-[#FFF7F0] hover:text-[#FF5A00]"
    >
      {children}
    </button>
  )
}

function UploadReplaceButton({
  hasFile,
  onClick,
}: {
  hasFile: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-[#FF5A00] bg-white px-3 text-xs font-semibold text-[#FF5A00] transition-colors hover:bg-[#FFF1E7]"
    >
      <Upload size={13} />
      {hasFile ? 'Ganti' : 'Unggah'}
    </button>
  )
}

interface AttachmentEditorProps {
  dokumen: DokumenRow
  lampiranUrls: LampiranUrl[]
  kelengkapan?: KelengkapanItem[]
  isNonMaterial?: boolean
  nominalValue?: number | null
  submitLabel: string
  extraActions?: ReactNode
  hideDefaultActions?: boolean
  submitRequestSignal?: number
  cancelRequestSignal?: number
  onSubmit: (data: {
    lampiranUrls: LampiranUrl[]
    nominalRealisasi: number | null
  }) => Promise<void> | void
  confirmBeforeSubmit?: (data: {
    lampiranUrls: LampiranUrl[]
    nominalRealisasi: number | null
    hasUnsavedChanges: boolean
  }) => Promise<boolean> | boolean
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
  hideDefaultActions = false,
  submitRequestSignal,
  cancelRequestSignal,
  onSubmit,
  confirmBeforeSubmit,
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
  const [sessionPendingUrls, setSessionPendingUrls] = useState<Set<string>>(new Set())
  const [userDocs, setUserDocs] = useState<{ id: string; nama: string; lamp?: LampiranUrl }[]>([])
  const [uploadStatuses, setUploadStatuses] = useState<Map<string, string>>(new Map()) // docId -> success message

  // Form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [newDocTitle, setNewDocTitle] = useState('')
  const [userDocError, setUserDocError] = useState('')
  const [nominalRealisasi, setNominalRealisasi] = useState<string>('')
  const [nominalError, setNominalError] = useState<string>('')

  // Preview modal state
  const [previewingUrl, setPreviewingUrl] = useState<string | null>(null)
  const [previewingDocId, setPreviewingDocId] = useState<string | null>(null)
  const [previewFilename, setPreviewFilename] = useState<string>('')
  const [previewLoading, setPreviewLoading] = useState(false)

  // Submit/Cancel state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  // Refs for file inputs
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const lampiranUrlsRef = useRef<LampiranUrl[]>(initialLampirans)
  const pendingFilesRef = useRef<Map<string, PendingFile>>(new Map())
  const sessionPendingUrlsRef = useRef<Set<string>>(new Set())
  const lastSubmitRequestSignalRef = useRef(submitRequestSignal)
  const lastCancelRequestSignalRef = useRef(cancelRequestSignal)

  // ---------------------------------------------------------------------------
  // Effect: Initialize
  // ---------------------------------------------------------------------------
  useEffect(() => {
    logDev('[AttachmentEditor] Mounted', {
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
    setTrackedLampiranUrls(initialLampirans)
    setOriginalLampirans(initialLampirans)
  }, [])

  useEffect(() => {
    setTrackedLampiranUrls(initialLampirans)
    setOriginalLampirans(initialLampirans)
  }, [initialLampirans])

  useEffect(() => {
    pendingFilesRef.current = pendingFiles
  }, [pendingFiles])

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

  function setTrackedLampiranUrls(nextLampirans: LampiranUrl[]): void {
    lampiranUrlsRef.current = nextLampirans
    setLampiranUrls(nextLampirans)
  }

  function updatePendingFiles(
    updater: (currentPendingFiles: Map<string, PendingFile>) => Map<string, PendingFile>,
  ): void {
    const nextPendingFiles = updater(pendingFilesRef.current)
    pendingFilesRef.current = nextPendingFiles
    setPendingFiles(nextPendingFiles)
  }

  function setTrackedSessionPendingUrls(nextPendingUrls: Set<string>): void {
    sessionPendingUrlsRef.current = nextPendingUrls
    setSessionPendingUrls(nextPendingUrls)
  }

  function trackSessionPendingUrl(url: string): void {
    setTrackedSessionPendingUrls(addPendingUploadUrl(sessionPendingUrlsRef.current, url))
  }

  function clearSessionPendingTracking(): void {
    setTrackedSessionPendingUrls(new Set())
  }

  async function cleanupTrackedPendingUrls(urls: string[], context: string): Promise<boolean> {
    const trackedUrls = [...new Set(urls)].filter(url => sessionPendingUrlsRef.current.has(url))
    if (trackedUrls.length === 0) return true

    const success = await cleanupPendingUrls(trackedUrls, context)
    if (success) {
      setTrackedSessionPendingUrls(removePendingUploadUrls(sessionPendingUrlsRef.current, trackedUrls))
    }

    return success
  }

  async function cleanupUnreferencedSessionPendingUrls(
    nextLampirans: LampiranUrl[],
    context: string,
  ): Promise<boolean> {
    return cleanupTrackedPendingUrls(
      collectUnreferencedPendingUploadUrls(sessionPendingUrlsRef.current, nextLampirans),
      context,
    )
  }

  async function cleanupPendingUrls(urls: string[], context: string): Promise<boolean> {
    const uniqueUrls = [...new Set(urls.filter(Boolean))]
    if (uniqueUrls.length === 0) return true

    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), PENDING_CLEANUP_TIMEOUT_MS)

    try {
      const response = await fetch(PENDING_CLEANUP_ENDPOINT, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: uniqueUrls }),
        signal: controller.signal,
      })

      if (!response.ok) {
        warnDev('[AttachmentEditor] Pending cleanup request failed', { context, status: response.status })
        return false
      }

      const json = await response.json().catch(() => null) as { success?: unknown } | null
      const success = json?.success === true
      if (!success) {
        warnDev('[AttachmentEditor] Pending cleanup completed with errors', { context })
      }
      return success
    } catch (error) {
      warnDev('[AttachmentEditor] Pending cleanup error', {
        context,
        message: error instanceof Error ? error.message : 'unknown',
      })
      return false
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  // ---------------------------------------------------------------------------
  // Handler: Preview (modal popup) - build filename client-side
  // ---------------------------------------------------------------------------
  async function handlePreview(docId: string) {
    const lamp = getLampByDocId(docId)
    if (!lamp?.url) return

    logDev('[AttachmentEditor] Preview', { docId, nama: lamp.nama })

    setPreviewingUrl(null)
    setPreviewingDocId(docId)
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
    setPreviewingDocId(null)
    setPreviewFilename('')
  }

  // ---------------------------------------------------------------------------
  // Handler: Download - build filename client-side
  // ---------------------------------------------------------------------------
  async function handleDownload(docId: string) {
    const lamp = getLampByDocId(docId)
    if (!lamp?.url) return

    logDev('[AttachmentEditor] Download', { docId, nama: lamp.nama })

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
    const lamp = lampiranUrlsRef.current.find(l => l.kelengkapan_id === docId)
    const pending = pendingFilesRef.current.get(docId)
    const isUserDoc = docId.startsWith('user-custom-')

    logDev('[AttachmentEditor] Reset file', { docId, isUserDoc, hasPending: !!pending, hasLamp: !!lamp })

    const originalLamp = originalLampirans.find(l => l.kelengkapan_id === docId)
    const nextLampirans = resetLampiranByKelengkapanId({
      lampiranUrls: lampiranUrlsRef.current,
      kelengkapanId: docId,
      originalLampiran: originalLamp,
    })

    setTrackedLampiranUrls(nextLampirans)

    if (isUserDoc) {
      if (originalLamp) {
        setUserDocs(prev => prev.map(d => d.id === docId ? { ...d, lamp: originalLamp } : d))
      } else {
        setUserDocs(prev => prev.filter(d => d.id !== docId))
      }
    }

    updatePendingFiles(prev => {
      const next = new Map(prev)
      next.delete(docId)
      return next
    })
    setUploadStatuses(prev => {
      const next = new Map(prev)
      next.delete(docId)
      return next
    })

    const pendingUrlsToCleanup = collectUnreferencedPendingUploadUrls(sessionPendingUrlsRef.current, nextLampirans)
    if (pendingUrlsToCleanup.length > 0) {
      logDev('[AttachmentEditor] Cleanup unreferenced pending uploads after reset', {
        docId,
        count: pendingUrlsToCleanup.length,
      })
      await cleanupTrackedPendingUrls(pendingUrlsToCleanup, 'reset')
    }
  }

  // ---------------------------------------------------------------------------
  // Handler: Upload file
  // ---------------------------------------------------------------------------
  async function handleFileChange(docId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    logDev('[AttachmentEditor] Upload', { docId, filename: file.name })

    try {
      const previousPendingUrl = pendingFilesRef.current.get(docId)?.url
      const kel = kelengkapan.find(k => k.id === docId)
      const doc = userDocs.find(d => d.id === docId)
      const lampName = kel?.nama_dokumen ?? doc?.nama ?? file.name
      const formData = new FormData()
      formData.append('file', file)
      formData.append('kelengkapan_id', docId)
      formData.append('nama_dokumen', lampName)

      const response = await fetch('/api/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      const json = await response.json().catch(() => ({})) as UploadResponse

      if (!response.ok) {
        throw new Error(typeof json.error === 'string' ? json.error : 'Upload failed')
      }

      if (
        typeof json.url !== 'string'
        || typeof json.nama !== 'string'
        || typeof json.kelengkapan_id !== 'string'
        || typeof json.uploaded_at !== 'string'
      ) {
        throw new Error('Invalid upload response')
      }

      const newLamp: LampiranUrl = {
        kelengkapan_id: json.kelengkapan_id,
        nama: json.nama,
        url: json.url,
        uploaded_at: json.uploaded_at,
      }

      logDev('[AttachmentEditor] Upload success', { docId, path: json.url })

      trackSessionPendingUrl(json.url)
      updatePendingFiles(prev => new Map(prev).set(docId, { url: json.url, filename: file.name }))
      const nextLampirans = replaceLampiranByKelengkapanId(lampiranUrlsRef.current, newLamp)
      setTrackedLampiranUrls(nextLampirans)

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

      if (previousPendingUrl && previousPendingUrl !== json.url && !nextLampirans.some(lampiran => lampiran.url === previousPendingUrl)) {
        logDev('[AttachmentEditor] Cleanup superseded pending upload', { docId })
        await cleanupTrackedPendingUrls([previousPendingUrl], 'superseded-replace')
      }
    } catch (err) {
      warnDev('[AttachmentEditor] Upload error', {
        docId,
        message: err instanceof Error ? err.message : 'unknown',
      })
      alert(err instanceof Error && err.message ? err.message : 'Gagal mengupload file')
    }
  }

  // ---------------------------------------------------------------------------
  // Handler: Add user document
  // ---------------------------------------------------------------------------
  function handleAddUserDoc() {
    const trimmedTitle = newDocTitle.trim()
    if (!trimmedTitle) return

    const normalizedTitle = normalizeKelengkapanName(trimmedTitle)
    const duplicate = userDocs.some(doc => normalizeKelengkapanName(doc.nama) === normalizedTitle)
    if (duplicate) {
      setUserDocError(`${DUPLICATE_ADDITIONAL_KELENGKAPAN_ERROR}: "${trimmedTitle}"`)
      return
    }

    const docId = createClientId('user-custom')
    logDev('[AttachmentEditor] Added user doc', { docId, nama: trimmedTitle })
    setUserDocs(prev => [...prev, { id: docId, nama: trimmedTitle }])
    setNewDocTitle('')
    setUserDocError('')
    setShowAddForm(false)
  }

  // ---------------------------------------------------------------------------
  // Handler: Remove user document (only for docs WITHOUT uploaded file)
  // ---------------------------------------------------------------------------
  function handleRemoveUserDoc(docId: string) {
    const doc = userDocs.find(d => d.id === docId)
    const lamp = lampiranUrls.find(l => l.kelengkapan_id === docId)
    const pending = pendingFiles.get(docId)

    logDev('[AttachmentEditor] Removing user doc', { docId, nama: doc?.nama, hasLamp: !!lamp, hasPending: !!pending })

    // Only allow removal if no file has been uploaded
    if (lamp || pending) {
      warnDev('[AttachmentEditor] Cannot remove because file exists', { docId })
      return
    }

    setUserDocs(prev => prev.filter(d => d.id !== docId))
    setTrackedLampiranUrls(lampiranUrlsRef.current.filter(l => l.kelengkapan_id !== docId))
    updatePendingFiles(prev => {
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
    logDev('[AttachmentEditor] Cancel', { hasFileChanges, hasNominalChanged, hasUserDocChanges })

    const proceedCancel = async () => {
      setIsCancelling(true)

      try {
        if (hasFileChanges) {
          const pendingUrls = [...sessionPendingUrlsRef.current]
          logDev('[AttachmentEditor] Cleaning up pending files', { count: pendingUrls.length })
          await cleanupPendingUrls(pendingUrls, 'cancel')
        }

        updatePendingFiles(() => new Map())
        clearSessionPendingTracking()
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

    await proceedCancel()
  }

  // ---------------------------------------------------------------------------
  // Handler: Submit
  // ---------------------------------------------------------------------------
  async function handleSubmit() {
    logDev('[AttachmentEditor] Submit requested', { isNonMaterial })

    if (!isNonMaterial) {
      const rawNominal = nominalRealisasi.replace(/[^\d]/g, '')
      if (!rawNominal || rawNominal === '0') {
        setNominalError('Nominal Realisasi wajib diisi dan harus lebih dari 0')
        return
      }
    }

    if (!canSubmit) return

    setIsSubmitting(true)

    try {
      const finalLampirans = lampiranUrlsRef.current.filter(l => {
        if (!l.kelengkapan_id.startsWith('user-custom-')) return true
        return userDocs.some(d => d.id === l.kelengkapan_id)
      })
      const duplicateName = findDuplicateAdditionalKelengkapanName(finalLampirans)
      if (duplicateName) {
        setUserDocError(`${DUPLICATE_ADDITIONAL_KELENGKAPAN_ERROR}: "${duplicateName}"`)
        await cleanupUnreferencedSessionPendingUrls(finalLampirans, 'submit-validation-failed')
        return
      }

      const nominalValueFinal = !isNonMaterial
        ? parseInt(nominalRealisasi.replace(/[^\d]/g, ''), 10) || null
        : null

      if (confirmBeforeSubmit) {
        const confirmed = await confirmBeforeSubmit({
          lampiranUrls: finalLampirans,
          nominalRealisasi: nominalValueFinal,
          hasUnsavedChanges,
        })

        if (!confirmed) return
      }

      await cleanupUnreferencedSessionPendingUrls(finalLampirans, 'submit-before-persist')

      logDev('[AttachmentEditor] Submit', { lampiranCount: finalLampirans.length, nominal: nominalValueFinal })

      await onSubmit({
        lampiranUrls: finalLampirans,
        nominalRealisasi: nominalValueFinal,
      })

      await cleanupUnreferencedSessionPendingUrls(finalLampirans, 'submit-success')
      updatePendingFiles(() => new Map())
      clearSessionPendingTracking()
    } catch (error) {
      await cleanupUnreferencedSessionPendingUrls(lampiranUrlsRef.current, 'submit-failed')
      throw error
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    if (submitRequestSignal === undefined) return
    if (lastSubmitRequestSignalRef.current === submitRequestSignal) return

    lastSubmitRequestSignalRef.current = submitRequestSignal
    void handleSubmit()
  }, [submitRequestSignal])

  useEffect(() => {
    if (cancelRequestSignal === undefined) return
    if (lastCancelRequestSignalRef.current === cancelRequestSignal) return

    lastCancelRequestSignalRef.current = cancelRequestSignal
    void handleCancel()
  }, [cancelRequestSignal])

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
  const hasFileChanges = pendingFiles.size > 0 || sessionPendingUrls.size > 0
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
      {previewingDocId !== null && createPortal((
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4"
          onClick={e => { if (e.target === e.currentTarget) closePreview() }}
        >
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />
          <div
            className="relative z-10 flex h-[calc(100dvh-1rem)] max-h-[90dvh] w-full max-w-[92vw] flex-col overflow-hidden rounded-2xl bg-zinc-950 shadow-2xl ring-1 ring-white/10 sm:h-[88vh] sm:max-w-[88vw]"
            role="dialog"
            aria-modal="true"
            aria-label="Pratinjau lampiran"
          >
            <div className="flex min-h-12 shrink-0 items-center gap-3 border-b border-white/10 bg-zinc-950 px-3 py-2 text-white sm:px-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-5 text-white">
                  {previewFilename || 'Pratinjau lampiran'}
                </p>
                <p className="hidden text-[11px] leading-4 text-zinc-400 sm:block">Mode pratinjau dokumen</p>
              </div>
              <button
                type="button"
                onClick={() => { if (previewingDocId) void handleDownload(previewingDocId) }}
                disabled={!previewingDocId}
                aria-label={`Unduh ${previewFilename || 'lampiran'}`}
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-200 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:bg-transparent"
              >
                <Download size={17} />
              </button>
              <span className="hidden text-[10px] font-semibold uppercase tracking-wide text-zinc-500 sm:block">ESC</span>
              <button
                type="button"
                onClick={closePreview}
                aria-label="Tutup pratinjau"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-200 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-zinc-900 p-2 sm:p-4">
              {previewLoading ? (
                <div className="flex h-full min-h-60 w-full items-center justify-center">
                  <Loader2 size={26} className="animate-spin text-white" />
                </div>
              ) : previewingUrl ? (
                <iframe
                  src={previewingUrl}
                  className="h-full min-h-[60vh] w-full max-w-6xl border-0 bg-white shadow-2xl shadow-black/40"
                  title={previewFilename}
                />
              ) : (
                <div className="flex h-full min-h-60 w-full items-center justify-center rounded-xl bg-zinc-950/60 px-4 text-center">
                  <p className="text-sm text-zinc-300">Gagal memuat pratinjau.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ), document.body)}

      <div className="space-y-2.5">
        {/* ========== NOMINAL REALISASI ========== */}
        {!isNonMaterial && (
          <div className={cn(
            'rounded-xl border bg-[#FFFAF6] p-3 transition-colors',
            hasNominalChanged ? 'border-orange-300 bg-orange-50/20' : 'border-[#F0E1D5]'
          )}>
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-semibold text-on-surface">
                  Nominal Realisasi (Rp) <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  value={nominalRealisasi}
                  onChange={e => handleNominalChange(e.target.value)}
                  placeholder="Contoh: 1.500.000"
                  className={cn(
                    'w-full rounded-lg border bg-surface px-3 py-1.5 text-sm text-on-surface',
                    'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
                    'placeholder:text-outline',
                    hasNominalChanged ? 'border-orange-300' : 'border-border'
                  )}
                />
                {nominalError && (
                  <p className="text-[10px] text-error mt-1 flex items-center gap-1">
                    <AlertCircle size={12} /> {nominalError}
                  </p>
                )}
              </div>
              {hasNominalChanged && (
                <ResetActionButton onClick={handleResetNominal} />
              )}
            </div>
          </div>
        )}

        {/* ========== KELENGKAPAN DOKUMEN ========== */}
        {/* Material documents: show kelengkapan from master + dokumen pendukung */}
        {/* Non-Material documents: only show empty dokumen pendukung section */}
        {!isNonMaterial && kelengkapan.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-[#F0E1D5] bg-[#FFFAF6]">
            <div className="border-b border-[#F0E1D5] px-3.5 py-2.5">
              <h3 className="text-[13px] font-semibold text-on-surface">Kelengkapan Dokumen</h3>
              <p className="mt-0.5 text-[11px] text-on-surface-variant">
                {requiredItems.length > 0
                  ? `${requiredItems.filter(r => uploadedIds.has(r.id)).length} dari ${requiredItems.length} lampiran wajib terunggah`
                : 'Kelola kelengkapan dokumen'}
              </p>
            </div>
            <div className="space-y-2 p-2.5">
              {kelengkapan.map(kel => {
                const lamp = lampiranUrls.find(l => l.kelengkapan_id === kel.id)
                const isPending = pendingFiles.has(kel.id)
                const successMsg = uploadStatuses.get(kel.id)

                return (
                  <div key={kel.id} className="space-y-1.5">
                    <div className={cn(
                      'flex flex-col gap-2 rounded-xl border px-2.5 py-2 transition-colors sm:flex-row sm:items-center',
                      isPending ? 'border-orange-200 bg-orange-50/30' : 'border-[#F4E7DC] bg-[#FFFCF8]'
                    )}>
                      {/* Status icon */}
                      {isPending ? (
                        <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                      ) : lamp ? (
                        <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                      ) : kel.required ? (
                        <XCircle size={14} className="text-red-500 shrink-0" />
                      ) : (
                        <div className="size-3.5 shrink-0 rounded-full border border-outline" />
                      )}

                      {/* Nama kelengkapan */}
                      <div className="min-w-0 flex-1">
                        <span className="text-[13px] text-on-surface font-medium">{kel.nama_dokumen}</span>
                        {kel.required && <span className="text-red-500 ml-1">*</span>}
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        {lamp && (
                          <>
                            <FileActionButton onClick={() => handlePreview(kel.id)} ariaLabel={`Pratinjau ${kel.nama_dokumen}`}>
                              <Eye size={13} />
                            </FileActionButton>
                            {isPending ? (
                              <ResetActionButton onClick={() => handleResetFile(kel.id)} />
                            ) : (
                              <FileActionButton onClick={() => handleDownload(kel.id)} ariaLabel={`Unduh ${kel.nama_dokumen}`}>
                                <Download size={13} />
                              </FileActionButton>
                            )}
                          </>
                        )}

                        <input
                          ref={el => { if (el) fileInputRefs.current.set(kel.id, el) }}
                          type="file"
                          accept={ACCEPTED_ATTACHMENT_FILE_TYPES}
                          className="hidden"
                          onChange={e => handleFileChange(kel.id, e)}
                        />
                        <UploadReplaceButton
                          hasFile={!!lamp}
                          onClick={() => fileInputRefs.current.get(kel.id)?.click()}
                        />
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
        <div className="overflow-hidden rounded-xl border border-orange-200 bg-[#FFFAF6]">
          <div className="border-b border-orange-100 px-3.5 py-2.5">
            <h3 className="text-[13px] font-semibold text-[#FF5A00]">Dokumen Pendukung</h3>
            <p className="mt-0.5 text-[11px] text-[#FF5A00]">
              Tambahkan dokumen pendukung untuk melengkapi
            </p>
          </div>
          <div className="space-y-2.5 p-2.5">
            {userDocs.length === 0 && !showAddForm && (
              <div className="py-1.5 text-center text-[11px] text-on-surface-variant">
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
                    'flex flex-col gap-2 rounded-xl border px-2.5 py-2 transition-colors sm:flex-row sm:items-center',
                    isPending ? 'border-orange-200 bg-orange-50/30' : hasFile ? 'border-orange-100 bg-[#FFF7F0]' : 'border-[#F4E7DC] bg-[#FFFCF8]'
                  )}>
                    {/* Status icon */}
                    {isPending ? (
                      <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                    ) : hasFile ? (
                      <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                    ) : (
                      <div className="size-3.5 shrink-0 rounded-full border-2 border-orange-200" />
                    )}

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <span className="text-[13px] font-medium">{doc.nama}</span>
                      <span className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-[#E65100]">TAMBAHAN</span>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {hasFile && (
                        <>
                          <FileActionButton onClick={() => handlePreview(doc.id)} ariaLabel={`Pratinjau ${doc.nama}`}>
                            <Eye size={13} />
                          </FileActionButton>
                          {isPending ? (
                            <ResetActionButton onClick={() => handleResetFile(doc.id)} />
                          ) : (
                            <FileActionButton onClick={() => handleDownload(doc.id)} ariaLabel={`Unduh ${doc.nama}`}>
                              <Download size={13} />
                            </FileActionButton>
                          )}
                        </>
                      )}

                      <input
                        ref={el => { if (el) fileInputRefs.current.set(doc.id, el) }}
                        type="file"
                        accept={ACCEPTED_ATTACHMENT_FILE_TYPES}
                        className="hidden"
                        onChange={e => handleFileChange(doc.id, e)}
                      />
                      <UploadReplaceButton
                        hasFile={hasFile}
                        onClick={() => fileInputRefs.current.get(doc.id)?.click()}
                      />

                      {/* X button - only if no file uploaded */}
                      {!hasFile && (
                        <button
                          type="button"
                          aria-label={`Hapus dokumen pendukung ${doc.nama}`}
                          onClick={() => handleRemoveUserDoc(doc.id)}
                          className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
                        >
                          <X size={13} />
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
              <div className="flex flex-col gap-2 rounded-xl border border-orange-100 bg-[#FFF7F0] p-2.5 sm:flex-row sm:items-center">
                <input
                  type="text"
                  value={newDocTitle}
                  onChange={e => {
                    setNewDocTitle(e.target.value)
                    setUserDocError('')
                  }}
                  placeholder="Nama dokumen (misal: Bukti Transfer)"
                  className="h-8 flex-1 rounded-lg border border-orange-200 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#FF5A00]"
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddUserDoc()
                    if (e.key === 'Escape') { setShowAddForm(false); setNewDocTitle('') }
                  }}
                  autoFocus
                />
                <Button size="sm" onClick={handleAddUserDoc} disabled={!newDocTitle.trim()}>Simpan</Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowAddForm(false); setNewDocTitle(''); setUserDocError('') }}>Batal</Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-orange-300 bg-[#FFFCF8] p-3 text-[#FF5A00] transition-colors hover:border-[#FF5A00] hover:bg-[#FFF1E7]"
              >
                <Plus size={14} />
                <span className="text-[13px] font-semibold">Tambah Dokumen Pendukung</span>
              </button>
            )}
            {userDocError && (
              <p className="text-xs text-error flex items-center gap-1">
                <AlertCircle size={12} /> {userDocError}
              </p>
            )}
          </div>
        </div>

        {/* ========== ACTIONS ========== */}
        {!hideDefaultActions && (
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
        )}
      </div>
    </>
  )
}
