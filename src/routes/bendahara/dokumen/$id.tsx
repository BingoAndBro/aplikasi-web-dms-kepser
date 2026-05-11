import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { ActivityLog } from '#/components/dokumen/ActivityLog'
import { AttachmentViewer } from '#/components/dokumen/AttachmentViewer'
import {
  ChevronRight, AlertTriangle,
  CheckCircle2, Loader2, X, Banknote,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import { formatDate } from '#/lib/utils/format'
import { ApiError, apiMutation } from '#/lib/api-mutation'

export const Route = createFileRoute('/bendahara/dokumen/$id')({ component: BendaharaDokumenDetailPage })

type DokumenDetail = {
  id: string; judul: string; fungsi_nama: string; kegiatan_nama: string
  is_ketua_tim: boolean; status: string; lampiran_urls: any[]
  tahun: number; tanggal: string; created_by: string; created_at: string
  revision_notes?: string
  nominal_realisasi: number | null
  is_non_material?: boolean
  jenis_permintaan_id?: string | null
  kategori_permintaan_id?: string | null
  detail_permintaan_id?: string | null
  jenis_permintaan_nama?: string
  kategori_permintaan_nama?: string
  detail_permintaan_nama?: string
  jenis_dokumen_nama?: string
  jenis_dokumen_id?: string | null
}

const WORKFLOW_STEPS = [
  { key: 'DRAFT', label: 'Draf' },
  { key: 'IN_PPK_VALIDATION', label: 'PPK' },
  { key: 'IN_BENDAHARA_APPROVAL', label: 'Bendahara' },
  { key: 'COMPLETED', label: 'Selesai' },
]
function getWorkflowIdx(status: string) { return WORKFLOW_STEPS.findIndex(s => s.key === status) }

function BendaharaDokumenDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const [dokumen, setDokumen] = useState<DokumenDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectCatatan, setRejectCatatan] = useState('')
  const [rejectError, setRejectError] = useState<string | null>(null)

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    setLoading(true)
    try {
      const res = await fetch(`/api/bendahara/dokumen/${id}`, { credentials: 'include' })
      if (!res.ok) { const json = await res.json(); setFetchError(json.error ?? 'Gagal'); setLoading(false); return }
      const json = await res.json()
      setDokumen(json.dokumen)
    } catch { setFetchError('Terjadi kesalahan') } finally { setLoading(false) }
  }

  async function handleApprove() {
    if (!confirm('Yakin ingin menyetujui pencairan dokumen ini?')) return
    setActionLoading('approve')
    try {
      await apiMutation(`/api/bendahara/dokumen/${id}/approve`, { method: 'POST' })
      navigate({ to: '/bendahara/selesai' })
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        alert(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error ?? 'Gagal'
          : 'Gagal')
        return
      }

      alert('Terjadi kesalahan')
    } finally { setActionLoading(null) }
  }

  async function handleReject() {
    if (rejectCatatan.trim().length < 10) { setRejectError('Catatan minimal 10 karakter'); return }
    setActionLoading('reject')
    try {
      await apiMutation(`/api/bendahara/dokumen/${id}/reject`, {
        method: 'POST',
        body: { catatan: rejectCatatan.trim() },
      })
      navigate({ to: '/bendahara/ditolak' })
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        setRejectError(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error ?? 'Gagal'
          : 'Gagal')
        return
      }

      setRejectError('Terjadi kesalahan')
    } finally { setActionLoading(null) }
  }

  if (loading) return <PageLayout><div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-primary" /></div></PageLayout>
  if (fetchError) return <PageLayout><div className="text-center py-20"><AlertTriangle size={32} className="text-error mx-auto mb-3" /><p className="text-sm text-on-surface-variant">{fetchError}</p><Button variant="outline" size="sm" className="mt-4" onClick={() => navigate({ to: '/bendahara/inbox' })}>Kembali</Button></div></PageLayout>
  if (!dokumen) return <PageLayout><div className="text-center py-20"><AlertTriangle size={32} className="text-error mx-auto mb-3" /><p className="text-sm text-on-surface-variant">Dokumen tidak ditemukan atau tidak dalam tahap persetujuan</p><Button variant="outline" size="sm" className="mt-4" onClick={() => navigate({ to: '/bendahara/inbox' })}>Kembali ke Inbox</Button></div></PageLayout>

  const workflowIdx = getWorkflowIdx(dokumen.status)

  return (
    <PageLayout>
      {rejectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) { setRejectOpen(false); setRejectCatatan(''); setRejectError(null) } }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl">
            <div className="flex items-center gap-3 px-5 py-4 border-b">
              <AlertTriangle size={18} className="text-error shrink-0" />
              <p className="font-semibold text-on-surface">Tolak Dokumen</p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5">Catatan Penolakan <span className="text-error">*</span></label>
                <textarea value={rejectCatatan} onChange={e => { setRejectCatatan(e.target.value); setRejectError(null) }} rows={4}
                  placeholder="Jelaskan mengapa dokumen ditolak..."
                  className={cn('w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-1 focus:ring-ring resize-none', rejectError ? 'border-error' : 'border-border')} />
                <p className="text-[10px] text-outline mt-1">{rejectCatatan.length}/2000 karakter (min. 10)</p>
                {rejectError && <p className="text-[10px] text-error mt-1">{rejectError}</p>}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => { setRejectOpen(false); setRejectCatatan(''); setRejectError(null) }} disabled={!!actionLoading}>Batal</Button>
                <Button variant="destructive" className="flex-1" onClick={handleReject} disabled={!!actionLoading}>
                  {actionLoading === 'reject' ? <Loader2 size={14} className="animate-spin" /> : 'Tolak Dokumen'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
              <Banknote size={12} />
              <Link to="/bendahara" className="hover:text-primary">Bendahara</Link>
              <ChevronRight size={10} />
              <Link to="/bendahara/inbox" className="hover:text-primary">Persetujuan</Link>
              <ChevronRight size={10} />
              <span className="text-primary">Detail</span>
            </div>
            <h2 className="font-headline text-xl font-extrabold text-on-surface">{dokumen.judul}</h2>
          </div>
          <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs font-semibold shrink-0">
            Persetujuan Bendahara
          </Badge>
        </div>

        {/* Workflow */}
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
                  <div className={cn('relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2', isCurrent || showAsRevision ? 'border-primary bg-primary text-white' : isPast ? 'border-primary bg-primary text-white' : 'border-outline-variant bg-background text-outline')}>
                    {showAsRevision ? <AlertTriangle size={14} /> : isPast && !isCurrent ? <CheckCircle2 size={14} /> : i + 1}
                  </div>
                  <span className={cn('mt-2 text-[10px] font-medium text-center', isCurrent || showAsRevision ? 'text-primary font-semibold' : isPast ? 'text-primary' : 'text-outline')}>{step.label}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Revision Notes Banner */}
        {dokumen.status === 'NEED_REVISION' && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-700 mb-1">Catatan Revisi dari Bendahara</p>
              <p className="text-xs text-amber-700">{dokumen.revision_notes || 'Tidak ada catatan'}</p>
            </div>
          </div>
        )}

        {/* Info Grid */}
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
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tanggal</p><p className="text-sm font-semibold text-on-surface">{formatDate(dokumen.tanggal)}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Peran</p><p className="text-sm font-semibold text-on-surface">{dokumen.is_ketua_tim ? 'Ketua Tim' : 'Anggota'}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Diajukan</p><p className="text-sm font-semibold text-on-surface">{formatDate(dokumen.created_at)}</p></div>
            {dokumen.nominal_realisasi !== null && dokumen.nominal_realisasi !== undefined && (
              <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Nominal Realisasi</p><p className="text-sm font-semibold text-on-surface">Rp {dokumen.nominal_realisasi.toLocaleString('id-ID')}</p></div>
            )}
          </div>
        </div>

        {/* Lampiran */}
        <AttachmentViewer dokumen={dokumen as any} lampiranUrls={dokumen.lampiran_urls} apiType="bendahara" />

        {/* Activity Log */}
        <ActivityLog dokumenId={id} />

        {/* Actions - Only show buttons for IN_BENDAHARA_APPROVAL status */}
        {dokumen.status === 'IN_BENDAHARA_APPROVAL' && (
          <div className="flex gap-3">
            <Link to="/bendahara/inbox"><Button variant="outline" size="sm" className="gap-1.5"><ChevronRight size={14} className="rotate-180" />Kembali</Button></Link>
            <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => { setRejectCatatan(''); setRejectError(null); setRejectOpen(true) }} disabled={!!actionLoading}>
              {actionLoading === 'reject' ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}Tolak
            </Button>
            <Button size="sm" className="gap-1.5 flex-1" onClick={handleApprove} disabled={!!actionLoading}>
              {actionLoading === 'approve' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}Setujui Pencairan
            </Button>
          </div>
        )}
        {dokumen.status === 'COMPLETED' && (
          <div className="flex gap-3">
            <Link to="/bendahara/selesai"><Button variant="outline" size="sm" className="gap-1.5"><ChevronRight size={14} className="rotate-180" />Kembali</Button></Link>
          </div>
        )}
        {dokumen.status === 'NEED_REVISION' && (
          <div className="flex gap-3">
            <Link to="/bendahara/ditolak"><Button variant="outline" size="sm" className="gap-1.5"><ChevronRight size={14} className="rotate-180" />Kembali</Button></Link>
          </div>
        )}
      </div>
    </PageLayout>
  )
}
