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
import { ROLES } from '#/lib/constants/roles'
import { ROUTES } from '#/lib/constants/routes'
import { byOldest, formatDate, formatRelativeAge } from '#/lib/utils/format'
import { ClipboardList, FilePlus, FolderCheck, FolderOpen, Network, Tags, Trash2 } from 'lucide-react'

export const Route = createFileRoute('/arsiparis/')({
  component: KepalaSubBagianUmumDashboard,
})

type ClassificationQueueItem = {
  id: string
  judul: string
  fungsi_nama?: string | null
  kegiatan_nama?: string | null
  tanggal?: string | null
  created_at?: string | null
}

type InboxStatsResponse = {
  inbox?: ClassificationQueueItem[]
}

type BerkasListRow = {
  berkas_id: string
  klasifikasi_nama_snapshot?: string | null
  status_berkas?: string | null
  status_arsip?: string | null
  item_count?: number
  total_nominal_realisasi?: number | null
  updated_at?: string | null
  created_at?: string | null
}

type BerkasStatsResponse = {
  berkas?: BerkasListRow[]
  summary?: {
    total_rows_returned?: number
  }
}

type AuthSessionResponse = {
  session: { userId: string; email: string; userName: string | null } | null
  roles: string[]
  activeRole: string | null
}

function KepalaSubBagianUmumDashboard() {
  const [classificationQueue, setClassificationQueue] = useState<ClassificationQueueItem[]>([])
  const [openFolders, setOpenFolders] = useState<BerkasListRow[]>([])
  const [closedFolders, setClosedFolders] = useState<BerkasListRow[]>([])
  const [proposedDestructionCount, setProposedDestructionCount] = useState(0)

  useEffect(() => {
    async function checkAuth() {
      try {
        const auth = await apiFetch<AuthSessionResponse>('/auth/session')
        if (!auth.session) { window.location.href = '/login'; return }
        if (!auth.roles.includes(ROLES.KEPALA_SUB_BAGIAN_UMUM)) { window.location.href = '/forbidden'; return }
      } catch {
        window.location.href = '/login'
      }
    }
    checkAuth()
  }, [])

  useEffect(() => {
    Promise.all([
      apiFetch<InboxStatsResponse>('/arsiparis/inbox').catch(() => ({ inbox: [] })),
      apiFetch<BerkasStatsResponse>('/arsiparis/berkas', {
        query: { status_berkas: 'OPEN' },
      }).catch(() => ({ berkas: [], summary: { total_rows_returned: 0 } })),
      apiFetch<BerkasStatsResponse>('/arsiparis/berkas', {
        query: { status_berkas: 'CLOSED', status_arsip: 'AKTIF' },
      }).catch(() => ({ berkas: [], summary: { total_rows_returned: 0 } })),
      apiFetch<BerkasStatsResponse>('/arsiparis/berkas', {
        query: { status_berkas: 'CLOSED', status_arsip: 'USUL_MUSNAH' },
      }).catch(() => ({ berkas: [], summary: { total_rows_returned: 0 } })),
    ]).then(([inboxResponse, openResponse, closedResponse, proposedResponse]) => {
      setClassificationQueue(inboxResponse.inbox ?? [])
      setOpenFolders(openResponse.berkas ?? [])
      setClosedFolders(closedResponse.berkas ?? [])
      setProposedDestructionCount(proposedResponse.summary?.total_rows_returned ?? 0)
    })
  }, [])

  const recentDocuments = [...classificationQueue].sort(byOldest).slice(0, 3)
  const hasArchiveTask = classificationQueue.length > 0 || proposedDestructionCount > 0

  return (
    <RoleDashboardPage>
      <RoleDashboardHeader
        title="Dashboard Kepala Sub Bagian Umum"
        description="Pantau pengklasifikasian dokumen, pemberkasan, dan siklus hidup arsip."
        actionHref={ROUTES.KEPALA_SUB_BAGIAN_UMUM.INBOX}
        actionLabel="Pengklasifikasian Dokumen"
        actionIcon={<FolderOpen size={16} />}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DashboardMetricCard
          label="Berkas Terbuka"
          value={openFolders.length}
          badge="Terbuka"
          icon={<FolderOpen size={20} />}
          tone="amber"
        />
        <DashboardMetricCard
          label="Berkas Tertutup"
          value={closedFolders.length}
          badge="Tersimpan"
          icon={<FolderCheck size={20} />}
          tone="emerald"
        />
        <DashboardMetricCard
          label="Usul Pembersihan"
          value={proposedDestructionCount}
          badge="Usul Pembersihan"
          icon={<Trash2 size={20} />}
          tone="rose"
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-8">
          <DashboardSection title="Perlu Tindakan Kearsipan">
            {hasArchiveTask ? (
              <div>
                {classificationQueue.length > 0 && (
                  <DashboardActionRow
                    icon={<Tags size={18} />}
                    title={`${classificationQueue.length} Dokumen Siap Diklasifikasikan`}
                    description="Membutuhkan metadata Cara Pembayaran untuk masuk ke berkas."
                    href={ROUTES.KEPALA_SUB_BAGIAN_UMUM.INBOX}
                    actionLabel="Klasifikasikan"
                  />
                )}
                {proposedDestructionCount > 0 && (
                  <DashboardActionRow
                    icon={<Trash2 size={18} />}
                    title={`${proposedDestructionCount} Berkas Menunggu Pembersihan File`}
                    description="Berkas berstatus Usul Pembersihan menunggu konfirmasi yang berwenang."
                    href={ROUTES.KEPALA_SUB_BAGIAN_UMUM.PEMBERSIHAN}
                    actionLabel="Tinjau"
                  />
                )}
              </div>
            ) : (
              <DashboardEmptyState
                title="Tidak ada tindakan kearsipan"
                description="Antrean klasifikasi dan usul pembersihan yang membutuhkan tindakan akan muncul di sini."
              />
            )}
          </DashboardSection>

          <DashboardSection
            title="Perlu Diklasifikasikan (Terlama)"
            description="Dokumen yang paling lama menunggu klasifikasi, dari data yang tersedia."
          >
            {recentDocuments.length > 0 ? (
              <div>
                {recentDocuments.map((document) => (
                  <DashboardActionRow
                    key={document.id}
                    icon={<ClipboardList size={18} />}
                    title={document.judul}
                    description={document.kegiatan_nama ?? document.fungsi_nama ?? 'Dokumen selesai'}
                    meta={
                      formatRelativeAge(document.created_at ?? document.tanggal ?? '') ??
                      (document.tanggal ? `Tanggal ${formatDate(document.tanggal)}` : undefined)
                    }
                    href={`/arsiparis/dokumen/${document.id}`}
                    actionLabel="Detail"
                  />
                ))}
              </div>
            ) : (
              <DashboardEmptyState
                title="Belum ada dokumen untuk diklasifikasikan"
                description="Dokumen siap klasifikasi akan tampil di sini jika tersedia."
              />
            )}
          </DashboardSection>
        </div>

        <DashboardQuickActions
          actions={[
            { href: ROUTES.KEPALA_SUB_BAGIAN_UMUM.INBOX, label: 'Pengklasifikasian Dokumen', icon: <Tags size={16} /> },
            { href: ROUTES.KEPALA_SUB_BAGIAN_UMUM.PENAMBAHAN_ARSIP, label: 'Penambahan Dokumen', icon: <FilePlus size={16} /> },
            { href: ROUTES.KEPALA_SUB_BAGIAN_UMUM.BERKAS_AKTIF, label: 'Berkas Terbuka', icon: <FolderOpen size={16} /> },
            { href: ROUTES.KEPALA_SUB_BAGIAN_UMUM.BERKAS_TERTUTUP, label: 'Berkas Tertutup', icon: <FolderCheck size={16} /> },
            { href: ROUTES.KEPALA_SUB_BAGIAN_UMUM.PEMBERSIHAN, label: 'Pembersihan Berkas', icon: <Trash2 size={16} /> },
            { href: ROUTES.KEPALA_SUB_BAGIAN_UMUM.KLASIFIKASI, label: 'Master Klasifikasi Dokumen', icon: <Network size={16} /> },
          ]}
        />
      </div>
    </RoleDashboardPage>
  )
}
