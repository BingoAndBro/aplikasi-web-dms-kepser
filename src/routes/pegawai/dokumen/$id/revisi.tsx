import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { Skeleton } from '#/components/ui/skeleton'
import { ActivityLog } from '#/components/dokumen/ActivityLog'
import { AttachmentEditor, type KelengkapanItem } from '#/components/dokumen/AttachmentEditor'
import {
  FileEdit,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { getBrowserClient } from '#/lib/supabase-browser'
import type { DokumenRow, LampiranUrl } from '#/lib/dokumen-helpers'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/pegawai/dokumen/$id/revisi')({
  component: DokumenRevisiPage,
})

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
// Main page
// ---------------------------------------------------------------------------

function DokumenRevisiPage() {
  const { id } = Route.useParams()
  const [dok, setDok] = useState<DokumenRow | null>(null)
  const [kelengkapan, setKelengkapan] = useState<KelengkapanItem[]>([])
  const [lampiranUrls, setLampiranUrls] = useState<LampiranUrl[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isNonMaterial, setIsNonMaterial] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => { fetchData() }, [id])

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

      // Check if Non-Material
      const nonMaterial = dokumen.is_non_material === true ||
        (!dokumen.jenis_permintaan_id && !dokumen.kategori_permintaan_id && !dokumen.detail_permintaan_id)
      setIsNonMaterial(nonMaterial)

      // Build kelengkapan query
      let query = supabase
        .from('master_kelengkapan_dokumen')
        .select('id, nama_dokumen, required, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id')
        .eq('kegiatan_id', dokumen.kegiatan_jenis_id)
        .eq('is_ketua_tim', dokumen.is_ketua_tim)

      if (dokumen.detail_permintaan_id) {
        query = query.eq('detail_permintaan_id', dokumen.detail_permintaan_id)
      } else if (dokumen.kategori_permintaan_id) {
        query = query.eq('kategori_permintaan_id', dokumen.kategori_permintaan_id).is('detail_permintaan_id', null)
      } else if (dokumen.jenis_permintaan_id) {
        query = query.eq('jenis_permintaan_id', dokumen.jenis_permintaan_id).is('kategori_permintaan_id', null).is('detail_permintaan_id', null)
      }

      const { data: kelData } = await query
      if (kelData) setKelengkapan(kelData as KelengkapanItem[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(data: { lampiranUrls: LampiranUrl[]; nominalRealisasi: number | null }) {
    setSubmitError(null)

    try {
      // PATCH to save changes
      const patchRes = await fetch(`/api/dokumen/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lampiranUrls: data.lampiranUrls, nominalRealisasi: data.nominalRealisasi }),
      })

      if (!patchRes.ok) {
        const json = await patchRes.json()
        throw new Error(json.error || 'Gagal menyimpan')
      }

      // Submit to next workflow step
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
    }
  }

  function handleCancel() {
    window.location.href = '/pegawai/dokumen'
  }

  if (loading) return (
    <PageLayout>
      <div className="space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48" />
      </div>
    </PageLayout>
  )

  if (error) return (
    <PageLayout>
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
    </PageLayout>
  )

  if (!dok) return null

  const workflowIdx = getWorkflowIndex(dok.status)

  return (
    <PageLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest">
          <FileEdit size={12} />
          <Link to="/pegawai/dokumen" className="hover:text-primary">Dokumen</Link>
          <ChevronRight size={10} />
          <span className="text-primary">Revisi</span>
        </div>

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
          </div>
        </div>

        {/* Submit error */}
        {submitError && (
          <div className="bg-error/10 border border-error/20 rounded-lg p-4 flex items-start gap-2">
            <AlertCircle size={16} className="text-error mt-0.5" />
            <p className="text-sm text-error">{submitError}</p>
          </div>
        )}

        {/* Attachment Editor */}
        <AttachmentEditor
          dokumen={dok}
          lampiranUrls={lampiranUrls}
          kelengkapan={isNonMaterial ? [] : kelengkapan}
          isNonMaterial={isNonMaterial}
          nominalValue={dok.nominal_realisasi}
          submitLabel={isNonMaterial ? 'Ajukan Ulang ke Ketua Tim' : 'Ajukan Ulang ke PPK'}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />

        {/* Activity Log */}
        <ActivityLog dokumenId={id} />
      </div>
    </PageLayout>
  )
}
