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
  isUserCreated?: boolean
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
  const [originalLampirans, setOriginalLampirans] = useState<LampiranUrl[]>([])
  const [pendingFiles, setPendingFiles] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [userDocs, setUserDocs] = useState<KelengkapanItem[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newDocTitle, setNewDocTitle] = useState('')
  const [isNonMaterial, setIsNonMaterial] = useState(false)
  const [nominalRealisasi, setNominalRealisasi] = useState<string>('')
  const [nominalError, setNominalError] = useState<string>('')
  const [originalNominal, setOriginalNominal] = useState<string>('')

  // Preview modal state
  const [previewingDocId, setPreviewingDocId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFilename, setPreviewFilename] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => { fetchData() }, [id])

  // ESC to close preview
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && previewingDocId !== null) closePreview()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [previewingDocId])

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
      const lampirans = dokumen.lampiran_urls as LampiranUrl[] ?? []
      setLampiranUrls(lampirans)
      setOriginalLampirans(lampirans)
      console.log('[Revisi] Initial state loaded:', { count: lampirans.length })

      // Check if Non-Material
      const nonMaterial = dokumen.is_non_material === true ||
        (!dokumen.jenis_permintaan_id && !dokumen.kategori_permintaan_id && !dokumen.detail_permintaan_id)
      setIsNonMaterial(nonMaterial)

      // Initialize nominal_realisasi
      if (!nonMaterial && dokumen.nominal_realisasi !== null && dokumen.nominal_realisasi !== undefined) {
        const formattedNominal = dokumen.nominal_realisasi.toLocaleString('id-ID')
        setNominalRealisasi(formattedNominal)
        setOriginalNominal(formattedNominal)
        console.log('[Revisi] Initial nominal_realisasi:', formattedNominal)
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

      // Build new lampiran, using kelengkapan nama_dokumen as the name
      const newLamp: LampiranUrl = {
        kelengkapan_id: kel.id,
        nama: kel.nama_dokumen,
        url,
        uploaded_at: new Date().toISOString(),
      }

      // Update local state only for real-time preview/download
      setLampiranUrls(prev => [...prev.filter(l => l.kelengkapan_id !== kel.id), newLamp])
      // Track pending file for cleanup if cancelled
      setPendingFiles(prev => new Map(prev).set(kel.id, url))
      console.log('[Revisi] File uploaded (pending):', { docId: kel.id, newUrl: url })

      // If user-created doc was uploaded, add it to userDocs
      if (kel.isUserCreated) {
        setUserDocs(prev => [...prev.filter(d => d.id !== kel.id), { ...kel, nama_dokumen: kel.nama_dokumen }])
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
    setPendingFiles(prev => new Map(prev).set(docId, ''))
    setNewDocTitle('')
    setShowAddForm(false)
  }

  function removeUserDoc(docId: string) {
    const lamp = lampiranUrls.find(l => l.kelengkapan_id === docId)
    // Remove from userDocs state
    setUserDocs(prev => prev.filter(d => d.id !== docId))
    // Remove from lampiranUrls
    setLampiranUrls(prev => prev.filter(l => l.kelengkapan_id !== docId))
    // Track for cleanup if was a pending new file
    if (lamp?.url) {
      setPendingFiles(prev => new Map(prev).set(docId, lamp.url))
    } else {
      setPendingFiles(prev => {
        const next = new Map(prev)
        next.delete(docId)
        return next
      })
    }
  }

  async function handleSubmit() {
    if (!dok) return

    // Validate nominal for Material docs
    if (!isNonMaterial) {
      const rawNominal = nominalRealisasi.replace(/[^\d]/g, '')
      if (!rawNominal || rawNominal === '0') {
        setNominalError('Nominal Realisasi wajib diisi dan harus lebih dari 0')
        return
      }
      const num = parseInt(rawNominal, 10)
      if (isNaN(num) || num <= 0) {
        setNominalError('Nominal Realisasi wajib diisi dan harus lebih dari 0')
        return
      }
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      console.log('[Revisi] Ajukan clicked, pending files:', pendingFiles.size)
      console.log('[Revisi] PATCH sent to API:', { lampiranUrls })

      // Parse nominal value
      const nominalValue = !isNonMaterial ? parseInt(nominalRealisasi.replace(/[^\d]/g, ''), 10) || null : null

      // PATCH to API first (this saves changes and deletes old files)
      const patchRes = await fetch(`/api/dokumen/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lampiranUrls, nominalRealisasi: nominalValue }),
      })

      if (!patchRes.ok) {
        const json = await patchRes.json()
        throw new Error(json.error || 'Gagal menyimpan')
      }

      console.log('[Revisi] PATCH success, now submitting to next step...')

      // Then submit to next workflow step
      const submitRes = await fetch(`/api/dokumen/${id}/submit`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!submitRes.ok) {
        const json = await submitRes.json()
        throw new Error(json.error || 'Gagal mengajukan ulang')
      }

      console.log('[Revisi] Submit success')
      setPendingFiles(new Map())
      window.location.href = '/pegawai/dokumen'
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePreview(docId: string) {
    const lamp = lampiranUrls.find(l => l.kelengkapan_id === docId)
    if (!lamp) return
    setPreviewingDocId(docId)
    setPreviewUrl(null)
    setPreviewFilename(lamp.nama)
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/dokumen/preview-url?url=${encodeURIComponent(lamp.url)}`, { credentials: 'include' })
      const json = await res.json()
      if (json.signedUrl) {
        setPreviewUrl(json.signedUrl)
      }
    } catch { /* silent */ } finally {
      setPreviewLoading(false)
    }
  }

  async function handleDownload(docId: string) {
    const lamp = lampiranUrls.find(l => l.kelengkapan_id === docId)
    if (!lamp || !dok) return
    try {
      // Storage path format: [user_id]/[uuid]_[timestamp]_[original_filename]
      // Example: "user-id/7df5992f-be9a-4e8d-b836-7d677d7976c4_1777969605493_Penilaian_360.pdf"
      const pathParts = lamp.url.split('/')
      const filenameWithExt = pathParts[pathParts.length - 1] || 'download'

      // Extract original filename from storage path
      const pathMatch = filenameWithExt.match(/^[a-zA-Z0-9-]+_(\d+)_.*$/)
      let originalFilename = filenameWithExt
      if (pathMatch) {
        const timestampPos = filenameWithExt.indexOf('_') + 1 + 13 + 1
        if (timestampPos < filenameWithExt.length) {
          originalFilename = filenameWithExt.substring(timestampPos)
        }
      }

      // Extract extension
      const lastDotIdx = originalFilename.lastIndexOf('.')
      let ext = ''
      let nameWithoutExt = originalFilename
      if (lastDotIdx > 0 && lastDotIdx < originalFilename.length - 1) {
        ext = originalFilename.slice(lastDotIdx + 1).toLowerCase()
        nameWithoutExt = originalFilename.slice(0, lastDotIdx)
      }

      const docIdShort = dok.id.substring(0, 8)
      const dateStr = dok.tanggal ? `_${dok.tanggal}` : ''
      const filename = `${docIdShort}_${nameWithoutExt}${dateStr}.${ext}`

      console.log('[Revisi] Download file:', {
        docIdShort,
        lampUrl: lamp.url,
        originalFilename,
        ext,
        filename
      })

      const res = await fetch(`/api/dokumen/download-url?url=${encodeURIComponent(lamp.url)}&docId=${dok.id}&docDate=${dok.tanggal || ''}&lampName=${encodeURIComponent(originalFilename)}`, { credentials: 'include' })
      const json = await res.json()
      if (json.signedUrl) {
        // Create anchor and trigger download with correct filename
        const a = document.createElement('a')
        a.href = json.signedUrl
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } else { alert('Gagal mengunduh') }
    } catch (err) {
      console.error('[Revisi] Download error:', err)
      alert('Gagal mengunduh')
    }
  }

  function closePreview() {
    setPreviewingDocId(null)
    setPreviewUrl(null)
    setPreviewFilename('')
  }

  function handleBack() {
    // Check if there are any pending changes
    const hasFileChanges = pendingFiles.size > 0
    const hasNominalChange = !isNonMaterial && nominalRealisasi !== originalNominal
    const hasUserDocChanges = userDocs.some(d => !originalLampirans.some(l => l.kelengkapan_id === d.id))

    console.log('[Revisi] === HANDLE BACK START ===')
    console.log('[Revisi] Checking for pending changes...')
    console.log('[Revisi] File changes:', {
      pendingFilesCount: pendingFiles.size,
      pendingFiles: Array.from(pendingFiles.entries()).map(([id, url]) => ({ id, url })),
    })
    console.log('[Revisi] Nominal changes:', {
      isMaterial: !isNonMaterial,
      originalNominal,
      currentNominal: nominalRealisasi,
      hasNominalChange,
    })
    console.log('[Revisi] User doc changes:', {
      userDocsCount: userDocs.length,
      hasUserDocChanges,
    })

    if (!hasFileChanges && !hasNominalChange && !hasUserDocChanges) {
      console.log('[Revisi] No pending changes detected — redirecting immediately')
      window.location.href = '/pegawai/dokumen'
      return
    }

    // Show detailed changes summary
    const changesList: string[] = []
    if (hasFileChanges) changesList.push(`${pendingFiles.size} file(s) replaced/added`)
    if (hasNominalChange) changesList.push('nominal changed')
    if (hasUserDocChanges) changesList.push('dokumen tambahan ditambahkan')
    console.log('[Revisi] Pending changes found:', changesList.join(', '))

    // Show confirmation dialog
    const confirmed = confirm('Apakah anda ingin batal? Data perubahan belum tersimpan dan akan terhapus.')
    if (!confirmed) {
      console.log('[Revisi] User cancelled — staying on page')
      return
    }

    console.log('[Revisi] User confirmed — reverting all changes...')

    // Step 1: Revert lampiranUrls to original state (in memory)
    console.log('[Revisi] Step 1: Reverting lampiranUrls to original state')
    console.log('[Revisi] Before:', lampiranUrls.length, 'items')
    console.log('[Revisi] After:', originalLampirans.length, 'items')
    setLampiranUrls(originalLampirans)

    // Step 2: Revert nominal to original state (in memory)
    if (hasNominalChange) {
      console.log('[Revisi] Step 2: Reverting nominal_realisasi to original value')
      console.log('[Revisi] Before:', nominalRealisasi)
      console.log('[Revisi] After:', originalNominal)
      setNominalRealisasi(originalNominal)
      setNominalError('')
    }

    // Step 3: Revert userDocs to original state (in memory)
    if (hasUserDocChanges) {
      console.log('[Revisi] Step 3: Reverting userDocs to original state')
      const originalUserDocs = originalLampirans
        .filter(l => l.kelengkapan_id.startsWith('user-custom-'))
        .map(l => ({ id: l.kelengkapan_id, nama_dokumen: l.nama, required: false, isUserCreated: true }))
      console.log('[Revisi] User docs before:', userDocs.length)
      console.log('[Revisi] User docs after:', originalUserDocs.length)
      setUserDocs(originalUserDocs)
    }

    // Step 4: Delete newly uploaded files from storage (files that were never saved to DB)
    const supabase = getBrowserClient()
    if (supabase && hasFileChanges) {
      console.log('[Revisi] Step 4: Deleting newly uploaded files from storage')
      for (const [docId, url] of pendingFiles) {
        if (url) {
          const isNewFile = !originalLampirans.some(l => l.url === url)
          if (isNewFile) {
            console.log('[Revisi] Deleting file:', { docId, url })
            supabase.storage.from('dokumen-lampiran').remove([url])
          } else {
            console.log('[Revisi] Skipping (file existed before):', { docId, url })
          }
        }
      }
    }

    // Step 5: Clear pending files tracker
    console.log('[Revisi] Step 5: Clearing pending files tracker')
    setPendingFiles(new Map())

    console.log('[Revisi] === ALL CHANGES REVERTED ===')
    console.log('[Revisi] Redirecting to /pegawai/dokumen')
    window.location.href = '/pegawai/dokumen'
  }

  // Check required lampiran
  const requiredItems = kelengkapan.filter(k => k.required)
  const uploadedIds = new Set(lampiranUrls.map(l => l.kelengkapan_id))
  const missingRequired = requiredItems.filter(r => !uploadedIds.has(r.id))

  // Material documents need all required lampiran and valid nominal
  const nominalValid = isNonMaterial || (
    nominalRealisasi.replace(/[^\d]/g, '') !== '' &&
    parseInt(nominalRealisasi.replace(/[^\d]/g, ''), 10) > 0
  )
  const canSubmit = lampiranUrls.length > 0 && missingRequired.length === 0 && nominalValid

  const workflowIdx = dok ? getWorkflowIndex(dok.status) : -1

  return (
    <PageLayout>
      {/* Preview Modal */}
      {previewingDocId !== null && (
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
                {!isNonMaterial && (
                  <div>
                    <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Nominal Realisasi (Rp)</p>
                    <input
                      type="text"
                      value={nominalRealisasi}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^\d]/g, '')
                        const num = parseInt(raw, 10)
                        setNominalRealisasi(raw ? num.toLocaleString('id-ID') : '')
                        setNominalError('')
                      }}
                      placeholder="Contoh: 1.500.000"
                      className="w-full px-3 py-1.5 border border-outline rounded-lg text-sm bg-surface text-on-surface
                        focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                        placeholder:text-outline"
                    />
                    {nominalError && (
                      <p className="text-[10px] text-error mt-1 flex items-center gap-1">
                        <AlertCircle size={12} /> {nominalError}
                      </p>
                    )}
                  </div>
                )}
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
                            <Button size="icon-xs" variant="ghost" onClick={() => handlePreview(kel.id)} aria-label="Pratinjau">
                              <Eye size={14} />
                            </Button>
                            <Button size="icon-xs" variant="ghost" onClick={() => handleDownload(kel.id)} aria-label="Unduh">
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
                            <Button size="icon-xs" variant="ghost" onClick={() => handlePreview(userDoc.id)} aria-label="Pratinjau">
                              <Eye size={14} />
                            </Button>
                            <Button size="icon-xs" variant="ghost" onClick={() => handleDownload(userDoc.id)} aria-label="Unduh">
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
              <Button variant="outline" disabled={submitting} onClick={handleBack}>Batal</Button>
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