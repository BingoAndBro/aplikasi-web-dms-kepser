import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
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
import { AttachmentViewer } from '#/components/dokumen/AttachmentViewer'
import {
  FileText,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Pencil,
  Trash2,
  Loader2,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import { formatDate } from '#/lib/utils/format'
import { ApiError, apiFetch } from '#/lib/api-client'
import { apiMutation } from '#/lib/api-mutation'

export const Route = createFileRoute('/pegawai/dokumen/$id/')({
  component: DokumenDetailPage,
})

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

const WORKFLOW_STEPS_MATERIAL = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'IN_PPK_VALIDATION', label: 'PPK' },
  { key: 'IN_BENDAHARA_APPROVAL', label: 'PPSPM' },
  { key: 'COMPLETED', label: 'Selesai' },
]

const WORKFLOW_STEPS_NON_MATERIAL = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'TERSIMPAN', label: 'Tersimpan' },
]

function getWorkflowIndexMaterial(status: string): number {
  if (status === 'NEED_REVISION') return -1
  return WORKFLOW_STEPS_MATERIAL.findIndex(s => s.key === status)
}

function getWorkflowIndexNonMaterial(status: string): number {
  return WORKFLOW_STEPS_NON_MATERIAL.findIndex(s => s.key === status)
}

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
    } finally {
      setLoading(false)
    }
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

  if (loading) {
    return (
      <PageLayout>
        <div className="mx-auto max-w-4xl">
          <LoadingState variant="page" label="Memuat detail dokumen" />
        </div>
      </PageLayout>
    )
  }

  if (fetchError) {
    return (
      <PageLayout>
        <ErrorState
          title="Gagal memuat detail dokumen"
          description={fetchError}
          variant="page"
          action={<Link to="/pegawai/dokumen"><Button variant="outline" size="sm">Kembali</Button></Link>}
        />
      </PageLayout>
    )
  }

  if (!dok) {
    return (
      <PageLayout>
        <ErrorState
          title="Dokumen tidak ditemukan"
          description="Dokumen tidak tersedia atau Anda tidak memiliki akses ke detail ini."
          variant="page"
          action={<Link to="/pegawai/dokumen"><Button variant="outline" size="sm">Kembali</Button></Link>}
        />
      </PageLayout>
    )
  }

  const isNonMaterial = dok.is_non_material === true ||
    (dok.is_non_material === undefined && !dok.jenis_permintaan_id && !dok.kategori_permintaan_id && !dok.detail_permintaan_id)

  const workflowSteps = isNonMaterial ? WORKFLOW_STEPS_NON_MATERIAL : WORKFLOW_STEPS_MATERIAL
  const workflowIdx = isNonMaterial
    ? getWorkflowIndexNonMaterial(dok.status)
    : getWorkflowIndexMaterial(dok.status)

  return (
    <PageLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <PegawaiPageHeader
          eyebrow={
            <>
              <ClipboardList size={12} />
              <Link to="/pegawai/dokumen" className="hover:text-orange-900">Dokumen</Link>
              <ChevronRight size={10} />
              <span>Detail</span>
            </>
          }
          title={dok.judul}
          description={isNonMaterial
            ? 'Dokumen Non-Material tersimpan tanpa alur PPK/PPSPM. Lampiran dan metadata tetap dapat ditinjau dari halaman ini.'
            : 'Dokumen Material mengikuti validasi PPK, persetujuan PPSPM, lalu status selesai.'}
          actions={<StatusBadge status={dok.status} className="text-xs font-semibold" />}
        />

        <WorkflowPanel
          isNonMaterial={isNonMaterial}
          status={dok.status}
          workflowIdx={workflowIdx}
          workflowSteps={workflowSteps}
        />

        {dok.status === 'NEED_REVISION' && dok.revision_notes && (
          <ErrorState
            title={`Catatan revisi dari ${dok.revision_target === 'USER' ? 'PPK' : 'PPSPM'}`}
            description={dok.revision_notes}
            variant="warning"
          />
        )}

        <PegawaiPanel className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-700/70">
                Metadata Dokumen
              </p>
              <h2 className="mt-1 text-base font-bold text-zinc-950">Ringkasan pengajuan</h2>
            </div>
            <span className="rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800">
              {isNonMaterial ? 'Non-Material' : 'Material'}
            </span>
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
            {isNonMaterial && dok.jenis_dokumen_nama && (
              <PegawaiFieldCard label="Jenis Dokumen" value={dok.jenis_dokumen_nama} />
            )}
            <PegawaiFieldCard label="Tahun" value={dok.tahun} />
            <PegawaiFieldCard label="Tanggal" value={dok.tanggal ? formatDate(dok.tanggal) : '-'} />
            <PegawaiFieldCard label="Peran" value={dok.is_ketua_tim ? 'Ketua Tim' : 'Anggota'} />
            <PegawaiFieldCard label="Diajukan" value={dok.created_at ? formatDate(dok.created_at) : '-'} />
            {!isNonMaterial && dok.nominal_realisasi !== null && dok.nominal_realisasi !== undefined && (
              <PegawaiFieldCard
                label="Nominal Realisasi"
                value={`Rp ${Number(dok.nominal_realisasi).toLocaleString('id-ID')}`}
              />
            )}
            {dok.keterangan_detail && (
              <PegawaiFieldCard
                label="Keterangan Detail"
                value={<span className="whitespace-pre-wrap font-medium">{dok.keterangan_detail}</span>}
                className="sm:col-span-2"
              />
            )}
          </div>
        </PegawaiPanel>

        <AttachmentViewer dokumen={dok as any} lampiranUrls={dok.lampiran_urls} />

        <ActivityLog dokumenId={id} />

        <div className="flex flex-col gap-3 rounded-2xl border border-orange-100 bg-white p-3 shadow-sm sm:flex-row">
          <Link to="/pegawai/dokumen">
            <Button variant="outline" size="sm" className="w-full gap-1.5 sm:w-auto">
              <ChevronRight size={14} className="rotate-180" />
              Kembali
            </Button>
          </Link>
          {dok.status === 'NEED_REVISION' && dok.revision_target === 'USER' && !isNonMaterial && (
            <Link to="/pegawai/dokumen/$id/revisi" params={{ id }} className="sm:ml-auto">
              <Button size="sm" className="w-full gap-1.5 sm:w-auto">
                <FileText size={14} />
                Revisi Dokumen
              </Button>
            </Link>
          )}
          {isNonMaterial && dok.status === 'TERSIMPAN' && (
            <div className="flex flex-col gap-3 sm:ml-auto sm:flex-row">
              <Link to="/pegawai/dokumen/$id/edit" params={{ id }}>
                <Button variant="outline" size="sm" className="w-full gap-1.5 sm:w-auto">
                  <Pencil size={14} />
                  Edit
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
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  )
}

function WorkflowPanel({
  isNonMaterial,
  status,
  workflowIdx,
  workflowSteps,
}: {
  isNonMaterial: boolean
  status: string
  workflowIdx: number
  workflowSteps: { key: string; label: string }[]
}) {
  return (
    <PegawaiPanel className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-700/70">
            {isNonMaterial ? 'Status Dokumen' : 'Alur Dokumen'}
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            {isNonMaterial
              ? 'Non-Material langsung tersimpan setelah diajukan.'
              : 'Material bergerak dari PPK ke PPSPM sebelum selesai.'}
          </p>
        </div>
        <StatusBadge status={status} className="hidden text-xs font-semibold sm:inline-flex" />
      </div>
      <div className="flex items-center gap-0">
        {workflowSteps.map((step, i) => {
          const isCurrent = step.key === status
          const isPast = workflowIdx > i || status === 'TERSIMPAN' || status === 'COMPLETED'
          const showAsRevision = status === 'NEED_REVISION' && step.key === 'IN_PPK_VALIDATION'
          return (
            <div key={step.key} className="relative flex flex-1 flex-col items-center">
              {i < workflowSteps.length - 1 && (
                <div
                  className={cn(
                    'absolute top-4 -right-1/2 z-0 h-0.5 w-full',
                    isPast ? 'bg-orange-500' : 'bg-orange-100',
                  )}
                />
              )}
              <div
                className={cn(
                  'relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold',
                  isCurrent || showAsRevision
                    ? 'border-orange-500 bg-orange-500 text-white shadow-sm shadow-orange-500/20'
                    : isPast
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-orange-100 bg-white text-zinc-400',
                )}
              >
                {showAsRevision ? <AlertTriangle size={14} /> : isPast && !isCurrent ? <CheckCircle2 size={14} /> : i + 1}
              </div>
              <span
                className={cn(
                  'mt-2 text-center text-[10px] font-semibold',
                  isCurrent || showAsRevision ? 'text-orange-700' : isPast ? 'text-emerald-700' : 'text-zinc-400',
                )}
              >
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
    </PegawaiPanel>
  )
}
