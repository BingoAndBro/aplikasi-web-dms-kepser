import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import {
  DashboardActionRow,
  DashboardEmptyState,
  DashboardMetricCard,
  DashboardQuickActions,
  DashboardSection,
  formatDashboardCurrency,
  RoleDashboardHeader,
  RoleDashboardPage,
} from '#/components/dashboard/RoleDashboardPrimitives'
import { apiFetch } from '#/lib/api-client'
import { ROUTES } from '#/lib/constants/routes'
import { formatDate } from '#/lib/utils/format'
import { BarChart3, CheckCircle2, ClipboardList, FileCheck2, FolderCheck } from 'lucide-react'

export const Route = createFileRoute('/penanggung-jawab-kinerja/')({
  component: PenanggungJawabKinerjaDashboard,
})

type KinerjaDashboardDocument = {
  id: string
  judul: string
  status: 'COMPLETED' | 'TERSIMPAN'
  is_non_material: boolean
  fungsi_nama: string | null
  kegiatan_nama: string | null
  updated_at: string
  nominal_realisasi: number | null
  is_diberkaskan: boolean
}

type LaporanKinerjaResponse = {
  dokumen?: KinerjaDashboardDocument[]
}

function PenanggungJawabKinerjaDashboard() {
  const [documents, setDocuments] = useState<KinerjaDashboardDocument[]>([])

  useEffect(() => {
    apiFetch<LaporanKinerjaResponse>('/laporan/kinerja', { query: { scope: 'laporan_kinerja' } })
      .then((response) => setDocuments(response.dokumen ?? []))
      .catch(() => setDocuments([]))
  }, [])

  const totalNominal = documents.reduce((total, document) => {
    if (document.is_non_material || document.nominal_realisasi === null) return total
    return total + document.nominal_realisasi
  }, 0)
  const completedCount = documents.filter((document) => document.status === 'COMPLETED').length
  const diberkaskanCount = documents.filter((document) => document.is_diberkaskan).length
  const latestDocuments = [...documents]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 3)

  return (
    <RoleDashboardPage>
      <RoleDashboardHeader
        title="Dashboard Penanggung Jawab Kinerja"
        description="Pantau dokumen final dan nominal realisasi berbasis metadata."
        actionHref={ROUTES.PENANGGUNG_JAWAB_KINERJA.LAPORAN_KINERJA}
        actionLabel="Lihat Laporan Kinerja"
        actionIcon={<ClipboardList size={16} />}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardMetricCard
          label="Total Dokumen Final"
          value={documents.length}
          badge="Final"
          icon={<CheckCircle2 size={20} />}
          tone="success"
        />
        <DashboardMetricCard
          label="Total Nominal Realisasi"
          value={formatDashboardCurrency(totalNominal)}
          badge="Realisasi"
          icon={<ClipboardList size={20} />}
          tone="warning"
          valueClassName="font-mono text-zinc-950"
        />
        <DashboardMetricCard
          label="Dokumen Selesai"
          value={completedCount}
          badge="Selesai"
          icon={<FileCheck2 size={20} />}
          tone="info"
        />
        <DashboardMetricCard
          label="Dokumen Diberkaskan"
          value={diberkaskanCount}
          badge="Diberkaskan"
          icon={<FolderCheck size={20} />}
          tone="success"
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <DashboardSection
          title="Dokumen Final Terbaru"
          description="Ringkasan metadata dokumen final. Dashboard ini hanya membuka halaman Laporan Kinerja."
        >
          {latestDocuments.length > 0 ? (
            <div>
              {latestDocuments.map((document) => (
                <DashboardActionRow
                  key={document.id}
                  icon={<FileCheck2 size={18} />}
                  title={document.judul}
                  description={[document.fungsi_nama, document.kegiatan_nama].filter(Boolean).join(' / ') || 'Metadata dokumen final'}
                  meta={`${formatStatusLabel(document.status)} - Diperbarui ${formatDate(document.updated_at)}`}
                  href={ROUTES.PENANGGUNG_JAWAB_KINERJA.LAPORAN_KINERJA}
                  actionLabel="Detail Metadata"
                />
              ))}
            </div>
          ) : (
            <DashboardEmptyState
              title="Belum ada dokumen final"
              description="Dokumen final dari Laporan Kinerja akan tampil sebagai metadata di sini."
            />
          )}
        </DashboardSection>

        <DashboardQuickActions
          actions={[
            {
              href: ROUTES.PENANGGUNG_JAWAB_KINERJA.LAPORAN_KINERJA,
              label: 'Lihat Laporan Kinerja',
              icon: <BarChart3 size={16} />,
            },
          ]}
        />
      </div>
    </RoleDashboardPage>
  )
}

function formatStatusLabel(status: KinerjaDashboardDocument['status']) {
  if (status === 'TERSIMPAN') return 'Tersimpan'
  return 'Selesai'
}
