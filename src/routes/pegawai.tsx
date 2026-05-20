import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'

import { DashboardShell } from '#/components/dashboard/DashboardShell'
import { StatsBento } from '#/components/dashboard/StatsBento'
import { getClientAuthState } from '#/lib/auth-state'
import { ROLES } from '#/lib/constants/roles'
import { ROUTES } from '#/lib/constants/routes'
import { guardRole } from '#/lib/guards'

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
      </DashboardShell>
    )
  }

  return <Outlet />
}
