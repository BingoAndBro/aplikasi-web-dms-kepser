import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { ActivityLog } from '#/components/dokumen/ActivityLog'
import { AttachmentEditor, type KelengkapanItem } from '#/components/dokumen/AttachmentEditor'
import { getBrowserClient } from '#/lib/supabase-browser'
import {
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ArrowLeft,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import type { DokumenRow, LampiranUrl } from '#/lib/dokumen-helpers'
import { formatDate } from '#/lib/utils/format'

export const Route = createFileRoute('/ppk/dokumen/$id/resubmit')({
  component: PpkResubmitPage,
})

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


function PpkResubmitPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const [dokumen, setDokumen] = useState<DokumenRow | null>(null)
  const [lampiranUrls, setLampiranUrls] = useState<LampiranUrl[]>([])
  const [kelengkapan, setKelengkapan] = useState<KelengkapanItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [kembalikanLoading, setKembalikanLoading] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [dokIsNonMaterial, setDokIsNonMaterial] = useState(false)

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    setLoading(true)
    try {
      const supabase = getBrowserClient()
      const res = await fetch(`/api/ppk/resubmit/${id}`, { credentials: 'include' })
      if (!res.ok) { const json = await res.json(); setFetchError(json.error ?? 'Gagal'); setLoading(false); return }
      const json = await res.json()
      setDokumen(json.dokumen)
      setLampiranUrls(json.dokumen.lampiran_urls ?? [])
      setDokIsNonMaterial(json.dokumen.is_non_material === true)

      // Fetch kelengkapan from master_kelengkapan_dokumen (only for Material documents)
      if (supabase && json.dokumen.kegiatan_jenis_id && !json.dokumen.is_non_material) {
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

  async function handleSubmit(data: { lampiranUrls: LampiranUrl[]; nominalRealisasi: number | null }) {
    setSubmitError(null)

    try {
      // PATCH to save changes
      const patchRes = await fetch(`/api/ppk/resubmit/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lampiranUrls: data.lampiranUrls,
          nominalRealisasi: data.nominalRealisasi,
        }),
      })

      if (!patchRes.ok) {
        const json = await patchRes.json()
        throw new Error(json.error || 'Gagal menyimpan')
      }

      // Resubmit. Lampiran sudah diproses oleh PATCH di atas; jangan kirim ulang
      // payload lama karena path pending sudah dipindahkan ke path formal.
      const submitRes = await fetch(`/api/ppk/resubmit/${id}`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!submitRes.ok) {
        const json = await submitRes.json()
        throw new Error(json.error || 'Gagal mengajukan ulang')
      }

      navigate({ to: '/ppk/revisi' })
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    }
  }

  function handleCancel() {
    navigate({ to: '/ppk/revisi' })
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

  const workflowIdx = getWorkflowIndex(dokumen.status)

  return (
    <PageLayout>
      <div className="max-w-3xl mx-auto space-y-6">

        <h2 className="font-headline text-xl font-extrabold text-on-surface">{dokumen.judul}</h2>

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
                  <div className={cn('relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors', isCurrent || showAsRevision ? 'border-primary bg-primary text-white' : isPast ? 'border-primary bg-primary text-white' : 'border-outline-variant bg-background text-outline')}>
                    {showAsRevision ? <AlertTriangle size={14} /> : isPast && !isCurrent ? <CheckCircle2 size={14} /> : i + 1}
                  </div>
                  <span className={cn('mt-2 text-[10px] font-medium text-center', isCurrent || showAsRevision ? 'text-primary font-semibold' : isPast ? 'text-primary' : 'text-outline')}>{step.label}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Revision notes */}
        {dokumen.revision_notes && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-700 mb-1">Catatan dari Bendahara</p>
              <p className="text-xs text-amber-700">{dokumen.revision_notes}</p>
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
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tanggal</p><p className="text-sm font-semibold text-on-surface">{dokumen.tanggal ? formatDate(dokumen.tanggal) : '—'}</p></div>
          </div>
        </div>

        {/* Submit error */}
        {submitError && (
          <div className="bg-error/10 border border-error/20 rounded-lg p-4 flex items-start gap-2">
            <AlertTriangle size={16} className="text-error mt-0.5" />
            <p className="text-sm text-error">{submitError}</p>
          </div>
        )}

        {/* Attachment Editor */}
        <AttachmentEditor
          dokumen={dokumen}
          lampiranUrls={lampiranUrls}
          kelengkapan={kelengkapan}
          isNonMaterial={dokIsNonMaterial}
          nominalValue={dokumen.nominal_realisasi}
          submitLabel="Resubmit ke Bendahara"
          extraActions={
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                if (confirm('Apakah Anda yakin ingin mengembalikan dokumen ini ke pegawai?\n\nPerubahan yang belum disimpan akan hilang.')) {
                  handleKembalikan()
                }
              }}
              disabled={kembalikanLoading}
            >
              {kembalikanLoading ? <Loader2 size={14} className="animate-spin" /> : <ArrowLeft size={14} />}
              Kembalikan ke Pegawai
            </Button>
          }
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />

        <ActivityLog dokumenId={id} />
      </div>
    </PageLayout>
  )
}
