import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import {
  DashboardActionRow,
  DashboardEmptyState,
  DashboardMetricCard,
  DashboardQuickActions,
  DashboardSection,
  RoleDashboardHeader,
  RoleDashboardPage,
} from '#/components/dashboard/RoleDashboardPrimitives'
import { apiFetch } from '#/lib/api-client'
import { ROUTES } from '#/lib/constants/routes'
import { byOldest, formatDate, formatRelativeAge } from '#/lib/utils/format'
import { Banknote, CheckCircle2, ClipboardCheck, FileCheck2, FileText, FileX, History } from 'lucide-react'

export const Route = createFileRoute('/ppspm/')({
  component: PpspmDashboardPage,
})

type WorkflowDashboardItem = {
  id: string
  judul: string
  fungsi_nama?: string | null
  kegiatan_nama?: string | null
  created_at?: string | null
  updated_at?: string | null
  tanggal?: string | null
  ppk_validated_at?: string | null
  nominal_realisasi?: number | string | null
}

type WorkflowDetailResponse = {
  dokumen?: {
    nominal_realisasi?: number | string | null
  }
}

function PpspmDashboardPage() {
  const [waiting, setWaiting] = useState<WorkflowDashboardItem[]>([])
  const [finished, setFinished] = useState<WorkflowDashboardItem[]>([])
  const [rejected, setRejected] = useState<WorkflowDashboardItem[]>([])

  useEffect(() => {
    Promise.all([
      apiFetch<{ dokumen?: WorkflowDashboardItem[] }>('/ppspm/inbox').catch(() => ({ dokumen: [] })),
      apiFetch<{ dokumen?: WorkflowDashboardItem[] }>('/ppspm/selesai').catch(() => ({ dokumen: [] })),
      apiFetch<{ dokumen?: WorkflowDashboardItem[] }>('/ppspm/ditolak').catch(() => ({ dokumen: [] })),
    ]).then(async ([waitingResponse, finishedResponse, rejectedResponse]) => {
      const waitingDocuments = waitingResponse.dokumen ?? []
      setWaiting(await enrichWaitingNominal(waitingDocuments))
      setFinished(finishedResponse.dokumen ?? [])
      setRejected(rejectedResponse.dokumen ?? [])
    })
  }, [])

  const pendingNominal = formatPendingNominal(waiting)

  return (
    <RoleDashboardPage>
      <RoleDashboardHeader
        title="Dashboard PPSPM"
        description="Pantau dokumen yang menunggu persetujuan akhir."
        actionHref={ROUTES.PPSPM.INBOX}
        actionLabel="Persetujuan Dokumen"
        actionIcon={<Banknote size={16} />}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardMetricCard
          label="Menunggu Persetujuan"
          value={waiting.length}
          badge="Antrean"
          icon={<ClipboardCheck size={20} />}
          tone="warning"
        />
        <DashboardMetricCard
          label="Disetujui"
          value={finished.length}
          badge="Selesai"
          icon={<CheckCircle2 size={20} />}
          tone="success"
        />
        <DashboardMetricCard
          label="Dikembalikan"
          value={rejected.length}
          badge="Revisi"
          icon={<History size={20} />}
          tone="danger"
        />
        <DashboardMetricCard
          label="Total Nominal Menunggu"
          value={pendingNominal}
          badge="Nominal"
          icon={<FileText size={20} />}
          tone="info"
          valueClassName="font-mono text-zinc-950"
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <DashboardSection
          title="Perlu Tindakan"
          description="Dokumen yang sudah divalidasi PPK dan menunggu keputusan PPSPM."
        >
          {waiting.length > 0 ? (
            <div>
              {[...waiting].sort(byOldest).slice(0, 3).map((document) => (
                <DashboardActionRow
                  key={document.id}
                  icon={<Banknote size={18} />}
                  title={document.judul}
                  description={document.kegiatan_nama ?? document.fungsi_nama ?? 'Dokumen Material'}
                  meta={
                    formatRelativeAge(document.created_at ?? document.tanggal ?? '') ??
                    (document.ppk_validated_at
                      ? `Divalidasi PPK ${formatDate(document.ppk_validated_at)}`
                      : document.tanggal
                        ? `Tanggal ${formatDate(document.tanggal)}`
                        : undefined)
                  }
                  href={`/ppspm/dokumen/${document.id}`}
                  actionLabel="Tinjau"
                />
              ))}
            </div>
          ) : (
            <DashboardEmptyState
              title="Tidak ada antrean persetujuan"
              description="Dokumen yang menunggu persetujuan PPSPM akan muncul di sini."
            />
          )}
        </DashboardSection>

        <DashboardQuickActions
          actions={[
            { href: ROUTES.PPSPM.INBOX, label: 'Persetujuan Dokumen', icon: <Banknote size={16} /> },
            { href: ROUTES.PPSPM.SELESAI, label: 'Dokumen Selesai', icon: <FileCheck2 size={16} /> },
            { href: ROUTES.PPSPM.DITOLAK, label: 'Dokumen Ditolak', icon: <FileX size={16} /> },
          ]}
        />
      </div>
    </RoleDashboardPage>
  )
}

function formatPendingNominal(items: WorkflowDashboardItem[]) {
  const nominalValues = items
    .map((item) => normalizeNominal(item.nominal_realisasi))
    .filter((value): value is number => value !== null)

  if (nominalValues.length === 0) return 'Rp 0'

  return `Rp ${new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 0,
  }).format(nominalValues.reduce((total, value) => total + value, 0))}`
}

function normalizeNominal(value: WorkflowDashboardItem['nominal_realisasi']) {
  if (value === null || value === undefined || value === '') return null
  const numericValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

async function enrichWaitingNominal(items: WorkflowDashboardItem[]) {
  return Promise.all(items.map(async (item) => {
    if (item.nominal_realisasi !== undefined) return item

    try {
      const detail = await apiFetch<WorkflowDetailResponse>(`/ppspm/dokumen/${item.id}`)
      return {
        ...item,
        nominal_realisasi: detail.dokumen?.nominal_realisasi ?? null,
      }
    } catch {
      return {
        ...item,
        nominal_realisasi: null,
      }
    }
  }))
}
