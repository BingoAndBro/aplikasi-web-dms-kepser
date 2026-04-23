import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { Skeleton } from '#/components/ui/skeleton'
import { ActivityLog } from '#/components/dokumen/ActivityLog'
import {
  ArrowLeft,
  FileText,
  ChevronRight,
  Upload,
  Download,
  Eye,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  XCircle,
  X,
  Loader2,
  FileEdit,
} from 'lucide-react'
import { getBrowserClient } from '#/lib/supabase-browser'
import type { DokumenRow, LampiranUrl } from '#/lib/dokumen-helpers'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/pegawai/dokumen/$id/revisi')({
  component: DokumenRevisiPage,
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KelengkapanItem {
  id: string
  nama_dokumen: string
  required: boolean
}

// ---------------------------------------------------------------------------
// Workflow config
// ---------------------------------------------------------------------------

const WORKFLOW_STEPS = [
  { key: 'DRAFT', label: 'Draf' },
  { key: 'IN_PPK_VALIDATION', label: 'PPK' },
  { key: 'IN_BENDAHARA_APPROVAL', label: 'Bendahara' },
  { key: 'COMPLETED', label: 'Selesai' },
]

function getWorkflowIndex(status: string): number {
  if (status === 'NEED_REVISION') return -1
  return WORKFLOW_STEPS.findIndex(s => s.key === status)
}

function formatDate(str: string): string {
  try { return new Date(str).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return str }
}

// ---------------------------------------------------------------------------
// File upload helper
// ---------------------------------------------------------------------------

async function uploadFile(file: File): Promise<{ url: string }> {
  const supabase = getBrowserClient()
  if (!supabase) throw new Error('Supabase not initialized')

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeFilename}`

  const { data, error } = await supabase.storage
    .from('dokumen-lampiran')
    .upload(path, file, { cacheControl: '3600', upsert: false })

  if (error || !data) throw new Error(`Upload failed: ${error?.message ?? 'Unknown error'}`)
  return { url: path }
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function DokumenRevisiPage() {
  const { id } = Route.useParams()
  const [dok, setDok] = useState<DokumenRow | null>(null)
  const [kelengkapan, setKelengkapan] = useState<KelengkapanItem[]>([])
  const [lampiranUrls, setLampiranUrls] = useState<LampiranUrl[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)

  // Preview modal state
  const [previewingIdx, setPreviewingIdx] = useState<number | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFilename, setPreviewFilename] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => { fetchData() }, [id])

  // ESC to close preview
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && previewingIdx !== null) closePreview()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [previewingIdx])

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      const supabase = getBrowserClient()
      if (!supabase) { setError('Gagal menginisialisasi Supabase'); setLoading(false); return }

      const res = await fetch(`/api/dokumen/${id}`, { credentials: 'include' })
      if (!res.ok) {
        const json = await res.json()
        setError(json.error || `HTTP ${res.status}`)
        setLoading(false)
        return
      }
      const json = await res.json()
      const dokumen = json.dokumen as DokumenRow

      if (dokumen.status !== 'NEED_REVISION' || dokumen.revision_target !== 'USER') {
        setError('Dokumen ini tidak bisa direvisi')
        setLoading(false)
        return
      }

      setDok(dokumen)
      setLampiranUrls(dokumen.lampiran_urls as LampiranUrl[] ?? [])

      const { data: kelData } = await supabase
        .from('master_kelengkapan_dokumen')
        .select('id, nama_dokumen, required')
        .eq('kegiatan_id', dokumen.kegiatan_jenis_id)
        .eq('is_ketua_tim', dokumen.is_ketua_tim)

      if (kelData) setKelengkapan(kelData as KelengkapanItem[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  async function saveLampiran(kel: KelengkapanItem, file: File) {
    setUploadProgress(`Mengupload ${file.name}...`)
    try {
      const { url } = await uploadFile(file)

      // Build new lampiran list, using kelengkapan nama_dokumen as the name
      const newLamp: LampiranUrl = {
        kelengkapan_id: kel.id,
        nama: kel.nama_dokumen,
        url,
        uploaded_at: new Date().toISOString(),
      }
      const newLampiranUrls = [
        ...lampiranUrls.filter(l => l.kelengkapan_id !== kel.id),
        newLamp,
      ]

      // Save immediately to API (this also deletes the old file from storage)
      const patchRes = await fetch(`/api/dokumen/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lampiranUrls: newLampiranUrls }),
      })

      if (patchRes.ok) {
        setLampiranUrls(newLampiranUrls)
      } else {
        const errJson = await patchRes.json()
        console.error('Failed to save lampiran:', errJson.error)
        alert(`Gagal menyimpan: ${errJson.error ?? 'Terjadi kesalahan'}`)
      }
    } catch (err) {
      console.error('Upload error:', err)
      alert('Gagal mengupload file')
    } finally {
      setUploadProgress(null)
    }
  }

  async function handleSubmit() {
    if (!dok) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      const submitRes = await fetch(`/api/dokumen/${id}/submit`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!submitRes.ok) {
        const json = await submitRes.json()
        throw new Error(json.error || 'Gagal mengajukan ulang')
      }

      window.location.href = '/pegawai/dokumen'
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePreview(idx: number) {
    setPreviewingIdx(idx)
    setPreviewUrl(null)
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/dokumen/${id}/preview/${idx}`, { credentials: 'include' })
      const json = await res.json()
      if (json.signedUrl) {
        setPreviewUrl(json.signedUrl)
        const lamp = lampiranUrls[idx]
        setPreviewFilename(
          lamp ? kelengkapan.find(k => k.id === lamp.kelengkapan_id)?.nama_dokumen ?? 'Lampiran' : 'Lampiran'
        )
      }
    } catch { /* silent */ } finally {
      setPreviewLoading(false)
    }
  }

  async function handleDownload(idx: number) {
    try {
      const res = await fetch(`/api/dokumen/${id}/download/${idx}`, { credentials: 'include' })
      const json = await res.json()
      if (json.signedUrl) window.open(json.signedUrl, '_blank')
    } catch {
      alert('Gagal mengunduh')
    }
  }

  function closePreview() {
    setPreviewingIdx(null)
    setPreviewUrl(null)
    setPreviewFilename('')
  }

  // Check required lampiran
  const requiredItems = kelengkapan.filter(k => k.required)
  const uploadedIds = new Set(lampiranUrls.map(l => l.kelengkapan_id))
  const missingRequired = requiredItems.filter(r => !uploadedIds.has(r.id))
  const canSubmit = lampiranUrls.length > 0 && missingRequired.length === 0

  const workflowIdx = dok ? getWorkflowIndex(dok.status) : -1

  return (
    <PageLayout>
      {/* Preview Modal */}
      {previewingIdx !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) closePreview() }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl flex flex-col max-h-[70vh]">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant/30 shrink-0">
              <FileText size={16} className="text-primary shrink-0" />
              <p className="text-sm font-semibold text-on-surface truncate flex-1">{previewFilename}</p>
              <span className="text-[10px] text-outline hidden sm:block">ESC</span>
              <button onClick={closePreview} className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-surface-container-low transition-colors shrink-0">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-surface-container-low/30">
              {previewLoading ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 size={22} className="animate-spin text-primary" />
                </div>
              ) : previewUrl ? (
                <iframe src={previewUrl} className="w-full h-[calc(70vh-96px)] border-0" title={previewFilename} />
              ) : (
                <div className="flex items-center justify-center h-48">
                  <p className="text-sm text-on-surface-variant">Gagal memuat pratinjau.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6 max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest">
          <FileEdit size={12} />
          <Link to="/pegawai/dokumen" className="hover:text-primary">Dokumen</Link>
          <ChevronRight size={10} />
          <span className="text-primary">Revisi</span>
        </div>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-48" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 bg-error/5 rounded-2xl border border-error/20">
            <AlertCircle size={32} className="text-error" />
            <div className="text-center">
              <p className="font-headline text-base font-bold text-error">Tidak bisa merevisi</p>
              <p className="text-on-surface-variant text-xs mt-1">{error}</p>
            </div>
            <Link to="/pegawai/dokumen">
              <Button variant="outline" size="sm">Kembali ke Daftar</Button>
            </Link>
          </div>
        ) : dok ? (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="font-headline text-2xl font-extrabold text-on-surface">{dok.judul}</h1>
              </div>
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs font-semibold shrink-0">
                Revisi Dokumen
              </Badge>
            </div>

            {/* Workflow Timeline */}
            <div className="bg-white rounded-xl border border-outline-variant/30 p-4 shadow-sm">
              <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">Alur Dokumen</p>
              <div className="flex items-center gap-0">
                {WORKFLOW_STEPS.map((step, i) => {
                  const isCurrent = step.key === dok.status
                  const isPast = workflowIdx > i || dok.status === 'COMPLETED'
                  const showAsRevision = dok.status === 'NEED_REVISION' && step.key === 'IN_PPK_VALIDATION'
                  return (
                    <div key={step.key} className="flex flex-col items-center flex-1 relative">
                      {i < WORKFLOW_STEPS.length - 1 && (
                        <div className={cn('absolute top-4 -right-1/2 w-full h-0.5 z-0', isPast ? 'bg-primary' : 'bg-outline-variant')} />
                      )}
                      <div className={cn(
                        'relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors',
                        isCurrent || showAsRevision ? 'border-primary bg-primary text-white' :
                          isPast ? 'border-primary bg-primary text-white' :
                            'border-outline-variant bg-background text-outline'
                      )}>
                        {showAsRevision ? (
                          <AlertTriangle size={14} />
                        ) : isPast && !isCurrent ? (
                          <CheckCircle2 size={14} />
                        ) : (
                          i + 1
                        )}
                      </div>
                      <span className={cn(
                        'mt-2 text-[10px] font-medium text-center',
                        isCurrent || showAsRevision ? 'text-primary font-semibold' : isPast ? 'text-primary' : 'text-outline'
                      )}>
                        {step.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Revision notes banner */}
            {dok.revision_notes && (
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-amber-700 mb-1">Catatan dari Verifikator</p>
                  <p className="text-xs text-amber-700">{dok.revision_notes}</p>
                </div>
              </div>
            )}

            {/* Info Grid */}
            <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Fungsi</p>
                  <p className="text-sm font-semibold text-on-surface">{dok.fungsi_nama ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Kegiatan</p>
                  <p className="text-sm font-semibold text-on-surface">{dok.kegiatan_nama ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tahun</p>
                  <p className="text-sm font-semibold text-on-surface">{dok.tahun ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tanggal</p>
                  <p className="text-sm font-semibold text-on-surface">{dok.tanggal ? formatDate(dok.tanggal) : '—'}</p>
                </div>
              </div>
            </div>

            {/* Kelengkapan checklist */}
            <div className="bg-white rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm">
              <div className="bg-surface-container-low/30 px-4 py-3 border-b border-outline-variant/30">
                <h3 className="text-sm font-semibold text-on-surface">Kelengkapan Dokumen</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {kelengkapan.length > 0
                    ? `${requiredItems.filter(r => uploadedIds.has(r.id)).length} dari ${requiredItems.length} lampiran wajib terunggah`
                    : 'Memuat...'}
                </p>
              </div>
              <div className="p-4 space-y-3">
                {uploadProgress && (
                  <p className="text-xs text-primary animate-pulse">{uploadProgress}</p>
                )}
                {kelengkapan.map(kel => {
                  const lamp = lampiranUrls.find(l => l.kelengkapan_id === kel.id)
                  const isUploaded = !!lamp
                  const lampIdx = lampiranUrls.findIndex(l => l.kelengkapan_id === kel.id)
                  return (
                    <div key={kel.id} className="flex items-center gap-3 p-3 bg-surface-container-low/20 rounded-lg">
                      {isUploaded ? (
                        <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                      ) : kel.required ? (
                        <XCircle size={16} className="text-red-500 shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-outline shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-on-surface font-medium">{kel.nama_dokumen}</span>
                        {kel.required && <span className="text-red-500 ml-1">*</span>}
                      </div>
                      {isUploaded && (
                        <>
                          <Button size="icon-xs" variant="ghost" onClick={() => handlePreview(lampIdx)} aria-label="Pratinjau">
                            <Eye size={14} />
                          </Button>
                          <Button size="icon-xs" variant="ghost" onClick={() => handleDownload(lampIdx)} aria-label="Unduh">
                            <Download size={14} />
                          </Button>
                        </>
                      )}
                      <input
                        key={lamp ? `replace-${lamp.url}` : `upload-${kel.id}`}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                        className="hidden"
                        id={`upload-${kel.id}`}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          saveLampiran(kel, file)
                          e.target.value = ''
                        }}
                      />
                      <label htmlFor={`upload-${kel.id}`} className="cursor-pointer">
                        <span className="inline-flex items-center gap-1 h-6 px-2 rounded-[min(var(--radius-md),10px)] text-xs font-medium border border-border bg-background hover:bg-muted text-foreground">
                          <Upload size={12} />{isUploaded ? 'Ganti' : 'Unggah'}
                        </span>
                      </label>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Upload summary */}
            {lampiranUrls.length > 0 && (
              <div className="bg-surface-container-low/20 rounded-lg p-3">
                <p className="text-xs text-on-surface-variant">
                  {lampiranUrls.length} lampiran terunggah. Klik "Ganti" pada kolom di atas untuk mengganti file.
                </p>
              </div>
            )}

            {/* Submit error */}
            {submitError && (
              <div className="bg-error/10 border border-error/20 rounded-lg p-4 flex items-start gap-2">
                <AlertCircle size={16} className="text-error mt-0.5" />
                <p className="text-sm text-error">{submitError}</p>
              </div>
            )}

            {/* Submit button */}
            <div className="flex items-center justify-end gap-3">
              <Link to="/pegawai/dokumen">
                <Button variant="outline" disabled={submitting}>Batal</Button>
              </Link>
              <Button
                onClick={handleSubmit}
                disabled={submitting || !canSubmit}
                className="gap-1.5"
              >
                {submitting ? (
                  <><Loader2 size={14} className="animate-spin" />Mengajukan...</>
                ) : (
                  'Ajukan Ulang ke PPK'
                )}
              </Button>
            </div>

            {/* Activity Log */}
            <ActivityLog dokumenId={id} />
          </>
        ) : null}
      </div>
    </PageLayout>
  )
}