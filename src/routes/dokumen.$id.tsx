import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { DashboardShell } from '#/components/dashboard/DashboardShell'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import type { DokumenRow, LogRow } from '#/lib/dokumen-helpers'
import { getBrowserClient } from '#/lib/supabase-browser'
import {
  FileText,
  ChevronRight,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
} from 'lucide-react'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/dokumen/$id')({
  component: DokumenDetailPage,
})

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Draf', color: 'text-outline' },
  IN_PPK_VALIDATION: { label: 'Validasi PPK', color: 'text-amber-500' },
  IN_BENDAHARA_APPROVAL: { label: 'Persetujuan Bendahara', color: 'text-blue-500' },
  NEED_REVISION: { label: 'Perlu Revisi', color: 'text-error' },
  COMPLETED: { label: 'Selesai', color: 'text-green-500' },
  ARCHIVED: { label: 'Diarsipkan', color: 'text-outline' },
}

const WORKFLOW_STEPS = [
  { key: 'DRAFT', label: 'Draf' },
  { key: 'IN_PPK_VALIDATION', label: 'PPK' },
  { key: 'IN_BENDAHARA_APPROVAL', label: 'Bendahara' },
  { key: 'COMPLETED', label: 'Selesai' },
]

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

function DokumenDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const [dokumen, setDokumen] = useState<DokumenRow | null>(null)
  const [logs, setLogs] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [downloadingIdx, setDownloadingIdx] = useState<number | null>(null)

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    setLoading(true)
    try {
      const supabase = getBrowserClient()
      if (!supabase) { setLoading(false); return }

      // Fetch dokumen
      const res = await fetch(`/api/dokumen/${id}`, { credentials: 'include' })
      if (!res.ok) {
        navigate({ to: '/dokumen/saya' })
        return
      }
      const json = await res.json()
      setDokumen(json.dokumen)

      // Fetch logs
      const { data: logData } = await supabase
        .from('log_aktivitas')
        .select('*')
        .eq('dokumen_id', id)
        .order('timestamp', { ascending: true })
      setLogs(logData ?? [])
    } catch {
      navigate({ to: '/dokumen/saya' })
    } finally {
      setLoading(false)
    }
  }

  async function handleDownload(index: number) {
    setDownloadingIdx(index)
    try {
      const res = await fetch(`/api/dokumen/${id}/download/${index}`, { credentials: 'include' })
      const json = await res.json()
      if (json.signedUrl) {
        window.open(json.signedUrl, '_blank')
      }
    } catch { /* silent */ } finally {
      setDownloadingIdx(null)
    }
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

  function getWorkflowIndex(status: string): number {
    if (status === 'NEED_REVISION') return -1 // special
    if (status === 'ARCHIVED') return WORKFLOW_STEPS.length // past end
    return WORKFLOW_STEPS.findIndex(s => s.key === status)
  }

  if (loading) {
    return (
      <DashboardShell role="PEGAWAI">
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      </DashboardShell>
    )
  }

  if (!dokumen) {
    return (
      <DashboardShell role="PEGAWAI">
        <div className="text-center py-20">
          <p className="text-sm text-on-surface-variant">Dokumen tidak ditemukan.</p>
          <Link href="/dokumen/saya">
            <Button variant="outline" size="sm" className="mt-4">Kembali</Button>
          </Link>
        </div>
      </DashboardShell>
    )
  }

  const statusCfg = STATUS_CONFIG[dokumen.status] ?? { label: dokumen.status, color: 'text-outline' }
  const workflowIdx = getWorkflowIndex(dokumen.status)
  const canResubmit = dokumen.status === 'NEED_REVISION' && dokumen.revision_target === 'USER'

  return (
    <DashboardShell role="PEGAWAI">
      <div className="space-y-6 max-w-3xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
              <FileText size={12} />
              <Link href="/dokumen/saya" className="hover:text-primary">Dokumen</Link>
              <ChevronRight size={10} />
              <span className="text-primary">Detail</span>
            </div>
            <h2 className="font-headline text-xl font-extrabold text-on-surface">
              {dokumen.judul}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className={cn('text-xs font-semibold', statusCfg.color)}>
              {statusCfg.label}
            </Badge>
          </div>
        </div>

        {/* Revision Notes Banner */}
        {dokumen.status === 'NEED_REVISION' && dokumen.revision_notes && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl">
            <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">
                Catatan Revisi dari {dokumen.revision_target === 'USER' ? 'PPK' : 'Bendahara'}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300">{dokumen.revision_notes}</p>
            </div>
          </div>
        )}

        {/* Workflow Timeline */}
        <div className="bg-white rounded-xl border border-outline-variant/30 p-4 shadow-sm">
          <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">Alur Dokumen</p>
          <div className="flex items-center gap-0">
            {WORKFLOW_STEPS.map((step, i) => {
              const isCurrent = step.key === dokumen.status
              const isPast = workflowIdx > i || dokumen.status === 'COMPLETED' || dokumen.status === 'ARCHIVED'
              const isFuture = workflowIdx < i && dokumen.status !== 'COMPLETED' && dokumen.status !== 'ARCHIVED'
              const isRevision = dokumen.status === 'NEED_REVISION' && i === workflowIdx

              return (
                <div key={step.key} className="flex flex-col items-center flex-1 relative">
                  {/* Connector */}
                  {i < WORKFLOW_STEPS.length - 1 && (
                    <div className={cn(
                      'absolute top-4 -right-1/2 w-full h-0.5 z-0',
                      isPast || (dokumen.status === 'COMPLETED' || dokumen.status === 'ARCHIVED') ? 'bg-primary' : 'bg-outline-variant'
                    )} />
                  )}
                  {/* Circle */}
                  <div className={cn(
                    'relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors',
                    isRevision ? 'border-amber-500 bg-amber-100 text-amber-700' :
                    isCurrent ? 'border-primary bg-primary text-primary-foreground' :
                    isPast ? 'border-primary bg-primary text-primary-foreground' :
                    'border-outline-variant bg-background text-outline'
                  )}>
                    {isPast && !isCurrent ? <CheckCircle2 size={14} /> : (i + 1)}
                  </div>
                  {/* Label */}
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
                    onClick={() => handleDownload(i)}
                    disabled={downloadingIdx === i}
                    aria-label="Download"
                  >
                    {downloadingIdx === i ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Download size={14} />
                    )}
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
                    {log.aksi === 'SUBMIT' || log.aksi === 'RESUBMIT' ? (
                      <ArrowRight size={14} className="text-blue-500" />
                    ) : log.aksi.includes('APPROVE') || log.aksi === 'COMPLETED' ? (
                      <CheckCircle2 size={14} className="text-green-500" />
                    ) : (
                      <XCircle size={14} className="text-error" />
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

        {/* Actions */}
        <div className="flex gap-3">
          <Link href="/dokumen/saya">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ChevronRight size={14} className="rotate-180" />Kembali
            </Button>
          </Link>
          {canResubmit && (
            <Link href={`/dokumen/${id}/edit`} className="flex-1">
              <Button size="sm" className="w-full gap-1.5">
                Perbaiki & Ajukan Ulang <ArrowRight size={14} />
              </Button>
            </Link>
          )}
        </div>
      </div>
    </DashboardShell>
  )
}
