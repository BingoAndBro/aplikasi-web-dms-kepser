import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'

import { getClientAuthState } from '#/lib/auth-state'
import { ROLES } from '#/lib/constants/roles'
import { ROUTES } from '#/lib/constants/routes'
import { guardRole } from '#/lib/guards'

// Layout wrapper for /pegawai/dokumen/* routes.
// The actual index page is in dokumen/index.tsx.
export const Route = createFileRoute('/pegawai/dokumen')({
  beforeLoad: () => {
    guardRole(ROLES.PEGAWAI)()
  },
  component: PegawaiDokumenLayout,
})

function PegawaiDokumenLayout() {
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

  return <Outlet />
}
