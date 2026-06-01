import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import {
  PegawaiFieldCard,
  PegawaiPageHeader,
  PegawaiPanel,
} from '#/components/pegawai/PegawaiPagePrimitives'
import { Button } from '#/components/ui/button'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { StatusBadge } from '#/components/ui/StatusBadge'
import { ActivityLog } from '#/components/dokumen/ActivityLog'
import { AttachmentEditor, type KelengkapanItem } from '#/components/dokumen/AttachmentEditor'
import { useUnsavedChangesGuard } from '#/hooks/useUnsavedChangesGuard'
import { useNoChangeSubmitGuard } from '#/hooks/useNoChangeSubmitGuard'
import {
  FileEdit,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import type { DokumenRow, LampiranUrl } from '#/lib/dokumen-helpers'
import { cn } from '#/lib/utils'
import { formatDate } from '#/lib/utils/format'
import { ApiError, apiMutation } from '#/lib/api-mutation'
import { apiFetch } from '#/lib/api-client'

export const Route = createFileRoute('/pegawai/dokumen/$id/revisi')({
  component: DokumenRevisiPage,
})

const WORKFLOW_STEPS = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'IN_PPK_VALIDATION', label: 'PPK' },
  { key: 'IN_BENDAHARA_APPROVAL', label: 'PPSPM' },
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

function DokumenRevisiPage() {
  const { id } = Route.useParams()
  const [dok, setDok] = useState<DokumenRow | null>(null)
  const [kelengkapan, setKelengkapan] = useState<KelengkapanItem[]>([])
  const [lampiranUrls, setLampiranUrls] = useState<LampiranUrl[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isNonMaterial, setIsNonMaterial] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [attachmentDirty, setAttachmentDirty] = useState(false)
  const [guardEnabled, setGuardEnabled] = useState(true)

  const isDirty = guardEnabled && attachmentDirty
  const { confirmIfDirty } = useUnsavedChangesGuard({ isDirty })
  const { confirmIfNoChange } = useNoChangeSubmitGuard({ isDirty })

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      const json = await apiFetch<{ dokumen: DokumenRow }>(`/dokumen/${id}`)
      const dokumen = json.dokumen as DokumenRow

      if (dokumen.status !== 'NEED_REVISION' || dokumen.revision_target !== 'USER') {
        setError('Dokumen ini tidak bisa direvisi')
        setLoading(false)
        return
      }

      setDok(dokumen)
      setLampiranUrls(dokumen.lampiran_urls as LampiranUrl[] ?? [])
      setAttachmentDirty(false)
      setGuardEnabled(true)

      const nonMaterial = dokumen.is_non_material === true ||
        (!dokumen.jenis_permintaan_id && !dokumen.kategori_permintaan_id && !dokumen.detail_permintaan_id)
      setIsNonMaterial(nonMaterial)
      setKelengkapan([])

      if (!nonMaterial && dokumen.kegiatan_jenis_id) {
        try {
          const kelData = await fetchKelengkapanForDokumen(dokumen)
          setKelengkapan(kelData)
        } catch (err) {
          console.error('Failed to load kelengkapan for revisi:', err)
          setKelengkapan([])
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        setError(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error || `HTTP ${err.status}`
          : `HTTP ${err.status}`)
        return
      }

      setError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(data: { lampiranUrls: LampiranUrl[]; nominalRealisasi: number | null }) {
    setSubmitError(null)
    setGuardEnabled(false)

    try {
      try {
        await apiMutation(`/api/dokumen/${id}`, {
          method: 'PATCH',
          body: { lampiranUrls: data.lampiranUrls, nominalRealisasi: data.nominalRealisasi },
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

      try {
        await apiMutation(`/api/dokumen/${id}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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

      window.location.href = '/pegawai/dokumen'
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
    window.location.href = '/pegawai/revisi'
  }

  if (loading) {
    return (
      <PageLayout>
        <div className="mx-auto max-w-4xl">
          <LoadingState variant="page" label="Memuat revisi dokumen" />
        </div>
      </PageLayout>
    )
  }

  if (error) {
    return (
      <PageLayout>
        <ErrorState
          title="Tidak bisa merevisi"
          description={error}
          variant="page"
          action={<Link to="/pegawai/revisi"><Button variant="outline" size="sm">Kembali ke Daftar</Button></Link>}
        />
      </PageLayout>
    )
  }

  if (!dok) return null

  const workflowIdx = getWorkflowIndex(dok.status)

  return (
    <PageLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <PegawaiPageHeader
          eyebrow={
            <>
              <FileEdit size={12} />
              <Link to="/pegawai/revisi" className="hover:text-orange-900">Revisi Dokumen</Link>
              <ChevronRight size={10} />
              <span>Perbaiki</span>
            </>
          }
          title={dok.judul}
          description="Periksa catatan revisi, sesuaikan lampiran atau nominal jika diperlukan, lalu ajukan ulang dokumen."
          actions={<StatusBadge status={dok.status} className="text-xs font-semibold" />}
        />

        <PegawaiPanel className="p-5">
          <p className="mb-4 text-[10px] font-black uppercase tracking-[0.18em] text-orange-700/70">
            Alur Dokumen
          </p>
          <div className="flex items-center gap-0">
            {WORKFLOW_STEPS.map((step, i) => {
              const isCurrent = step.key === dok.status
              const isPast = workflowIdx > i || dok.status === 'COMPLETED'
              const showAsRevision = dok.status === 'NEED_REVISION' && step.key === 'IN_PPK_VALIDATION'
              return (
                <div key={step.key} className="relative flex flex-1 flex-col items-center">
                  {i < WORKFLOW_STEPS.length - 1 && (
                    <div className={cn('absolute top-4 -right-1/2 z-0 h-0.5 w-full', isPast ? 'bg-orange-500' : 'bg-orange-100')} />
                  )}
                  <div className={cn(
                    'relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors',
                    isCurrent || showAsRevision ? 'border-orange-500 bg-orange-500 text-white' :
                      isPast ? 'border-emerald-500 bg-emerald-500 text-white' :
                        'border-orange-100 bg-white text-zinc-400',
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
                    'mt-2 text-center text-[10px] font-semibold',
                    isCurrent || showAsRevision ? 'text-orange-700' : isPast ? 'text-emerald-700' : 'text-zinc-400',
                  )}>
                    {step.label}
                  </span>
                </div>
              )
            })}
          </div>
        </PegawaiPanel>

        {dok.revision_notes && (
          <ErrorState
            title="Catatan revisi"
            description={dok.revision_notes}
            variant="warning"
          />
        )}

        <PegawaiPanel className="space-y-4 p-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-700/70">
              Metadata Saat Ini
            </p>
            <h2 className="mt-1 text-base font-bold text-zinc-950">Ringkasan dokumen</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <PegawaiFieldCard label="Fungsi" value={dok.fungsi_nama ?? '-'} />
            <PegawaiFieldCard label="Kegiatan" value={dok.kegiatan_nama ?? '-'} />
            {dok.jenis_permintaan_id && (
              <PegawaiFieldCard label="Jenis Permintaan" value={dok.jenis_permintaan_nama ?? '-'} />
            )}
            {dok.kategori_permintaan_id && (
              <PegawaiFieldCard label="Kategori Permintaan" value={dok.kategori_permintaan_nama ?? '-'} />
            )}
            {dok.detail_permintaan_id && (
              <PegawaiFieldCard label="Detail Permintaan" value={dok.detail_permintaan_nama ?? '-'} />
            )}
            <PegawaiFieldCard label="Tahun" value={dok.tahun ?? '-'} />
            <PegawaiFieldCard label="Tanggal" value={dok.tanggal ? formatDate(dok.tanggal) : '-'} />
          </div>
        </PegawaiPanel>

        {submitError && (
          <ErrorState
            title="Gagal mengajukan ulang"
            description={submitError}
            variant="destructive"
            className="border-red-200"
          />
        )}

        <AttachmentEditor
          dokumen={dok}
          lampiranUrls={lampiranUrls}
          kelengkapan={isNonMaterial ? [] : kelengkapan}
          isNonMaterial={isNonMaterial}
          nominalValue={dok.nominal_realisasi}
          submitLabel={isNonMaterial ? 'Ajukan Ulang ke Ketua Tim' : 'Ajukan Ulang ke PPK'}
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
