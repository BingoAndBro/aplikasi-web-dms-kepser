import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import {
  FileText,
  ChevronRight,
  Upload,
  Download,
  Eye,
  XCircle,
  Loader2,
  Pencil,
  Plus,
  X,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import { getBrowserClient } from '#/lib/supabase-browser'
import type { DokumenRow, LampiranUrl } from '#/lib/dokumen-helpers'

export const Route = createFileRoute('/pegawai/dokumen/$id/edit')({
  component: EditDokumenPage,
})

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

function formatDate(str: string): string {
  try { return new Date(str).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return str }
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function EditDokumenPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()

  const [dok, setDok] = useState<DokumenRow | null>(null)
  const [lampiranUrls, setLampiranUrls] = useState<LampiranUrl[]>([])
  const [originalLampirans, setOriginalLampirans] = useState<LampiranUrl[]>([])
  const [pendingFiles, setPendingFiles] = useState<Map<string, string>>(new Map())
  const [userDocs, setUserDocs] = useState<{ id: string; nama: string; lamp?: LampiranUrl }[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newDocTitle, setNewDocTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [previewingDocId, setPreviewingDocId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFilename, setPreviewFilename] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => { fetchData() }, [id])

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
      const res = await fetch(`/api/dokumen/${id}`, { credentials: 'include' })
      if (!res.ok) {
        const json = await res.json()
        setError(json.error || `HTTP ${res.status}`)
        setLoading(false)
        return
      }
      const json = await res.json()
      const dokumen = json.dokumen as DokumenRow

      // Check if Non-Material and TERSIMPAN
      const isNonMaterial = dokumen.is_non_material === true ||
        (!dokumen.jenis_permintaan_id && !dokumen.kategori_permintaan_id && !dokumen.detail_permintaan_id)

      if (!isNonMaterial || dokumen.status !== 'TERSIMPAN') {
        setError('Dokumen ini tidak bisa diedit')
        setLoading(false)
        return
      }

      setDok(dokumen)
      const lampirans = dokumen.lampiran_urls as LampiranUrl[] ?? []
      setLampiranUrls(lampirans)
      setOriginalLampirans(lampirans)

      // Extract user-created documents
      const userCreated: { id: string; nama: string; lamp?: LampiranUrl }[] = []
      for (const lamp of lampirans) {
        if (lamp.kelengkapan_id.startsWith('user-custom-')) {
          userCreated.push({ id: lamp.kelengkapan_id, nama: lamp.nama, lamp })
        }
      }
      setUserDocs(userCreated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
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
    if (!lamp) return
    try {
      const res = await fetch(`/api/dokumen/download-url?url=${encodeURIComponent(lamp.url)}`, { credentials: 'include' })
      const json = await res.json()
      if (json.signedUrl) window.open(json.signedUrl, '_blank')
    } catch {
      alert('Gagal mengunduh')
    }
  }

  function closePreview() {
    setPreviewingDocId(null)
    setPreviewUrl(null)
    setPreviewFilename('')
  }

  async function saveLampiran(docId: string, file: File) {
    setUploadProgress(`Mengupload ${file.name}...`)
    try {
      const { url } = await uploadFile(file)
      const doc = userDocs.find(d => d.id === docId)
      const newLamp: LampiranUrl = {
        kelengkapan_id: docId,
        nama: doc?.nama ?? file.name,
        url,
        uploaded_at: new Date().toISOString(),
      }

      // Update local state only (for preview/download in real-time)
      setUserDocs(prev => prev.map(d => d.id === docId ? { ...d, lamp: newLamp } : d))
      setLampiranUrls(prev => [...prev.filter(l => l.kelengkapan_id !== docId), newLamp])

      // Track pending file for cleanup if cancelled
      setPendingFiles(prev => new Map(prev).set(docId, url))
    } catch (err) {
      console.error('Upload error:', err)
      alert('Gagal mengupload file')
    } finally {
      setUploadProgress(null)
    }
  }

  function addUserDoc() {
    if (!newDocTitle.trim()) return
    const docId = `user-custom-${crypto.randomUUID()}`
    setUserDocs(prev => [...prev, { id: docId, nama: newDocTitle.trim() }])
    // Track as pending new document (needs save to persist)
    setPendingFiles(prev => new Map(prev).set(docId, ''))
    setNewDocTitle('')
    setShowAddForm(false)
  }

  function removeUserDoc(docId: string) {
    const lamp = lampiranUrls.find(l => l.kelengkapan_id === docId)
    setUserDocs(prev => prev.filter(d => d.id !== docId))
    setLampiranUrls(prev => prev.filter(l => l.kelengkapan_id !== docId))
    // Track for cleanup if saved (if it was a pending new file, mark for removal)
    if (lamp?.url) {
      setPendingFiles(prev => new Map(prev).set(docId, lamp.url))
    } else {
      // If no file was uploaded yet, just remove from pending
      setPendingFiles(prev => {
        const next = new Map(prev)
        next.delete(docId)
        return next
      })
    }
  }

  async function handleSave() {
    if (!dok) return
    setSaving(true)

    try {
      // Get final lampiranUrls (only with uploaded files)
      const finalLampirans = lampiranUrls.filter(l =>
        userDocs.some(d => d.id === l.kelengkapan_id && d.lamp)
      )

      const res = await fetch(`/api/dokumen/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lampiranUrls: finalLampirans }),
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Gagal menyimpan')
      }

      // Clear pending
      setPendingFiles(new Map())
      navigate({ to: '/pegawai/dokumen/$id', params: { id } })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  function handleBatal() {
    const supabase = getBrowserClient()
    if (supabase) {
      // Delete newly uploaded files (pending files that are not in original)
      for (const [docId, url] of pendingFiles) {
        if (url) {
          const isNewFile = !originalLampirans.some(l => l.url === url)
          if (isNewFile) {
            supabase.storage.from('dokumen-lampiran').remove([url]).then(({ error }: { error: { message: string } | null }) => {
              if (error) console.warn('[edit] Failed to delete pending file:', url, error.message)
            })
          }
        }
      }
    }

    // Revert to original state
    setUserDocs(() => {
      const userCreated: { id: string; nama: string; lamp?: LampiranUrl }[] = []
      for (const lamp of originalLampirans) {
        if (lamp.kelengkapan_id.startsWith('user-custom-')) {
          userCreated.push({ id: lamp.kelengkapan_id, nama: lamp.nama, lamp })
        }
      }
      return userCreated
    })
    setLampiranUrls(originalLampirans)
    setPendingFiles(new Map())
    navigate({ to: '/pegawai/dokumen/$id', params: { id } })
  }

  if (loading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      </PageLayout>
    )
  }

  if (error) {
    return (
      <PageLayout>
        <div className="text-center py-20">
          <p className="text-sm text-error">{error}</p>
          <Link to="/pegawai/dokumen">
            <Button variant="outline" size="sm" className="mt-4">Kembali</Button>
          </Link>
        </div>
      </PageLayout>
    )
  }

  if (!dok) return null

  return (
    <PageLayout>
      {/* Preview Modal */}
      {previewingDocId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={e => { if (e.target === e.currentTarget) closePreview() }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl flex flex-col max-h-[70vh]">
            <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
              <FileText size={16} className="text-primary shrink-0" />
              <p className="text-sm font-semibold truncate flex-1">{previewFilename}</p>
              <button onClick={closePreview} className="w-7 h-7 rounded-full hover:bg-surface-container-low flex items-center justify-center">
                <XCircle size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-surface-container-low/30">
              {previewLoading ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 size={22} className="animate-spin text-primary" />
                </div>
              ) : previewUrl ? (
                <iframe src={previewUrl} className="w-full h-[calc(70vh-96px)] border-0" />
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
          <Pencil size={12} />
          <Link to="/pegawai/dokumen" className="hover:text-primary">Dokumen</Link>
          <ChevronRight size={10} />
          <span className="text-primary">Edit</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-headline text-xl font-extrabold text-on-surface">{dok.judul}</h2>
            <p className="text-xs text-on-surface-variant mt-1">
              {dok.fungsi_nama ?? ''} &bull; {dok.kegiatan_nama ?? ''}
            </p>
          </div>
          <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-xs font-semibold shrink-0">
            Tersimpan
          </Badge>
        </div>

        {/* Info */}
        <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tahun</p>
              <p className="font-semibold">{dok.tahun}</p>
            </div>
            <div>
              <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tanggal</p>
              <p className="font-semibold">{dok.tanggal ? formatDate(dok.tanggal) : '—'}</p>
            </div>
          </div>
        </div>

        {/* Documents */}
        <div className="bg-white rounded-xl border border-blue-200 overflow-hidden shadow-sm">
          <div className="bg-blue-50/50 px-4 py-3 border-b border-blue-200">
            <h3 className="text-sm font-semibold text-blue-700">Dokumen Pendukung</h3>
            <p className="text-xs text-blue-600 mt-0.5">
              Kelola dokumen pendukung untuk laporan kegiatan ini.
            </p>
          </div>
          <div className="p-4 space-y-3">
            {uploadProgress && (
              <p className="text-xs text-blue-600 animate-pulse">{uploadProgress}</p>
            )}

            {userDocs.length === 0 && !showAddForm && (
              <div className="text-center py-4 text-on-surface-variant text-xs">
                Belum ada dokumen. Klik tombol di bawah untuk menambahkan.
              </div>
            )}

            {userDocs.map(doc => {
              const lamp = lampiranUrls.find(l => l.kelengkapan_id === doc.id)
              return (
                <div key={doc.id} className="flex items-center gap-3 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                  {doc.lamp ? (
                    <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-blue-300 shrink-0" />
                  )}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <FileText size={14} className="text-blue-500 shrink-0" />
                    <span className="text-sm font-medium">{doc.nama}</span>
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">TAMBAHAN ANDA</span>
                  </div>
                  {doc.lamp && (
                    <>
                      <Button size="icon-xs" variant="ghost" onClick={() => handlePreview(doc.id)}>
                        <Eye size={14} />
                      </Button>
                      <Button size="icon-xs" variant="ghost" onClick={() => handleDownload(doc.id)}>
                        <Download size={14} />
                      </Button>
                    </>
                  )}
                  <input
                    key={doc.lamp ? `replace-${doc.lamp.url}` : `upload-${doc.id}`}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                    className="hidden"
                    id={`upload-${doc.id}`}
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      saveLampiran(doc.id, file)
                      e.target.value = ''
                    }}
                  />
                  <label htmlFor={`upload-${doc.id}`} className="cursor-pointer">
                    <span className="inline-flex items-center gap-1 h-6 px-2 rounded text-xs font-medium border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700">
                      <Upload size={12} />{doc.lamp ? 'Ganti' : 'Unggah'}
                    </span>
                  </label>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => removeUserDoc(doc.id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <XCircle size={14} />
                  </Button>
                </div>
              )
            })}

            {showAddForm ? (
              <div className="flex items-center gap-2 p-3 bg-surface-container-low/20 rounded-lg">
                <input
                  type="text"
                  value={newDocTitle}
                  onChange={e => setNewDocTitle(e.target.value)}
                  placeholder="Nama dokumen (misal: Bukti Transfer)"
                  className="flex-1 h-8 px-3 text-sm border border-outline rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                  onKeyDown={e => {
                    if (e.key === 'Enter') addUserDoc()
                    if (e.key === 'Escape') { setShowAddForm(false); setNewDocTitle('') }
                  }}
                  autoFocus
                />
                <Button size="sm" onClick={addUserDoc} disabled={!newDocTitle.trim()}>Simpan</Button>
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

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" onClick={handleBatal} disabled={saving}>Batal</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Simpan Perubahan
          </Button>
        </div>
      </div>
    </PageLayout>
  )
}
