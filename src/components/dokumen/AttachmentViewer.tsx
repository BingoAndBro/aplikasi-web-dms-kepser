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
import { createPortal } from 'react-dom'
import { Eye, Download, Upload, Trash2, X, Loader2, FileText } from 'lucide-react'
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

  function getFileFormat(lamp: LampiranUrl): string {
    const source = lamp.nama || lamp.url || ''
    const clean = source.split('?')[0] ?? ''
    const extension = clean.includes('.') ? clean.split('.').pop() : ''
    return extension ? String(extension).toUpperCase() : 'File'
  }

  // Helper function to render a single lampiran item
  // globalIdx is the index in the original lampiranUrls array (for callbacks)
  // labelColor: 'gray' for admin, 'blue' for user docs
  // showBadge: show "TAMBAHAN" badge for user docs
  function renderLampiranItem(lamp: LampiranUrl, globalIdx: number, labelColor: 'gray' | 'blue', showBadge: boolean) {
    const hasFile = !!lamp.url
    const fileFormat = getFileFormat(lamp)

    return (
      <div
        key={globalIdx}
        className={cn(
          'flex min-h-16 items-center gap-3 rounded-2xl border border-[#F1E5DA] bg-[#FFFDF9] px-4 py-3',
          labelColor === 'blue'
            ? 'border-[#F1E5DA] bg-[#FFFDF9]'
            : 'border-[#F1E5DA] bg-[#FFFDF9]'
        )}
      >
        <span className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-2xl border',
          labelColor === 'blue'
            ? 'border-[#F1E5DA] bg-[#FFFDF9] text-zinc-800'
            : 'border-orange-100 bg-orange-50 text-[#FF5A00]',
        )}>
          <FileText size={18} />
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="truncate text-sm font-bold text-zinc-950">
              {lamp.nama || 'Tanpa Nama'}
            </p>
            {showBadge && (
              <span className="rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#FF5A00]">Tambahan</span>
            )}
          </div>
          <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
            {fileFormat}{labelColor === 'gray' ? ' - Wajib' : ''}
            {hasFile && lamp.uploaded_at ? ` - ${formatDateTime(lamp.uploaded_at)}` : ''}
          </p>
        </div>

        {hasFile && (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handlePreview(globalIdx)}
              className="h-8 gap-1.5 px-2 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-950 hover:bg-orange-50 hover:text-[#FF5A00]"
              aria-label={`Pratinjau ${lamp.nama || `lampiran ${globalIdx + 1}`}`}
            >
              <Eye size={15} />
              Preview
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDownload(globalIdx)}
              className="h-8 gap-1.5 px-2 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-950 hover:bg-orange-50 hover:text-[#FF5A00]"
              aria-label={`Unduh ${lamp.nama || `lampiran ${globalIdx + 1}`}`}
            >
              <Download size={15} />
              Unduh
            </Button>
          </div>
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
              <span className="inline-flex h-8 items-center gap-1 rounded-xl border border-orange-200 bg-[#FFFDF9] px-2 text-xs font-bold text-[#FF5A00] hover:bg-orange-50">
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
      <div className="rounded-[1.25rem] border border-[#F1E5DA] bg-[#FFFDF9] p-4 shadow-sm">
        <h2 className="font-headline text-base font-bold tracking-tight text-zinc-950 sm:text-lg">Lampiran & Kelengkapan Wajib</h2>
        <p className="mt-0.5 text-xs font-medium leading-relaxed text-zinc-700 sm:text-sm">
          Seluruh dokumen yang wajib dipenuhi sebagai prasyarat utama verifikasi dan pelunasan anggaran.
        </p>
        <p className="py-6 text-center text-xs font-medium text-zinc-500">
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
      {previewingIdx !== null && createPortal((
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
            {/* Header */}
            <div className="flex min-h-12 shrink-0 items-center gap-3 border-b border-white/10 bg-zinc-950 px-3 py-2 text-white sm:px-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-5 text-white">
                  {previewFilename || 'Pratinjau lampiran'}
                </p>
                <p className="hidden text-[11px] leading-4 text-zinc-400 sm:block">Mode pratinjau dokumen</p>
              </div>
              <button
                type="button"
                onClick={() => { if (previewingIdx !== null) void handleDownload(previewingIdx) }}
                disabled={previewingIdx === null}
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

            {/* Content */}
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-zinc-900 p-2 sm:p-4">
              {previewLoading ? (
                <div className="flex h-full min-h-60 w-full items-center justify-center">
                  <Loader2 size={26} className="animate-spin text-white" />
                </div>
              ) : previewUrl ? (
                <iframe
                  src={previewUrl}
                  className="h-full min-h-[60vh] w-full max-w-6xl border-0 bg-white shadow-2xl shadow-black/40"
                  title={previewFilename}
                />
              ) : (
                <div className="flex h-full min-h-60 w-full items-center justify-center rounded-xl bg-zinc-950/60 px-4 text-center">
                  {previewError ? (
                    <p className="text-sm font-medium text-red-300">{previewError}</p>
                  ) : (
                    <p className="text-sm text-zinc-300">Gagal memuat pratinjau.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ), document.body)}

      {/* Sections */}
      <div className="space-y-4">
        {/* Section 1: Admin Kelengkapan (Kelengkapan Dokumen) */}
        {hasAdminDocs && (
          <div>
            <div className="mb-3">
              <h2 className="font-headline text-base font-bold tracking-tight text-zinc-950 sm:text-lg">Lampiran & Kelengkapan Wajib</h2>
              <p className="mt-0.5 text-xs font-medium leading-relaxed text-zinc-700 sm:text-sm">
                Seluruh dokumen yang wajib dipenuhi sebagai prasyarat utama verifikasi dan pelunasan anggaran.
              </p>
            </div>
            <div className="space-y-2.5">
              {adminLampirans.map((lamp) => {
                const globalIdx = lampiranUrls.indexOf(lamp)
                return renderLampiranItem(lamp, globalIdx, 'gray', false)
              })}
            </div>
          </div>
        )}

        {/* Section 2: User-Created Documents (Dokumen Pendukung) */}
        {hasUserDocs && (
          <div>
            <div className="mb-3">
              <h2 className="font-headline text-base font-bold tracking-tight text-zinc-950 sm:text-lg">Dokumen Pendukung Tambahan</h2>
              <p className="mt-0.5 text-xs font-medium leading-relaxed text-zinc-700 sm:text-sm">
                Dokumen sekunder seperti lampiran surat pertanggungjawaban tambahan, kuitansi pendukung, dan bukti fisik kegiatan.
              </p>
            </div>
            <div className="space-y-2.5">
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
