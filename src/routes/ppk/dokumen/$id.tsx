import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { DashboardShell } from '#/components/dashboard/DashboardShell'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import {
  FileText,
  ChevronRight,
  Download,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  X,
  ClipboardList,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import { getBrowserClient } from '#/lib/supabase-browser'
import type { LampiranUrl } from '#/lib/dokumen-helpers'

export const Route = createFileRoute('/ppk/dokumen/$id')({
  component: PpkDokumenDetailPage,
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DokumenDetail = {
  id: string
  judul: string
  fungsi_id: string
  fungsi_nama: string
  kegiatan_jenis_id: string
  kegiatan_nama: string
  is_ketua_tim: boolean
  status: string
  current_step: string | null
  revision_target: string | null
  revision_notes: string | null
  lampiran_urls: LampiranUrl[]
  tahun: number
  tanggal: string
  created_by: string
  created_at: string
  updated_at: string
}

type LogRow = {
  id: string
  dokumen_id: string
  user_id: string
  aksi: string
  catatan: string | null
  step_urutan: number | null
  timestamp: string
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

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function formatDateTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

function PpkDokumenDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const [dokumen, setDokumen] = useState<DokumenDetail | null>(null)
  const [logs, setLogs] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Reject modal state
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectCatatan, setRejectCatatan] = useState('')
  const [rejectError, setRejectError] = useState<string | null>(null)

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
    setFetchError(null)
    try {
      const res = await fetch(`/api/ppk/dokumen/${id}`, { credentials: 'include' })
      if (!res.ok) {
        const json = await res.json()
        if (res.status === 400 || res.status === 404 || res.status === 403) {
          setFetchError(json.error ?? 'Dokumen tidak dapat diakses')
        } else {
          setFetchError('Gagal mengambil data dokumen')
        }
        setLoading(false)
        return
      }
      const json = await res.json()
      setDokumen(json.dokumen)
      setLogs(json.logs ?? [])
    } catch {
      setFetchError('Terjadi kesalahan saat mengambil data')
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove() {
    if (!confirm('Yakin ingin menyetujui dokumen ini?')) return
    setActionLoading('approve')
    try {
      const res = await fetch(`/api/ppk/dokumen/${id}/approve`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) {
        alert(json.error ?? 'Gagal menyetujui dokumen')
        return
      }
      navigate({ to: '/ppk/inbox' })
    } catch {
      alert('Terjadi kesalahan saat menyetujui dokumen')
    } finally {
      setActionLoading(null)
    }
  }

  function openRejectModal() {
    setRejectCatatan('')
    setRejectError(null)
    setRejectOpen(true)
  }

  function closeRejectModal() {
    setRejectOpen(false)
    setRejectCatatan('')
    setRejectError(null)
  }

  async function handleReject() {
    if (rejectCatatan.trim().length < 10) {
      setRejectError('Catatan minimal 10 karakter')
      return
    }
    setActionLoading('reject')
    try {
      const res = await fetch(`/api/ppk/dokumen/${id}/reject`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catatan: rejectCatatan.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        setRejectError(json.error ?? 'Gagal menolak dokumen')
        return
      }
      navigate({ to: '/ppk/inbox' })
    } catch {
      setRejectError('Terjadi kesalahan saat menolak dokumen')
    } finally {
      setActionLoading(null)
    }
  }

  async function handlePreview(index: number) {
    setPreviewingIdx(index)
    setPreviewUrl(null)
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/ppk/dokumen/${id}/preview/${index}`, { credentials: 'include' })
      const json = await res.json()
      if (json.signedUrl) {
        setPreviewUrl(json.signedUrl)
        setPreviewFilename(json.filename ?? `lampiran-${index + 1}`)
      }
    } catch { /* silent */ } finally {
      setPreviewLoading(false)
    }
  }

  function closePreview() {
    setPreviewingIdx(null)
    setPreviewUrl(null)
    setPreviewFilename('')
  }

  if (loading) {
    return (
      <DashboardShell role="PPK" showHero={false}>
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      </DashboardShell>
    )
  }

  if (fetchError || !dokumen) {
    return (
      <DashboardShell role="PPK" showHero={false}>
        <div className="text-center py-20">
          <AlertTriangle size={32} className="text-error mx-auto mb-3" />
          <p className="text-sm text-on-surface-variant">{fetchError ?? 'Dokumen tidak ditemukan'}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate({ to: '/ppk/inbox' })}>
            Kembali ke Inbox
          </Button>
        </div>
      </DashboardShell>
    )
  }

  const workflowIdx = getWorkflowIndex(dokumen.status)

  return (
    <DashboardShell role="PPK" showHero={false}>
      {/* Preview Modal */}
      {previewingIdx !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) closePreview() }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-2xl mx-4 bg-white dark:bg-surface-container rounded-2xl shadow-2xl flex flex-col max-h-[70vh]">
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

      {/* Reject Modal */}
      {rejectOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) closeRejectModal() }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-md mx-4 bg-white dark:bg-surface-container rounded-2xl shadow-2xl">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant/30">
              <AlertTriangle size={18} className="text-error shrink-0" />
              <p className="font-semibold text-on-surface">Tolak Dokumen</p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1.5">
                  Catatan Revisi <span className="text-error">*</span>
                </label>
                <textarea
                  value={rejectCatatan}
                  onChange={e => { setRejectCatatan(e.target.value); setRejectError(null) }}
                  placeholder="Jelaskan mengapa dokumen ditolak dan apa yang perlu diperbaiki..."
                  rows={4}
                  className={cn(
                    'w-full px-3 py-2 border rounded-lg text-sm text-foreground bg-white dark:bg-background outline-none focus:ring-1 focus:ring-ring resize-none',
                    rejectError ? 'border-error' : 'border-border'
                  )}
                />
                <p className="text-[10px] text-outline mt-1">{rejectCatatan.length}/2000 karakter (min. 10)</p>
                {rejectError && (
                  <p className="text-[10px] text-error mt-1">{rejectError}</p>
                )}
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={closeRejectModal}
                  disabled={!!actionLoading}
                >
                  Batal
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleReject}
                  disabled={!!actionLoading}
                >
                  {actionLoading === 'reject' ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    'Tolak Dokumen'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6 max-w-3xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
              <ClipboardList size={12} />
              <Link to="/ppk" className="hover:text-primary">PPK</Link>
              <ChevronRight size={10} />
              <Link to="/ppk/inbox" className="hover:text-primary">Validasi Dokumen</Link>
              <ChevronRight size={10} />
              <span className="text-primary">Detail</span>
            </div>
            <h2 className="font-headline text-xl font-extrabold text-on-surface">
              {dokumen.judul}
            </h2>
          </div>
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800 text-xs font-semibold shrink-0">
            Validasi PPK
          </Badge>
        </div>

        {/* Workflow Timeline */}
        <div className="bg-white rounded-xl border border-outline-variant/30 p-4 shadow-sm">
          <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">Alur Dokumen</p>
          <div className="flex items-center gap-0">
            {WORKFLOW_STEPS.map((step, i) => {
              const isCurrent = step.key === dokumen.status
              const isPast = workflowIdx > i || dokumen.status === 'COMPLETED'
              const isFuture = workflowIdx < i && dokumen.status !== 'COMPLETED'

              return (
                <div key={step.key} className="flex flex-col items-center flex-1 relative">
                  {i < WORKFLOW_STEPS.length - 1 && (
                    <div className={cn(
                      'absolute top-4 -right-1/2 w-full h-0.5 z-0',
                      isPast ? 'bg-primary' : 'bg-outline-variant'
                    )} />
                  )}
                  <div className={cn(
                    'relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors',
                    isCurrent ? 'border-primary bg-primary text-white' :
                    isPast ? 'border-primary bg-primary text-white' :
                    'border-outline-variant bg-background text-outline'
                  )}>
                    {isPast && !isCurrent ? <CheckCircle2 size={14} /> : (i + 1)}
                  </div>
                  <span className={cn(
                    'mt-2 text-[10px] font-medium text-center',
                    isCurrent ? 'text-primary font-semibold' : isPast ? 'text-primary' : 'text-outline'
                  )}>
                    {step.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Info Grid */}
        <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Fungsi</p>
              <p className="text-sm font-semibold text-on-surface">{dokumen.fungsi_nama ?? '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Kegiatan</p>
              <p className="text-sm font-semibold text-on-surface">{dokumen.kegiatan_nama ?? '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tahun</p>
              <p className="text-sm font-semibold text-on-surface">{dokumen.tahun}</p>
            </div>
            <div>
              <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tanggal</p>
              <p className="text-sm font-semibold text-on-surface">{formatDate(dokumen.tanggal)}</p>
            </div>
            <div>
              <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Peran</p>
              <p className="text-sm font-semibold text-on-surface">{dokumen.is_ketua_tim ? 'Ketua Tim' : 'Anggota'}</p>
            </div>
            <div>
              <p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Diajukan</p>
              <p className="text-sm font-semibold text-on-surface">{formatDate(dokumen.created_at)}</p>
            </div>
          </div>
        </div>

        {/* Lampiran List */}
        <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
          <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">
            Lampiran ({dokumen.lampiran_urls.length})
          </p>
          {dokumen.lampiran_urls.length === 0 ? (
            <p className="text-xs text-on-surface-variant text-center py-4">Belum ada lampiran.</p>
          ) : (
            <div className="space-y-2">
              {dokumen.lampiran_urls.map((lamp, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-surface-container-low/20 rounded-lg">
                  <FileText size={16} className="text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-on-surface truncate">{lamp.nama}</p>
                    <p className="text-[10px] text-outline">{formatDateTime(lamp.uploaded_at)}</p>
                  </div>
                  <Button
                    size="icon-xs" variant="ghost"
                    onClick={() => handlePreview(i)}
                    disabled={previewingIdx === i}
                    aria-label="Pratinjau"
                  >
                    {previewingIdx === i ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Eye size={14} />
                    )}
                  </Button>
                  <Button
                    size="icon-xs" variant="ghost"
                    onClick={() => {
                      // Use the existing download endpoint with 1-hour expiry
                      const link = document.createElement('a')
                      link.href = `/api/dokumen/${id}/download/${i}`
                      link.click()
                    }}
                    aria-label="Download"
                  >
                    <Download size={14} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activity Log */}
        {logs.length > 0 && (
          <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
            <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">Riwayat Aktivitas</p>
            <div className="space-y-3">
              {logs.map(log => (
                <div key={log.id} className="flex items-start gap-3">
                  <div className="mt-1">
                    {log.aksi === 'SUBMIT' || log.aksi === 'RESUBMIT' || log.aksi === 'RESUBMIT_PPK' ? (
                      <ArrowRight size={14} className="text-blue-500" />
                    ) : log.aksi.includes('APPROVE') || log.aksi === 'COMPLETED' ? (
                      <CheckCircle2 size={14} className="text-green-500" />
                    ) : (
                      <X size={14} className="text-error" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-on-surface">{log.aksi}</p>
                    {log.catatan && (
                      <p className="text-[10px] text-on-surface-variant mt-0.5">{log.catatan}</p>
                    )}
                    <p className="text-[10px] text-outline mt-0.5">{formatDateTime(log.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Link to="/ppk/inbox">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ChevronRight size={14} className="rotate-180" />Kembali
            </Button>
          </Link>
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={openRejectModal}
            disabled={!!actionLoading}
          >
            {actionLoading === 'reject' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <X size={14} />
            )}
            Tolak
          </Button>
          <Button
            size="sm"
            className="gap-1.5 flex-1"
            onClick={handleApprove}
            disabled={!!actionLoading}
          >
            {actionLoading === 'approve' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CheckCircle2 size={14} />
            )}
            Setujui
          </Button>
        </div>
      </div>
    </DashboardShell>
  )
}