/**
 * ============================================================================
 * ATTACHMENT VIEWER - Komponen Reusable untuk Menampilkan Kelengkapan Dokumen
 * ============================================================================
 *
 * Komponen ini menampilkan daftar kelengkapan dokumen dengan:
 * - Header: "Kelengkapan Dokumen (N)"
 * - Ikon centang hijau jika file sudah diupload, ikon X merah jika belum
 * - Nama kelengkapan sesuai dengan master kelengkapan atau user-created
 * - Preview dan Download untuk file yang sudah ada
 * - Mode Edit dengan tombol Delete/Replace/Upload jika isEditable=true
 *
 * PROPS:
 * - dokumen: Metadata dokumen lengkap (untuk formal filename)
 * - lampiranUrls: Array lampiran dari dokumen
 * - isEditable: true = mode edit/revisi dengan tombol aksi, false = mode view (default: false)
 * - onDelete: Callback saat hapus lampiran (opsional)
 * - onReplace: Callback saat ganti file (opsional)
 * - onUpload: Callback saat upload file baru (opsional)
 * - onRefresh: Callback untuk merefresh data setelah perubahan
 * ============================================================================
 */

import { useState, useEffect } from 'react'
import { CheckCircle2, XCircle, Eye, Download, Upload, Trash2, X, Loader2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  downloadFromApi,
  fetchFileBlobWithSignedUrl,
  formatDateTime,
  getSignedUrlFromApi,
} from '#/lib/storage-client'
import { buildStorageFilename } from '#/lib/dokumen-helpers'
import type { DokumenRow, LampiranUrl } from '#/lib/dokumen-helpers'
import { cn } from '#/lib/utils'

// ============================================================================
// INTERFACE: Props untuk AttachmentViewer
// ============================================================================
export type ViewerApiType = 'default' | 'ppk' | 'bendahara'

export interface KelengkapanItem {
  id: string
  nama_dokumen: string
  required: boolean
}

interface AttachmentViewerProps {
  /** Metadata dokumen lengkap */
  dokumen: DokumenRow
  /** Array lampiran */
  lampiranUrls: LampiranUrl[]
  /** Kelengkapan from master (for grouping). If provided, user-created docs will be separated */
  kelengkapan?: KelengkapanItem[]
  /** true = mode edit/revisi dengan tombol aksi, false = mode view */
  isEditable?: boolean
  /** Tipe API yang digunakan untuk preview/download */
  apiType?: ViewerApiType
  /** Callback saat hapus lampiran berdasarkan index */
  onDelete?: (index: number) => void
  /** Callback saat replace file */
  onReplace?: (index: number, file: File) => void
  /** Callback saat upload file baru */
  onUpload?: (index: number, file: File) => void
  /** Callback untuk merefresh data setelah perubahan */
  onRefresh?: () => void
}

// ============================================================================
// KOMPONEN: AttachmentViewer
// ============================================================================
export function AttachmentViewer({
  dokumen,
  lampiranUrls,
  kelengkapan,
  isEditable = false,
  apiType = 'default',
  onDelete,
  onReplace,
  onUpload,
  onRefresh,
}: AttachmentViewerProps) {
  // State untuk preview modal
  const [previewingIdx, setPreviewingIdx] = useState<number | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFilename, setPreviewFilename] = useState<string>('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // ==========================================================================
  // EFFECT: Handle keyboard shortcut ESC untuk menutup preview
  // ==========================================================================
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && previewingIdx !== null) {
        closePreview()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [previewingIdx])

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  // ==========================================================================
  // HELPER: Filter lampiran based on kelengkapan
  // ==========================================================================
  const isUserCreated = (kelengkapanId: string) => kelengkapanId.startsWith('user-custom-')

  // Admin kelengkapan (kelengkapan from master)
  const adminLampirans = kelengkapan
    ? lampiranUrls.filter(lamp => !isUserCreated(lamp.kelengkapan_id))
    : lampiranUrls.filter(lamp => !isUserCreated(lamp.kelengkapan_id))

  // User-created documents (dokumen pendukung)
  const userLampirans = lampiranUrls.filter(lamp => isUserCreated(lamp.kelengkapan_id))

  const hasUserDocs = userLampirans.length > 0
  const hasAdminDocs = adminLampirans.length > 0

  // ==========================================================================
  // Helper: Get API path based on apiType
  // ==========================================================================
  function getPreviewApiPath(idx: number): string {
    switch (apiType) {
      case 'ppk':
        return `/api/ppk/dokumen/${dokumen.id}/preview/${idx}`
      case 'bendahara':
        return `/api/bendahara/dokumen/${dokumen.id}/preview/${idx}`
      default:
        return `/api/dokumen/${dokumen.id}/preview/${idx}`
    }
  }

  function getDownloadApiPath(idx: number): string {
    switch (apiType) {
      case 'ppk':
        return `/api/ppk/dokumen/${dokumen.id}/download/${idx}`
      case 'bendahara':
        return `/api/bendahara/dokumen/${dokumen.id}/download/${idx}`
      default:
        return `/api/dokumen/${dokumen.id}/download/${idx}`
    }
  }

  // ==========================================================================
  // FUNGSI: handlePreview - Membuka preview file (build filename client-side)
  // ==========================================================================
  async function handlePreview(idx: number) {
    const lamp = lampiranUrls[idx]
    if (!lamp) return

    setPreviewingIdx(idx)
    clearPreviewUrl()
    setPreviewLoading(true)
    setPreviewError(null)

    try {
      const apiPath = getPreviewApiPath(idx)
      const signedUrlResult = await getSignedUrlFromApi(apiPath)
      if (signedUrlResult.error) {
        setPreviewError(signedUrlResult.error)
        setPreviewLoading(false)
        return
      }
      const signedUrl = signedUrlResult.signedUrl

      if (!signedUrl) {
        setPreviewError('Gagal memuat pratinjau')
        setPreviewLoading(false)
        return
      }

      const previewFile = await fetchFileBlobWithSignedUrl(signedUrl)
      if (previewFile.error || !previewFile.blob) {
        setPreviewError(previewFile.error ?? 'Gagal memuat pratinjau')
        setPreviewLoading(false)
        return
      }

      // Build filename dari metadata dokumen (client-side)
      const filename = buildStorageFilename(dokumen, lamp)

      setPreviewUrl(URL.createObjectURL(previewFile.blob))
      setPreviewFilename(filename)
    } catch {
      setPreviewError('Terjadi kesalahan')
    } finally {
      setPreviewLoading(false)
    }
  }

  // ==========================================================================
  // FUNGSI: handleDownload - Mengunduh file (build filename client-side)
  // ==========================================================================
  async function handleDownload(idx: number) {
    const lamp = lampiranUrls[idx]
    if (!lamp) return

    // Build filename dari metadata dokumen (client-side)
    const filename = buildStorageFilename(dokumen, lamp)
    const apiPath = getDownloadApiPath(idx)

    try {
      const result = await downloadFromApi(apiPath, filename)
      if (result.error) alert(result.error)
    } catch {
      alert('Gagal mengunduh file')
    }
  }

  // ==========================================================================
  // FUNGSI: closePreview - Menutup modal preview
  // ==========================================================================
  function closePreview() {
    setPreviewingIdx(null)
    clearPreviewUrl()
    setPreviewFilename('')
    setPreviewError(null)
  }

  function clearPreviewUrl() {
    setPreviewUrl(current => {
      if (current?.startsWith('blob:')) URL.revokeObjectURL(current)
      return null
    })
  }

  // ==========================================================================
  // FUNGSI: handleDelete - Menghapus lampiran
  // ==========================================================================
  function handleDelete(idx: number) {
    if (confirm('Yakin ingin menghapus lampiran ini?')) {
      onDelete?.(idx)
    }
  }

  // ==========================================================================
  // FUNGSI: handleFileChange - Handle file selection untuk replace/upload
  // ==========================================================================
  function handleFileChange(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (lampiranUrls[idx]?.url) {
      // Ada file lama - replace
      onReplace?.(idx, file)
    } else {
      // Tidak ada file lama - upload baru
      onUpload?.(idx, file)
    }

    // Reset input
    e.target.value = ''
  }

  // Helper function to render a single lampiran item
  // globalIdx is the index in the original lampiranUrls array (for callbacks)
  // labelColor: 'gray' for admin, 'blue' for user docs
  // showBadge: show "TAMBAHAN" badge for user docs
  function renderLampiranItem(lamp: LampiranUrl, globalIdx: number, labelColor: 'gray' | 'blue', showBadge: boolean) {
    const hasFile = !!lamp.url

    return (
      <div
        key={globalIdx}
        className={cn(
          'flex items-center gap-3 p-3 rounded-lg',
          labelColor === 'blue' ? 'bg-blue-50/30' : 'bg-surface-container-low/20'
        )}
      >
        {/* Status Icon */}
        {hasFile ? (
          <CheckCircle2 size={16} className="text-green-600 shrink-0" />
        ) : (
          <XCircle size={16} className="text-red-500 shrink-0" />
        )}

        {/* Nama Kelengkapan */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={cn('text-xs font-medium truncate', labelColor === 'blue' ? 'text-blue-700' : 'text-on-surface')}>
              {lamp.nama || 'Tanpa Nama'}
            </p>
            {showBadge && (
              <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">TAMBAHAN</span>
            )}
          </div>
          {hasFile && (
            <p className={cn('text-[10px]', labelColor === 'blue' ? 'text-blue-600' : 'text-outline')}>
              {formatDateTime(lamp.uploaded_at)}
            </p>
          )}
        </div>

        {/* Action Buttons - Common (hanya jika ada file) */}
        {hasFile && (
          <>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => handlePreview(globalIdx)}
              aria-label={`Pratinjau ${lamp.nama || `lampiran ${globalIdx + 1}`}`}
            >
              <Eye size={14} />
            </Button>

            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => handleDownload(globalIdx)}
              aria-label={`Unduh ${lamp.nama || `lampiran ${globalIdx + 1}`}`}
            >
              <Download size={14} />
            </Button>
          </>
        )}

        {/* Action Buttons - Editable Mode */}
        {isEditable && (
          <>
            {hasFile && (
              <Button
                size="icon-xs"
                variant="ghost"
                className="text-error hover:bg-error/10"
                onClick={() => handleDelete(globalIdx)}
                aria-label={`Hapus ${lamp.nama || `lampiran ${globalIdx + 1}`}`}
              >
                <Trash2 size={14} />
              </Button>
            )}

            <label className="cursor-pointer">
              <input
                type="file"
                className="hidden"
                onChange={e => handleFileChange(globalIdx, e)}
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
              />
              <span className={cn(
                'inline-flex items-center gap-1 h-6 px-2 rounded-[min(var(--radius-md),10px)] text-xs font-medium border',
                labelColor === 'blue'
                  ? 'border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700'
                  : 'border-border bg-background hover:bg-muted text-foreground'
              )}>
                <Upload size={12} />
                {hasFile ? 'Ganti' : 'Unggah'}
              </span>
            </label>
          </>
        )}
      </div>
    )
  }

  // ==========================================================================
  // RENDER: Empty state
  // ==========================================================================
  if (lampiranUrls.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
        <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">Kelengkapan Dokumen (0)</p>
        <p className="text-xs text-center py-4 text-on-surface-variant">
          Belum ada kelengkapan.
        </p>
      </div>
    )
  }

  // ==========================================================================
  // RENDER: Two sections (admin + user docs) or single section
  // ==========================================================================
  return (
    <>
      {/* Preview Modal */}
      {previewingIdx !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={e => { if (e.target === e.currentTarget) closePreview() }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl flex flex-col max-h-[70vh]">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
              <CheckCircle2 size={16} className="text-primary shrink-0" />
              <p className="text-sm font-semibold text-on-surface truncate flex-1">
                {previewFilename}
              </p>
              <span className="text-[10px] text-outline hidden sm:block">ESC</span>
              <button
                onClick={closePreview}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full hover:bg-surface-container-low"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto bg-surface-container-low/30">
              {previewLoading ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 size={22} className="animate-spin text-primary" />
                </div>
              ) : previewUrl ? (
                <iframe
                  src={previewUrl}
                  className="w-full h-[calc(70vh-96px)] border-0"
                  title={previewFilename}
                />
              ) : (
                <div className="flex items-center justify-center h-48">
                  {previewError ? (
                    <p className="text-sm text-error">{previewError}</p>
                  ) : (
                    <p className="text-sm text-on-surface-variant">Gagal memuat pratinjau.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-4">
        {/* Section 1: Admin Kelengkapan (Kelengkapan Dokumen) */}
        {hasAdminDocs && (
          <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
            <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">
              Kelengkapan Dokumen ({adminLampirans.length})
            </p>
            <div className="space-y-2">
              {adminLampirans.map((lamp) => {
                const globalIdx = lampiranUrls.indexOf(lamp)
                return renderLampiranItem(lamp, globalIdx, 'gray', false)
              })}
            </div>
          </div>
        )}

        {/* Section 2: User-Created Documents (Dokumen Pendukung) */}
        {hasUserDocs && (
          <div className="bg-white rounded-xl border border-blue-200 overflow-hidden shadow-sm">
            <div className="bg-blue-50/50 px-4 py-3 border-b border-blue-200">
              <h3 className="text-sm font-semibold text-blue-700">Dokumen Pendukung</h3>
              <p className="text-xs text-blue-600 mt-0.5">
                {userLampirans.length} dokumen tambahan
              </p>
            </div>
            <div className="p-4 space-y-2">
              {userLampirans.map((lamp) => {
                const globalIdx = lampiranUrls.indexOf(lamp)
                return renderLampiranItem(lamp, globalIdx, 'blue', true)
              })}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
