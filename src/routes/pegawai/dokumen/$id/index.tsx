import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { ActivityLog } from '#/components/dokumen/ActivityLog'
import { AttachmentViewer } from '#/components/dokumen/AttachmentViewer'
import {
  FileText,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ClipboardList,
  Pencil,
  Trash2,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import { formatDate } from '#/lib/utils/format'
import { ApiError, apiFetch } from '#/lib/api-client'
import { apiMutation } from '#/lib/api-mutation'

export const Route = createFileRoute('/pegawai/dokumen/$id/')({
  component: DokumenDetailPage,
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DokumenDetail = {
  id: string
  judul: string
  fungsi_nama: string
  kegiatan_nama: string
  is_ketua_tim: boolean
  status: string
  revision_notes: string | null
  revision_target: string | null
  lampiran_urls: any[]
  tahun: number
  tanggal: string
  created_at: string
  created_by: string
  is_non_material: boolean
  nominal_realisasi: number | null
  keterangan_detail: string | null
  jenis_permintaan_id?: string | null
  kategori_permintaan_id?: string | null
  detail_permintaan_id?: string | null
  jenis_permintaan_nama?: string
  kategori_permintaan_nama?: string
  detail_permintaan_nama?: string
  jenis_dokumen_nama?: string
  jenis_dokumen_id?: string | null
}

// ---------------------------------------------------------------------------
// Workflow config
// ---------------------------------------------------------------------------

const WORKFLOW_STEPS_MATERIAL = [
  { key: 'DRAFT', label: 'Draf' },
  { key: 'IN_PPK_VALIDATION', label: 'PPK' },
  { key: 'IN_BENDAHARA_APPROVAL', label: 'PPSPM' },
  { key: 'COMPLETED', label: 'Selesai' },
]

const WORKFLOW_STEPS_NON_MATERIAL = [
  { key: 'DRAFT', label: 'Draf' },
  { key: 'TERSIMPAN', label: 'Tersimpan' },
]

function getWorkflowIndexMaterial(status: string): number {
  if (status === 'NEED_REVISION') return -1
  return WORKFLOW_STEPS_MATERIAL.findIndex(s => s.key === status)
}

function getWorkflowIndexNonMaterial(status: string): number {
  return WORKFLOW_STEPS_NON_MATERIAL.findIndex(s => s.key === status)
}


// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function DokumenDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const [dok, setDok] = useState<DokumenDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    setLoading(true)
    try {
      const json = await apiFetch<{ dokumen: DokumenDetail }>(`/dokumen/${id}`)
      setDok(json.dokumen)
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        setFetchError(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error ?? 'Gagal'
          : 'Gagal')
        return
      }

      setFetchError('Terjadi kesalahan')
    } finally { setLoading(false) }
  }

  async function handleDelete() {
    if (!confirm('Yakin ingin menghapus dokumen ini?')) return
    setDeleting(true)
    try {
      await apiMutation(`/api/dokumen/${id}`, {
        method: 'DELETE',
      })
      navigate({ to: '/pegawai/dokumen' })
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        alert(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error || 'Gagal menghapus dokumen'
          : 'Gagal menghapus dokumen')
        return
      }

      alert('Gagal menghapus dokumen')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <PageLayout><div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-primary" /></div></PageLayout>
  if (fetchError) return <PageLayout><div className="text-center py-20"><AlertTriangle size={32} className="text-error mx-auto mb-3" /><p className="text-sm text-on-surface-variant">{fetchError}</p><Link to="/pegawai/dokumen"><Button variant="outline" size="sm" className="mt-4">Kembali</Button></Link></div></PageLayout>
  if (!dok) return <PageLayout><div className="text-center py-20"><AlertTriangle size={32} className="text-error mx-auto mb-3" /><p className="text-sm text-on-surface-variant">Dokumen tidak ditemukan</p><Link to="/pegawai/dokumen"><Button variant="outline" size="sm" className="mt-4">Kembali</Button></Link></div></PageLayout>

  // Check if Non-Material document
  const isNonMaterial = dok.is_non_material === true ||
    (dok.is_non_material === undefined && !dok.jenis_permintaan_id && !dok.kategori_permintaan_id && !dok.detail_permintaan_id)

  const workflowSteps = isNonMaterial ? WORKFLOW_STEPS_NON_MATERIAL : WORKFLOW_STEPS_MATERIAL
  const workflowIdx = isNonMaterial
    ? getWorkflowIndexNonMaterial(dok.status)
    : getWorkflowIndexMaterial(dok.status)

  return (
    <PageLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
              <ClipboardList size={12} />
              <Link to="/pegawai/dokumen" className="hover:text-primary">Dokumen</Link>
              <ChevronRight size={10} />
              <span className="text-primary">Detail</span>
            </div>
            <h2 className="font-headline text-xl font-extrabold text-on-surface">{dok.judul}</h2>
          </div>
          <Badge className={cn('text-xs font-semibold shrink-0',
            dok.status === 'DRAFT' ? 'bg-gray-100 text-gray-700 border-gray-200' :
            dok.status === 'IN_PPK_VALIDATION' ? 'bg-amber-100 text-amber-800 border-amber-200' :
            dok.status === 'IN_BENDAHARA_APPROVAL' ? 'bg-blue-100 text-blue-800 border-blue-200' :
            dok.status === 'NEED_REVISION' ? 'bg-red-100 text-red-800 border-red-200' :
            dok.status === 'TERSIMPAN' ? 'bg-purple-100 text-purple-800 border-purple-200' :
            'bg-green-100 text-green-800 border-green-200'
          )}>
            {dok.status === 'DRAFT' ? 'Draf' :
             dok.status === 'IN_PPK_VALIDATION' ? 'Validasi PPK' :
             dok.status === 'IN_BENDAHARA_APPROVAL' ? 'Persetujuan PPSPM' :
             dok.status === 'NEED_REVISION' ? 'Perlu Revisi' :
             dok.status === 'TERSIMPAN' ? 'Tersimpan' :
             'Selesai'}
          </Badge>
        </div>

        {/* Workflow - berbeda untuk Non-Material */}
        <div className="bg-white rounded-xl border border-outline-variant/30 p-4 shadow-sm">
          <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">
            {isNonMaterial ? 'Status Dokumen' : 'Alur Dokumen'}
          </p>
          <div className="flex items-center gap-0">
            {workflowSteps.map((step, i) => {
              const isCurrent = step.key === dok.status
              const isPast = workflowIdx > i || dok.status === 'TERSIMPAN' || dok.status === 'COMPLETED'
              const showAsRevision = dok.status === 'NEED_REVISION' && step.key === 'IN_PPK_VALIDATION'
              return (
                <div key={step.key} className="flex flex-col items-center flex-1 relative">
                  {i < workflowSteps.length - 1 && <div className={cn('absolute top-4 -right-1/2 w-full h-0.5 z-0', isPast ? 'bg-primary' : 'bg-outline-variant')} />}
                  <div className={cn('relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2',
                    isCurrent || showAsRevision ? 'border-primary bg-primary text-white' :
                    isPast ? 'border-primary bg-primary text-white' :
                    'border-outline-variant bg-background text-outline')}>
                    {showAsRevision ? <AlertTriangle size={14} /> : isPast && !isCurrent ? <CheckCircle2 size={14} /> : i + 1}
                  </div>
                  <span className={cn('mt-2 text-[10px] font-medium text-center',
                    isCurrent || showAsRevision ? 'text-primary font-semibold' : isPast ? 'text-primary' : 'text-outline')}>{step.label}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Revision Notes Banner */}
        {dok.status === 'NEED_REVISION' && dok.revision_notes && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-700 mb-1">Catatan Revisi dari {dok.revision_target === 'USER' ? 'PPK' : 'PPSPM'}</p>
              <p className="text-xs text-amber-700">{dok.revision_notes}</p>
            </div>
          </div>
        )}

        {/* Info Grid */}
        <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
          <div className="grid grid-cols-2 gap-4">
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Fungsi</p><p className="text-sm font-semibold text-on-surface">{dok.fungsi_nama ?? '—'}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Kegiatan</p><p className="text-sm font-semibold text-on-surface">{dok.kegiatan_nama ?? '—'}</p></div>
            {dok.jenis_permintaan_id && (
              <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Jenis Permintaan</p><p className="text-sm font-semibold text-on-surface">{dok.jenis_permintaan_nama ?? '—'}</p></div>
            )}
            {dok.kategori_permintaan_id && (
              <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Kategori Permintaan</p><p className="text-sm font-semibold text-on-surface">{dok.kategori_permintaan_nama ?? '—'}</p></div>
            )}
            {dok.detail_permintaan_id && (
              <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Detail Permintaan</p><p className="text-sm font-semibold text-on-surface">{dok.detail_permintaan_nama ?? '—'}</p></div>
            )}
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tahun</p><p className="text-sm font-semibold text-on-surface">{dok.tahun}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tanggal</p><p className="text-sm font-semibold text-on-surface">{dok.tanggal ? formatDate(dok.tanggal) : '—'}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Peran</p><p className="text-sm font-semibold text-on-surface">{dok.is_ketua_tim ? 'Ketua Tim' : 'Anggota'}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Diajukan</p><p className="text-sm font-semibold text-on-surface">{dok.created_at ? formatDate(dok.created_at) : '—'}</p></div>
            {!isNonMaterial && dok.nominal_realisasi !== null && dok.nominal_realisasi !== undefined && (
              <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Nominal Realisasi</p><p className="text-sm font-semibold text-on-surface">Rp {(typeof dok.nominal_realisasi === 'number' ? dok.nominal_realisasi : parseFloat(dok.nominal_realisasi)).toLocaleString('id-ID')}</p></div>
            )}
            {dok.keterangan_detail && (
              <div className="col-span-2"><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Keterangan Detail</p><p className="text-sm text-on-surface whitespace-pre-wrap">{dok.keterangan_detail}</p></div>
            )}
          </div>
        </div>

        {/* Lampiran */}
        <AttachmentViewer dokumen={dok as any} lampiranUrls={dok.lampiran_urls} />

        {/* Activity Log */}
        <ActivityLog dokumenId={id} />

        {/* Actions */}
        <div className="flex gap-3">
          <Link to="/pegawai/dokumen"><Button variant="outline" size="sm" className="gap-1.5"><ChevronRight size={14} className="rotate-180" />Kembali</Button></Link>
          {dok.status === 'NEED_REVISION' && dok.revision_target === 'USER' && !isNonMaterial && (
            <Link to="/pegawai/dokumen/$id/revisi" params={{ id }}><Button size="sm" className="gap-1.5 flex-1"><FileText size={14} />Revisi Dokumen</Button></Link>
          )}
          {/* Edit & Delete untuk Non-Material tersimpan */}
          {isNonMaterial && dok.status === 'TERSIMPAN' && (
            <>
              <Link to="/pegawai/dokumen/$id/edit" params={{ id }}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Pencil size={14} />Edit
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-error hover:bg-error/10"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Hapus
              </Button>
            </>
          )}
        </div>
      </div>
    </PageLayout>
  )
}
