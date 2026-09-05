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
import { CheckCircle2, ClipboardCheck, FileCheck2, FileText, FileX, History, ShieldCheck } from 'lucide-react'

export const Route = createFileRoute('/ppk/')({
  component: PpkDashboardPage,
})

type WorkflowDashboardItem = {
  id: string
  judul: string
  fungsi_nama?: string | null
  kegiatan_nama?: string | null
  status?: string | null
  created_at?: string | null
  updated_at?: string | null
  tanggal?: string | null
  revision_notes?: string | null
  nominal_realisasi?: number | string | null
}

type WorkflowDetailResponse = {
  dokumen?: {
    nominal_realisasi?: number | string | null
  }
}

function PpkDashboardPage() {
  const [waiting, setWaiting] = useState<WorkflowDashboardItem[]>([])
  const [validated, setValidated] = useState<WorkflowDashboardItem[]>([])
  const [rejected, setRejected] = useState<WorkflowDashboardItem[]>([])
  const [revision, setRevision] = useState<WorkflowDashboardItem[]>([])

  useEffect(() => {
    Promise.all([
      apiFetch<{ dokumen?: WorkflowDashboardItem[] }>('/ppk/inbox').catch(() => ({ dokumen: [] })),
      apiFetch<{ dokumen?: WorkflowDashboardItem[] }>('/ppk/tervalidasi').catch(() => ({ dokumen: [] })),
      apiFetch<{ dokumen?: WorkflowDashboardItem[] }>('/ppk/ditolak').catch(() => ({ dokumen: [] })),
      apiFetch<{ dokumen?: WorkflowDashboardItem[] }>('/ppk/revisi').catch(() => ({ dokumen: [] })),
    ]).then(async ([waitingResponse, validatedResponse, rejectedResponse, revisionResponse]) => {
      const waitingDocuments = waitingResponse.dokumen ?? []
      setWaiting(await enrichWaitingNominal(waitingDocuments))
      setValidated(validatedResponse.dokumen ?? [])
      setRejected(rejectedResponse.dokumen ?? [])
      setRevision(revisionResponse.dokumen ?? [])
    })
  }, [])

  const actionItems = [...waiting, ...revision].sort(byOldest).slice(0, 3)
  const pendingNominal = formatPendingNominal(waiting)

  return (
    <RoleDashboardPage>
      <RoleDashboardHeader
        title="Dashboard PPK"
        description="Pantau dokumen yang menunggu validasi dan tindak lanjut revisi."
        actionHref={ROUTES.PPK.INBOX}
        actionLabel="Validasi Dokumen"
        actionIcon={<ClipboardCheck size={16} />}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardMetricCard
          label="Menunggu Validasi"
          value={waiting.length}
          badge="Antrean"
          icon={<ShieldCheck size={20} />}
          tone="amber"
        />
        <DashboardMetricCard
          label="Sudah Divalidasi"
          value={validated.length}
          badge="Selesai"
          icon={<CheckCircle2 size={20} />}
          tone="emerald"
        />
        <DashboardMetricCard
          label="Dikembalikan untuk Revisi"
          value={revision.length + rejected.length}
          badge="Revisi"
          icon={<History size={20} />}
          tone="rose"
        />
        <DashboardMetricCard
          label="Total Nominal Menunggu"
          value={pendingNominal}
          badge="Nominal"
          icon={<FileText size={20} />}
          tone="sky"
          valueClassName="font-mono text-zinc-950"
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <DashboardSection
          title="Perlu Tindakan"
          description="Dokumen yang menunggu validasi PPK atau tindak lanjut revisi dari PPSPM."
        >
          {actionItems.length > 0 ? (
            <div>
              {actionItems.map((document) => {
                const isRevision = revision.some((item) => item.id === document.id)
                return (
                  <DashboardActionRow
                    key={`${isRevision ? 'revision' : 'waiting'}-${document.id}`}
                    icon={isRevision ? <History size={18} /> : <ClipboardCheck size={18} />}
                    title={document.judul}
                    description={document.kegiatan_nama ?? document.fungsi_nama ?? 'Dokumen Material'}
                    meta={
                      formatRelativeAge(document.created_at ?? document.tanggal ?? '') ??
                      (document.tanggal ? `Tanggal ${formatDate(document.tanggal)}` : undefined)
                    }
                    href={isRevision ? `/ppk/dokumen/${document.id}/resubmit` : `/ppk/dokumen/${document.id}`}
                    actionLabel={isRevision ? 'Ajukan Ulang' : 'Validasi'}
                  />
                )
              })}
            </div>
          ) : (
            <DashboardEmptyState
              title="Semua Selesai"
              description="Tidak ada dokumen menunggu validasi atau revisi PPK saat ini."
            />
          )}
        </DashboardSection>

        <DashboardQuickActions
          actions={[
            { href: ROUTES.PPK.INBOX, label: 'Validasi Dokumen', icon: <ClipboardCheck size={16} /> },
            { href: ROUTES.PPK.TERVALIDASI, label: 'Dokumen Tervalidasi', icon: <FileCheck2 size={16} /> },
            { href: ROUTES.PPK.DITOLAK, label: 'Dokumen Tidak Valid', icon: <FileX size={16} /> },
            { href: ROUTES.PPK.REVISI, label: 'Revisi Dokumen', icon: <History size={16} /> },
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
      const detail = await apiFetch<WorkflowDetailResponse>(`/ppk/dokumen/${item.id}`)
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
