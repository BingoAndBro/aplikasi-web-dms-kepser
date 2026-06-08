import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useState } from 'react'

import { DashboardShell } from '#/components/dashboard/DashboardShell'
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
import { getClientAuthState } from '#/lib/auth-state'
import { ROLES } from '#/lib/constants/roles'
import { ROUTES } from '#/lib/constants/routes'
import { guardRole } from '#/lib/guards'
import { formatDate } from '#/lib/utils/format'
import { Archive, BarChart3, CheckCircle2, FileText, FolderOpen, History, ListChecks, PenLine } from 'lucide-react'

export const Route = createFileRoute('/pegawai')({
  ssr: false,
  beforeLoad: ({ event }) => {
    guardRole(ROLES.PEGAWAI)(event)
  },
  component: PegawaiLayout,
})

function PegawaiLayout() {
  const routerState = useRouterState()
  const authState = getClientAuthState()
  const [documents, setDocuments] = useState<PegawaiDashboardDocument[]>([])
  const isReady = authState.isReady
  const hasAuthenticatedSession = authState.status === 'authenticated' && !!authState.userId
  const hasPegawaiRole = hasAuthenticatedSession && authState.roles.includes(ROLES.PEGAWAI)

  useEffect(() => {
    if (!isReady) return

    if (!hasAuthenticatedSession) {
      window.location.href = ROUTES.LOGIN
      return
    }

    if (!hasPegawaiRole) {
      window.location.href = ROUTES.FORBIDDEN
    }
  }, [hasAuthenticatedSession, hasPegawaiRole, isReady])

  useEffect(() => {
    if (!isReady || !hasAuthenticatedSession || !hasPegawaiRole) return

    apiFetch<{ dokumen?: PegawaiDashboardDocument[] }>('/dokumen')
      .then((response) => setDocuments(response.dokumen ?? []))
      .catch(() => setDocuments([]))
  }, [hasAuthenticatedSession, hasPegawaiRole, isReady])

  if (!isReady || !hasAuthenticatedSession || !hasPegawaiRole) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (routerState.location.pathname === ROUTES.PEGAWAI.ROOT) {
    const revisionDocuments = documents
      .filter((document) => document.status === 'NEED_REVISION' && document.revision_target === 'USER')
      .slice(0, 3)

    return (
      <DashboardShell role="PEGAWAI" showHero={false}>
        <RoleDashboardPage>
          <RoleDashboardHeader
            title={<>Selamat Datang di <span className="text-[#FF4D00]">Beranda</span> Anda.</>}
            description="Pantau pengajuan, revisi, dan laporan dokumen Anda."
            actionHref={ROUTES.PEGAWAI.AJU_DOKUMEN}
            actionLabel="Ajukan Dokumen"
            actionIcon={<PenLine size={16} />}
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DashboardMetricCard
              label="Dokumen Diajukan"
              value={documents.length}
              badge="Aktif"
              icon={<FileText size={20} />}
              tone="sky"
            />
            <DashboardMetricCard
              label="Perlu Revisi"
              value={revisionDocuments.length}
              badge="Perlu Tindakan"
              icon={<History size={20} />}
              tone="rose"
            />
            <DashboardMetricCard
              label="Dokumen Selesai"
              value={documents.filter((document) => document.status === 'COMPLETED').length}
              badge="Selesai"
              icon={<CheckCircle2 size={20} />}
              tone="emerald"
            />
            <DashboardMetricCard
              label="Dokumen Tersimpan"
              value={documents.filter((document) => document.status === 'DRAFT' || document.status === 'TERSIMPAN').length}
              badge="Tersimpan"
              icon={<FolderOpen size={20} />}
              tone="amber"
            />
          </div>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <DashboardSection
              title="Perlu Tindakan"
              description="Dokumen yang memerlukan perhatian, kelengkapan, atau revisi segera."
            >
              {revisionDocuments.length > 0 ? (
                <div>
                  {revisionDocuments.map((document) => (
                    <DashboardActionRow
                      key={document.id}
                      icon={<History size={18} />}
                      title={document.judul}
                      description={document.revision_notes ?? 'Dokumen dikembalikan untuk perbaikan Pegawai.'}
                      meta={`Diperbarui ${formatDate(document.updated_at ?? document.created_at)}`}
                      href={`/pegawai/dokumen/${document.id}/revisi`}
                      actionLabel="Perbaiki"
                    />
                  ))}
                </div>
              ) : (
                <DashboardEmptyState
                  title="Tidak ada revisi"
                  description="Dokumen yang dikembalikan untuk perbaikan Pegawai akan muncul di sini."
                />
              )}
            </DashboardSection>

            <DashboardQuickActions
              actions={[
                { href: ROUTES.PEGAWAI.AJU_DOKUMEN, label: 'Ajukan Dokumen', icon: <PenLine size={16} /> },
                { href: ROUTES.PEGAWAI.DOKUMEN, label: 'Dokumen Diajukan', icon: <FileText size={16} /> },
                { href: ROUTES.PEGAWAI.REVISI, label: 'Revisi Dokumen', icon: <ListChecks size={16} /> },
                { href: ROUTES.PEGAWAI.LAPORAN_SAYA, label: 'Laporan Saya', icon: <Archive size={16} /> },
                { href: ROUTES.PEGAWAI.LAPORAN_KEGIATAN, label: 'Laporan Kegiatan', icon: <BarChart3 size={16} /> },
              ]}
            />
          </div>
        </RoleDashboardPage>
      </DashboardShell>
    )
  }

  return <Outlet />
}

type PegawaiDashboardDocument = {
  id: string
  judul: string
  status: string | null
  revision_target?: string | null
  revision_notes?: string | null
  created_at: string
  updated_at?: string | null
}
