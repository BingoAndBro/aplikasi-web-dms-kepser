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
  User,
  Plus,
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
  isUserCreated?: boolean // For user-created documents
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

  // User-created documents for Non-Material
  const [userDocs, setUserDocs] = useState<KelengkapanItem[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newDocTitle, setNewDocTitle] = useState('')

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

      // Check if Non-Material document
      const isNonMaterial = dokumen.is_non_material === true ||
        (dokumen.is_non_material === undefined && !dokumen.jenis_permintaan_id && !dokumen.kategori_permintaan_id && !dokumen.detail_permintaan_id)

      // For Non-Material: skip kelengkapan fetch, use lampiran_urls directly
      if (isNonMaterial) {
        setKelengkapan([]) // No required kelengkapan
        // Extract user-created documents from lampiran_urls
        const userCreatedDocs: KelengkapanItem[] = (dokumen.lampiran_urls as LampiranUrl[] ?? [])
          .filter((l: LampiranUrl) => l.kelengkapan_id.startsWith('user-custom-'))
          .map((l: LampiranUrl) => ({
            id: l.kelengkapan_id,
            nama_dokumen: l.nama,
            required: false,
            isUserCreated: true,
          }))
        setUserDocs(userCreatedDocs)
        setLoading(false)
        return
      }

      // Build dynamic query — filter by chain from the dokumen's stored chain IDs.
      // Kelengkapan melekat ke leaf node: detail > kategori > jenis.
      // Dokumen lama (tanpa chain) fallback ke match by kegiatan + is_ketua_tim.
      let query = supabase
        .from('master_kelengkapan_dokumen')
        .select('id, nama_dokumen, required, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id')
        .eq('kegiatan_id', dokumen.kegiatan_jenis_id)
        .eq('is_ketua_tim', dokumen.is_ketua_tim)

      if (dokumen.detail_permintaan_id) {
        query = query.eq('detail_permintaan_id', dokumen.detail_permintaan_id)
      } else if (dokumen.kategori_permintaan_id) {
        query = query
          .eq('kategori_permintaan_id', dokumen.kategori_permintaan_id)
          .is('detail_permintaan_id', null)
      } else if (dokumen.jenis_permintaan_id) {
        query = query
          .eq('jenis_permintaan_id', dokumen.jenis_permintaan_id)
          .is('kategori_permintaan_id', null)
          .is('detail_permintaan_id', null)
      }
      // else: dokumen lama (tanpa chain) — query tanpa chain filter, match semua legacy kelengkapan

      const { data: kelData } = await query
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
        // If user-created doc was uploaded, add it to userDocs
        if (kel.isUserCreated) {
          setUserDocs(prev => [...prev.filter(d => d.id !== kel.id), { ...kel, nama_dokumen: kel.nama_dokumen }])
        }
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

  // User-created document handlers
  function addUserDoc() {
    if (!newDocTitle.trim()) return
    const docId = `user-custom-${crypto.randomUUID()}`
    const newDoc: KelengkapanItem = {
      id: docId,
      nama_dokumen: newDocTitle.trim(),
      required: false,
      isUserCreated: true,
    }
    setUserDocs(prev => [...prev, newDoc])
    setNewDocTitle('')
    setShowAddForm(false)
  }

  function removeUserDoc(docId: string) {
    // Remove from userDocs state
    setUserDocs(prev => prev.filter(d => d.id !== docId))
    // Remove from lampiranUrls
    const newLampiranUrls = lampiranUrls.filter(l => l.kelengkapan_id !== docId)
    setLampiranUrls(newLampiranUrls)
    // Update API
    fetch(`/api/dokumen/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lampiranUrls: newLampiranUrls }),
    })
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
        // Look for filename: first check kelengkapan (Material), then lampiranUrls.nama (Non-Material)
        const found = lamp ? kelengkapan.find(k => k.id === lamp.kelengkapan_id) : null
        setPreviewFilename(found?.nama_dokumen ?? lamp?.nama ?? 'Lampiran')
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
  const isNonMaterial = dok?.is_non_material === true ||
    (dok?.is_non_material === undefined && !dok?.jenis_permintaan_id && !dok?.kategori_permintaan_id && !dok?.detail_permintaan_id)

  // For Non-Material: just need at least one lampiran
  // For Material: need all required lampiran
  const canSubmit = lampiranUrls.length > 0 &&
    (isNonMaterial || missingRequired.length === 0)

  // Workflow steps based on document type
  const workflowSteps = isNonMaterial
    ? [
        { key: 'DRAFT', label: 'Draf' },
        { key: 'IN_KETUA_TIM_APPROVAL', label: 'Ketua Tim' },
        { key: 'COMPLETED', label: 'Selesai' },
      ]
    : WORKFLOW_STEPS

  function getNonMaterialWorkflowIndex(status: string): number {
    if (status === 'NEED_REVISION') return -1
    return workflowSteps.findIndex(s => s.key === status)
  }

  const workflowIdx = isNonMaterial ? getNonMaterialWorkflowIndex(dok?.status ?? '') : getWorkflowIndex(dok?.status ?? '')

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
                {workflowSteps.map((step, i) => {
                  const isCurrent = step.key === dok.status
                  const isPast = workflowIdx > i || dok.status === 'COMPLETED'
                  const showAsRevision = dok.status === 'NEED_REVISION' && step.key === 'IN_PPK_VALIDATION'
                  return (
                    <div key={step.key} className="flex flex-col items-center flex-1 relative">
                      {i < workflowSteps.length - 1 && (
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
                {dok.jenis_permintaan_id && (
                  <div>
                    <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Jenis Permintaan</p>
                    <p className="text-sm font-semibold text-on-surface">{dok.jenis_permintaan_nama ?? '—'}</p>
                  </div>
                )}
                {dok.kategori_permintaan_id && (
                  <div>
                    <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Kategori Permintaan</p>
                    <p className="text-sm font-semibold text-on-surface">{dok.kategori_permintaan_nama ?? '—'}</p>
                  </div>
                )}
                {dok.detail_permintaan_id && (
                  <div>
                    <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Detail Permintaan</p>
                    <p className="text-sm font-semibold text-on-surface">{dok.detail_permintaan_nama ?? '—'}</p>
                  </div>
                )}
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

            {/* Kelengkapan checklist - Material Documents */}
            {!isNonMaterial && kelengkapan.length > 0 && (
              <div className="bg-white rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm">
                <div className="bg-surface-container-low/30 px-4 py-3 border-b border-outline-variant/30">
                  <h3 className="text-sm font-semibold text-on-surface">Kelengkapan Dokumen</h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {requiredItems.filter(r => uploadedIds.has(r.id)).length} dari {requiredItems.length} lampiran wajib terunggah
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
            )}

            {/* Non-Material: Dokumen Pendukung */}
            {isNonMaterial && (
              <div className="bg-white rounded-xl border border-blue-200 overflow-hidden shadow-sm">
                <div className="bg-blue-50/50 px-4 py-3 border-b border-blue-200">
                  <h3 className="text-sm font-semibold text-blue-700">Dokumen Pendukung</h3>
                  <p className="text-xs text-blue-600 mt-0.5">
                    {lampiranUrls.length > 0
                      ? `${lampiranUrls.filter(l => l.kelengkapan_id.startsWith('user-custom-')).length} dokumen pendukung terunggah`
                      : 'Tambahkan dokumen pendukung untuk revisi'}
                  </p>
                </div>
                <div className="p-4 space-y-3">
                  {uploadProgress && (
                    <p className="text-xs text-blue-600 animate-pulse">{uploadProgress}</p>
                  )}

                  {userDocs.length === 0 && !showAddForm && (
                    <div className="text-center py-6 text-on-surface-variant text-xs">
                      Belum ada dokumen pendukung. Klik tombol di bawah untuk menambahkan.
                    </div>
                  )}

                  {/* User-created documents list */}
                  {userDocs.map(userDoc => {
                    const lamp = lampiranUrls.find(l => l.kelengkapan_id === userDoc.id)
                    const isUploaded = !!lamp
                    const lampIdx = lampiranUrls.findIndex(l => l.kelengkapan_id === userDoc.id)
                    return (
                      <div key={userDoc.id} className="flex items-center gap-3 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                        {isUploaded ? (
                          <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-blue-300 shrink-0" />
                        )}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <User size={14} className="text-blue-500 shrink-0" />
                          <span className="text-sm text-on-surface font-medium">{userDoc.nama_dokumen}</span>
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium shrink-0">TAMBAHAN ANDA</span>
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
                          key={lamp ? `replace-${lamp.url}` : `upload-${userDoc.id}`}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                          className="hidden"
                          id={`upload-${userDoc.id}`}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            saveLampiran(userDoc, file)
                            e.target.value = ''
                          }}
                        />
                        <label htmlFor={`upload-${userDoc.id}`} className="cursor-pointer">
                          <span className="inline-flex items-center gap-1 h-6 px-2 rounded-[min(var(--radius-md),10px)] text-xs font-medium border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700">
                            <Upload size={12} />{isUploaded ? 'Ganti' : 'Unggah'}
                          </span>
                        </label>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => removeUserDoc(userDoc.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          aria-label="Hapus dokumen"
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    )
                  })}

                  {/* Add document button / form */}
                  {showAddForm ? (
                    <div className="flex items-center gap-2 p-3 bg-surface-container-low/20 rounded-lg">
                      <input
                        type="text"
                        value={newDocTitle}
                        onChange={(e) => setNewDocTitle(e.target.value)}
                        placeholder="Nama dokumen (misal: Bukti Transfer)"
                        className="flex-1 h-8 px-3 text-sm border border-outline rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') addUserDoc()
                          if (e.key === 'Escape') { setShowAddForm(false); setNewDocTitle('') }
                        }}
                        autoFocus
                      />
                      <Button size="sm" onClick={addUserDoc} disabled={!newDocTitle.trim()}>
                        Simpan
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setShowAddForm(false); setNewDocTitle('') }}>
                        Batal
                      </Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAddForm(true)}
                      className="flex items-center gap-2 w-full p-3 rounded-lg border border-dashed border-blue-300 text-blue-600 hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
                    >
                      <Plus size={16} />
                      <span className="text-sm font-medium">Tambah Dokumen Pendukung</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Upload summary - Material only */}
            {!isNonMaterial && lampiranUrls.length > 0 && (
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
                  isNonMaterial ? 'Ajukan Ulang ke Ketua Tim' : 'Ajukan Ulang ke PPK'
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