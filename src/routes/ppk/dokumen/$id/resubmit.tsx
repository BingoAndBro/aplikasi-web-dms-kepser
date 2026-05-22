import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { ActivityLog } from '#/components/dokumen/ActivityLog'
import { AttachmentEditor, type KelengkapanItem } from '#/components/dokumen/AttachmentEditor'
import { useUnsavedChangesGuard } from '#/hooks/useUnsavedChangesGuard'
import { useNoChangeSubmitGuard } from '#/hooks/useNoChangeSubmitGuard'
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
import { ApiError, apiMutation } from '#/lib/api-mutation'
import { apiFetch } from '#/lib/api-client'

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

type KelengkapanApiItem = KelengkapanItem & {
  kegiatan_id?: string | null
  is_ketua_tim?: boolean
  jenis_permintaan_id?: string | null
  kategori_permintaan_id?: string | null
  detail_permintaan_id?: string | null
}

function matchesCurrentChain(item: KelengkapanApiItem, dokumen: DokumenRow): boolean {
  if (dokumen.detail_permintaan_id) {
    return item.detail_permintaan_id === dokumen.detail_permintaan_id
  }

  if (dokumen.kategori_permintaan_id) {
    return item.kategori_permintaan_id === dokumen.kategori_permintaan_id
      && item.detail_permintaan_id == null
  }

  if (dokumen.jenis_permintaan_id) {
    return item.jenis_permintaan_id === dokumen.jenis_permintaan_id
      && item.kategori_permintaan_id == null
      && item.detail_permintaan_id == null
  }

  return true
}

async function fetchKelengkapanForDokumen(dokumen: DokumenRow): Promise<KelengkapanItem[]> {
  const data = await apiFetch<KelengkapanApiItem[]>('/master-kelengkapan', {
    query: {
      kegiatan_id: dokumen.kegiatan_jenis_id,
      is_ketua_tim: dokumen.is_ketua_tim,
    },
  })

  return data
    .filter(item => matchesCurrentChain(item, dokumen))
    .map(({ id, nama_dokumen, required }) => ({ id, nama_dokumen, required }))
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
  const [attachmentDirty, setAttachmentDirty] = useState(false)
  const [guardEnabled, setGuardEnabled] = useState(true)

  const isDirty = guardEnabled && attachmentDirty
  const { confirmIfDirty } = useUnsavedChangesGuard({ isDirty })
  const { confirmIfNoChange } = useNoChangeSubmitGuard({ isDirty })

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    setLoading(true)
    try {
      const json = await apiFetch<{ dokumen: DokumenRow }>(`/ppk/resubmit/${id}`)
      setDokumen(json.dokumen)
      setLampiranUrls(json.dokumen.lampiran_urls ?? [])
      setDokIsNonMaterial(json.dokumen.is_non_material === true)
      setAttachmentDirty(false)
      setGuardEnabled(true)
      setKelengkapan([])

      // Fetch kelengkapan only for Material documents; Non-Material uses supporting docs only.
      if (json.dokumen.kegiatan_jenis_id && !json.dokumen.is_non_material) {
        try {
          const kelData = await fetchKelengkapanForDokumen(json.dokumen)
          setKelengkapan(kelData)
        } catch (err) {
          console.error('Failed to load kelengkapan for PPK resubmit:', err)
          setKelengkapan([])
        }
      }
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

  async function handleSubmit(data: { lampiranUrls: LampiranUrl[]; nominalRealisasi: number | null }) {
    setSubmitError(null)
    setGuardEnabled(false)

    try {
      // PATCH to save changes
      try {
        await apiMutation(`/api/ppk/resubmit/${id}`, {
          method: 'PATCH',
          body: {
            lampiranUrls: data.lampiranUrls,
            nominalRealisasi: data.nominalRealisasi,
          },
        })
      } catch (err) {
        if (err instanceof ApiError) {
          const payload = err.payload
          const errorMessage = payload && typeof payload === 'object' && 'error' in payload
            ? (payload as { error?: string }).error || 'Gagal menyimpan'
            : 'Gagal menyimpan'

          throw new Error(errorMessage)
        }

        throw err
      }

      // Resubmit. Lampiran sudah diproses oleh PATCH di atas; jangan kirim ulang
      // payload lama karena path pending sudah dipindahkan ke path formal.
      try {
        await apiMutation(`/api/ppk/resubmit/${id}`, {
          method: 'POST',
        })
      } catch (err) {
        if (err instanceof ApiError) {
          const payload = err.payload
          const errorMessage = payload && typeof payload === 'object' && 'error' in payload
            ? (payload as { error?: string }).error || 'Gagal mengajukan ulang'
            : 'Gagal mengajukan ulang'

          throw new Error(errorMessage)
        }

        throw err
      }

      navigate({ to: '/ppk/revisi' })
    } catch (err) {
      setGuardEnabled(true)
      setSubmitError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    }
  }

  function handleGuardedSubmit(data: { lampiranUrls: LampiranUrl[]; nominalRealisasi: number | null }) {
    if (isDirty) {
      return handleSubmit(data)
    }

    return confirmIfDirty(() => confirmIfNoChange(() => handleSubmit(data)))
  }

  function handleCancel() {
    navigate({ to: '/ppk/revisi' })
  }

  async function handleKembalikan() {
    setKembalikanLoading(true)
    let succeeded = false
    try {
      await apiMutation(`/api/ppk/kembalikan/${id}`, { method: 'POST' })
      succeeded = true
      navigate({ to: '/ppk/revisi' })
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        alert(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error ?? 'Gagal'
          : 'Gagal')
        return
      }

      alert('Terjadi kesalahan')
    } finally {
      setKembalikanLoading(false)
      if (!succeeded) {
        setGuardEnabled(true)
      }
    }
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
                if (!confirm('Yakin ingin mengembalikan dokumen ini ke pegawai?')) {
                  return
                }

                setGuardEnabled(false)
                return handleKembalikan()
              }}
              disabled={kembalikanLoading}
            >
              {kembalikanLoading ? <Loader2 size={14} className="animate-spin" /> : <ArrowLeft size={14} />}
              Kembalikan ke Pegawai
            </Button>
          }
          onSubmit={handleGuardedSubmit}
          onCancel={handleCancel}
          onDirtyChange={setAttachmentDirty}
          confirmIfDirty={confirmIfDirty}
        />

        <ActivityLog dokumenId={id} />
      </div>
    </PageLayout>
  )
}
