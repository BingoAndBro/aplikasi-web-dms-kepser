import { createFileRoute, Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useEffect, type ReactNode } from 'react'

import { DashboardShell } from '#/components/dashboard/DashboardShell'
import { StatsBento } from '#/components/dashboard/StatsBento'
import { PegawaiPanel } from '#/components/pegawai/PegawaiPagePrimitives'
import { getClientAuthState } from '#/lib/auth-state'
import { ROLES } from '#/lib/constants/roles'
import { ROUTES } from '#/lib/constants/routes'
import { guardRole } from '#/lib/guards'
import { Button } from '#/components/ui/button'
import { FileText, ListChecks, PenLine, BarChart3 } from 'lucide-react'

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

  if (!isReady || !hasAuthenticatedSession || !hasPegawaiRole) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (routerState.location.pathname === ROUTES.PEGAWAI.ROOT) {
    return (
      <DashboardShell role="PEGAWAI">
        <StatsBento role="PEGAWAI" />
        <div className="grid gap-4 lg:grid-cols-3">
          <PegawaiPanel className="lg:col-span-2">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-700/70">
                  Ruang kerja hari ini
                </p>
                <h2 className="mt-2 text-xl font-extrabold text-zinc-950">Mulai dari dokumen Anda</h2>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-zinc-700">
                  Ajukan dokumen baru, pantau status berjalan, atau perbaiki dokumen yang dikembalikan.
                </p>
              </div>
              <Link to="/pegawai/dokumen/aju">
                <Button className="w-full gap-1.5 sm:w-auto">
                  <PenLine size={15} />
                  Ajukan Dokumen
                </Button>
              </Link>
            </div>
          </PegawaiPanel>

          <PegawaiPanel className="space-y-3 bg-[#FFF8F1]">
            <p className="text-sm font-bold text-zinc-950">Akses cepat</p>
            <div className="grid gap-2">
              <QuickDashboardLink to="/pegawai/dokumen" icon={<FileText size={15} />} label="Dokumen Saya" />
              <QuickDashboardLink to="/pegawai/revisi" icon={<ListChecks size={15} />} label="Revisi Dokumen" />
              <QuickDashboardLink to="/pegawai/laporan/saya" icon={<BarChart3 size={15} />} label="Laporan Saya" />
            </div>
          </PegawaiPanel>
        </div>
      </DashboardShell>
    )
  }

  return <Outlet />
}

function QuickDashboardLink({
  to,
  icon,
  label,
}: {
  to: '/pegawai/dokumen' | '/pegawai/revisi' | '/pegawai/laporan/saya'
  icon: ReactNode
  label: string
}) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-xl border border-orange-100 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 transition hover:border-orange-200 hover:bg-orange-50"
    >
      <span className="flex items-center gap-2">
        <span className="text-orange-700">{icon}</span>
        {label}
      </span>
      <span className="text-orange-700">Lihat</span>
    </Link>
  )
}
