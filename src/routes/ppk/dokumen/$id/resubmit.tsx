import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { ActivityLog } from '#/components/dokumen/ActivityLog'
import { getBrowserClient } from '#/lib/supabase-browser'
import {
  FileText,
  ChevronRight,
  Upload,
  Download,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  XCircle,
  X,
  ArrowLeft,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import type { LampiranUrl } from '#/lib/dokumen-helpers'

export const Route = createFileRoute('/ppk/dokumen/$id/resubmit')({
  component: PpkResubmitPage,
})

interface KelengkapanItem {
  id: string
  nama_dokumen: string
  required: boolean
}

type DokumenResubmit = {
  id: string
  judul: string
  fungsi_nama: string
  kegiatan_nama: string
  is_ketua_tim: boolean
  status: string
  revision_notes: string | null
  lampiran_urls: LampiranUrl[]
  tahun: number
  tanggal: string
  created_at: string
  jenis_permintaan_id?: string | null
  kategori_permintaan_id?: string | null
  detail_permintaan_id?: string | null
  jenis_permintaan_nama?: string
  kategori_permintaan_nama?: string
  detail_permintaan_nama?: string
}

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

async function uploadFile(file: File): Promise<{ url: string }> {
  const supabase = getBrowserClient()
  if (!supabase) throw new Error('Supabase not initialized')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeFilename}`
  const { data, error } = await supabase.storage.from('dokumen-lampiran').upload(path, file, { cacheControl: '3600', upsert: false })
  if (error || !data) throw new Error(`Upload failed: ${error?.message ?? 'Unknown error'}`)
  return { url: path }
}

function PpkResubmitPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const [dokumen, setDokumen] = useState<DokumenResubmit | null>(null)
  const [kelengkapan, setKelengkapan] = useState<KelengkapanItem[]>([])
  const [lampiranUrls, setLampiranUrls] = useState<LampiranUrl[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [kembalikanLoading, setKembalikanLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [previewingIdx, setPreviewingIdx] = useState<number | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFilename, setPreviewFilename] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => { fetchData() }, [id])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && previewingIdx !== null) closePreview() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [previewingIdx])

  async function fetchData() {
    setLoading(true)
    try {
      const supabase = getBrowserClient()
      const res = await fetch(`/api/ppk/resubmit/${id}`, { credentials: 'include' })
      if (!res.ok) { const json = await res.json(); setFetchError(json.error ?? 'Gagal'); setLoading(false); return }
      const json = await res.json()
      setDokumen(json.dokumen)
      setLampiranUrls(json.dokumen.lampiran_urls ?? [])
      if (supabase && json.dokumen.kegiatan_jenis_id) {
        const dokData = json.dokumen
        let query = supabase.from('master_kelengkapan_dokumen').select('id, nama_dokumen, required, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id')
          .eq('kegiatan_id', dokData.kegiatan_jenis_id)
          .eq('is_ketua_tim', dokData.is_ketua_tim)
        if (dokData.detail_permintaan_id) {
          query = query.eq('detail_permintaan_id', dokData.detail_permintaan_id)
        } else if (dokData.kategori_permintaan_id) {
          query = query.eq('kategori_permintaan_id', dokData.kategori_permintaan_id).is('detail_permintaan_id', null)
        } else if (dokData.jenis_permintaan_id) {
          query = query.eq('jenis_permintaan_id', dokData.jenis_permintaan_id).is('kategori_permintaan_id', null).is('detail_permintaan_id', null)
        }
        const { data: kelData } = await query
        if (kelData) setKelengkapan(kelData as KelengkapanItem[])
      }
    } catch { setFetchError('Terjadi kesalahan') } finally { setLoading(false) }
  }

  async function saveLampiran(kel: KelengkapanItem, file: File) {
    setUploadProgress(`Mengupload ${file.name}...`)
    try {
      const { url } = await uploadFile(file)
      const newLamp: LampiranUrl = { kelengkapan_id: kel.id, nama: kel.nama_dokumen, url, uploaded_at: new Date().toISOString() }
      const newLampiranUrls = [...lampiranUrls.filter(l => l.kelengkapan_id !== kel.id), newLamp]
      const patchRes = await fetch(`/api/ppk/resubmit/${id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lampiranUrls: newLampiranUrls }) })
      if (patchRes.ok) setLampiranUrls(newLampiranUrls)
      else { const errJson = await patchRes.json(); alert(`Gagal menyimpan: ${errJson.error ?? 'Error'}`) }
    } catch { alert('Gagal mengupload file') } finally { setUploadProgress(null) }
  }

  async function handleDownload(idx: number) {
    try {
      const res = await fetch(`/api/dokumen/${id}/download/${idx}`, { credentials: 'include' })
      const json = await res.json()
      if (json.signedUrl) {
        const a = document.createElement('a')
        a.href = json.signedUrl
        a.download = json.filename ?? 'lampiran'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } else { alert('Gagal mengunduh') }
    } catch { alert('Gagal mengunduh') }
  }

  async function handleResubmit() {
    if (!dokumen) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/ppk/resubmit/${id}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lampiranUrls }) })
      const json = await res.json()
      if (!res.ok) { alert(json.error ?? 'Gagal'); return }
      navigate({ to: '/ppk/revisi' })
    } catch { alert('Terjadi kesalahan') } finally { setSubmitting(false) }
  }

  async function handleKembalikan() {
    if (!confirm('Yakin ingin mengembalikan dokumen ini ke pegawai?')) return
    setKembalikanLoading(true)
    try {
      const res = await fetch(`/api/ppk/kembalikan/${id}`, { method: 'POST', credentials: 'include' })
      const json = await res.json()
      if (!res.ok) { alert(json.error ?? 'Gagal'); return }
      navigate({ to: '/ppk/revisi' })
    } catch { alert('Terjadi kesalahan') } finally { setKembalikanLoading(false) }
  }

  async function handlePreview(idx: number) {
    setPreviewingIdx(idx); setPreviewUrl(null); setPreviewLoading(true)
    try {
      const res = await fetch(`/api/ppk/dokumen/${id}/preview/${idx}`, { credentials: 'include' })
      const json = await res.json()
      if (json.signedUrl) { setPreviewUrl(json.signedUrl); setPreviewFilename(json.filename ?? 'Lampiran') }
    } catch { /* silent */ } finally { setPreviewLoading(false) }
  }

  function closePreview() { setPreviewingIdx(null); setPreviewUrl(null); setPreviewFilename('') }

  const requiredItems = kelengkapan.filter(k => k.required)
  const uploadedIds = new Set(lampiranUrls.map(l => l.kelengkapan_id))
  const missingRequired = requiredItems.filter(r => !uploadedIds.has(r.id))
  const canSubmit = lampiranUrls.length > 0 && missingRequired.length === 0
  const workflowIdx = dokumen ? getWorkflowIndex(dokumen.status) : -1

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={24} className="animate-spin text-primary" />
    </div>
  )

  if (fetchError || !dokumen) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 bg-error/5 rounded-2xl border border-error/20">
      <AlertTriangle size={32} className="text-error" />
      <p className="text-sm text-on-surface-variant">{fetchError ?? 'Dokumen tidak ditemukan'}</p>
      <Button variant="outline" size="sm" onClick={() => navigate({ to: '/ppk/revisi' })}>Kembali ke Revisi</Button>
    </div>
  )

  return (
    <PageLayout>
      <div className="max-w-3xl mx-auto">
      {/* Preview Modal */}
      {previewingIdx !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) closePreview() }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl flex flex-col max-h-[70vh]">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant/30 shrink-0">
              <FileText size={16} className="text-primary shrink-0" />
              <p className="text-sm font-semibold text-on-surface truncate flex-1">{previewFilename}</p>
              <span className="text-[10px] text-outline hidden sm:block">ESC</span>
              <button onClick={closePreview} className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-surface-container-low transition-colors shrink-0"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-auto bg-surface-container-low/30">
              {previewLoading ? <div className="flex items-center justify-center h-48"><Loader2 size={22} className="animate-spin text-primary" /></div>
               : previewUrl ? <iframe src={previewUrl} className="w-full h-[calc(70vh-96px)] border-0" title={previewFilename} />
               : <div className="flex items-center justify-center h-48"><p className="text-sm text-on-surface-variant">Gagal memuat pratinjau.</p></div>}
            </div>
          </div>
        </div>
      )}

      <h2 className="font-headline text-xl font-extrabold text-on-surface">{dokumen.judul}</h2>

      <div className="bg-white rounded-xl border border-outline-variant/30 p-4 shadow-sm">
        <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">Alur Dokumen</p>
        <div className="flex items-center gap-0">
          {WORKFLOW_STEPS.map((step, i) => {
            const isCurrent = step.key === dokumen.status
            const isPast = workflowIdx > i || dokumen.status === 'COMPLETED'
            const showAsRevision = dokumen.status === 'NEED_REVISION' && step.key === 'IN_BENDAHARA_APPROVAL'
            return (
              <div key={step.key} className="flex flex-col items-center flex-1 relative">
                {i < WORKFLOW_STEPS.length - 1 && <div className={cn('absolute top-4 -right-1/2 w-full h-0.5 z-0', isPast ? 'bg-primary' : 'bg-outline-variant')} />}
                <div className={cn('relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors', isCurrent || showAsRevision ? 'border-primary bg-primary text-white' : isPast ? 'border-primary bg-primary text-white' : 'border-outline-variant bg-background text-outline')}>
                  {showAsRevision ? <AlertTriangle size={14} /> : isPast && !isCurrent ? <CheckCircle2 size={14} /> : i + 1}
                </div>
                <span className={cn('mt-2 text-[10px] font-medium text-center', isCurrent || showAsRevision ? 'text-primary font-semibold' : isPast ? 'text-primary' : 'text-outline')}>{step.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {dokumen.revision_notes && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-amber-700 mb-1">Catatan dari Bendahara</p>
            <p className="text-xs text-amber-700">{dokumen.revision_notes}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-4">
          <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Fungsi</p><p className="text-sm font-semibold text-on-surface">{dokumen.fungsi_nama ?? '—'}</p></div>
          <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Kegiatan</p><p className="text-sm font-semibold text-on-surface">{dokumen.kegiatan_nama ?? '—'}</p></div>
          {dokumen.jenis_permintaan_id && (
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Jenis Permintaan</p><p className="text-sm font-semibold text-on-surface">{dokumen.jenis_permintaan_nama ?? '—'}</p></div>
          )}
          {dokumen.kategori_permintaan_id && (
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Kategori Permintaan</p><p className="text-sm font-semibold text-on-surface">{dokumen.kategori_permintaan_nama ?? '—'}</p></div>
          )}
          {dokumen.detail_permintaan_id && (
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Detail Permintaan</p><p className="text-sm font-semibold text-on-surface">{dokumen.detail_permintaan_nama ?? '—'}</p></div>
          )}
          <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tahun</p><p className="text-sm font-semibold text-on-surface">{dokumen.tahun}</p></div>
          <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tanggal</p><p className="text-sm font-semibold text-on-surface">{dokumen.tanggal ? formatDate(dokumen.tanggal) : '—'}</p></div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-outline-variant/30 overflow-hidden shadow-sm">
        <div className="bg-surface-container-low/30 px-4 py-3 border-b border-outline-variant/30">
          <h3 className="text-sm font-semibold text-on-surface">Kelengkapan Dokumen</h3>
          <p className="text-xs text-on-surface-variant mt-0.5">{kelengkapan.length > 0 ? `${requiredItems.filter(r => uploadedIds.has(r.id)).length} dari ${requiredItems.length} lampiran wajib terunggah` : 'Memuat...'}</p>
        </div>
        <div className="p-4 space-y-3">
          {uploadProgress && <p className="text-xs text-primary animate-pulse">{uploadProgress}</p>}
          {kelengkapan.map(kel => {
            const lamp = lampiranUrls.find(l => l.kelengkapan_id === kel.id)
            const isUploaded = !!lamp
            const lampIdx = lampiranUrls.findIndex(l => l.kelengkapan_id === kel.id)
            return (
              <div key={kel.id} className="flex items-center gap-3 p-3 bg-surface-container-low/20 rounded-lg">
                {isUploaded ? <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                  : kel.required ? <XCircle size={16} className="text-red-500 shrink-0" />
                  : <div className="w-4 h-4 rounded-full border border-outline shrink-0" />}
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-on-surface font-medium">{kel.nama_dokumen}</span>
                  {kel.required && <span className="text-red-500 ml-1">*</span>}
                </div>
                {isUploaded && (
                  <><Button size="icon-xs" variant="ghost" onClick={() => handlePreview(lampIdx)} aria-label="Pratinjau"><Eye size={14} /></Button>
                  <Button size="icon-xs" variant="ghost" onClick={() => handleDownload(lampIdx)} aria-label="Unduh"><Download size={14} /></Button></>
                )}
                <input key={lamp ? `replace-${lamp.url}` : `upload-${kel.id}`} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" className="hidden" id={`upload-${kel.id}`} onChange={e => { const file = e.target.files?.[0]; if (!file) return; saveLampiran(kel, file); e.target.value = '' }} />
                <label htmlFor={`upload-${kel.id}`} className="cursor-pointer">
                  <span className="inline-flex items-center gap-1 h-6 px-2 rounded-[min(var(--radius-md),10px)] text-xs font-medium border border-border bg-background hover:bg-muted text-foreground"><Upload size={12} />{isUploaded ? 'Ganti' : 'Unggah'}</span>
                </label>
              </div>
            )
          })}
        </div>
      </div>

      {lampiranUrls.length > 0 && (
        <div className="bg-surface-container-low/20 rounded-lg p-3">
          <p className="text-xs text-on-surface-variant">{lampiranUrls.length} lampiran terunggah. Klik "Ganti" untuk mengganti file.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link to="/ppk/revisi"><Button variant="outline" size="sm" className="gap-1.5"><ChevronRight size={14} className="rotate-180" />Daftar Revisi</Button></Link>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={handleKembalikan} disabled={kembalikanLoading}>
          {kembalikanLoading ? <Loader2 size={14} className="animate-spin" /> : <ArrowLeft size={14} />}Kembalikan ke Pegawai
        </Button>
        <Button size="sm" className="gap-1.5" onClick={handleResubmit} disabled={submitting || !canSubmit}>
          {submitting ? <><Loader2 size={14} className="animate-spin" />Mengajukan...</> : 'Resubmit ke Bendahara'}
        </Button>
      </div>

      <ActivityLog dokumenId={id} />
      </div>
    </PageLayout>
  )
}
