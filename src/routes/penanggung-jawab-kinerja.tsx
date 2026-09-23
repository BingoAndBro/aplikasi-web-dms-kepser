import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'

import { apiFetch } from '#/lib/api-client'
import { ROLES } from '#/lib/constants/roles'
import { ROUTES } from '#/lib/constants/routes'
import { guardRole } from '#/lib/guards'

type AuthSessionResponse = {
  session: { userId: string; username: string; displayName?: string | null } | null
  roles: string[]
  activeRole: string | null
}

export const Route = createFileRoute('/penanggung-jawab-kinerja')({
  beforeLoad: ({ event }) => {
    guardRole(ROLES.PENANGGUNG_JAWAB_KINERJA)(event)
  },
  component: PenanggungJawabKinerjaLayout,
})

function PenanggungJawabKinerjaLayout() {
  useEffect(() => {
    async function checkAuth() {
      try {
        const auth = await apiFetch<AuthSessionResponse>('/auth/session')
        if (!auth.session) {
          window.location.href = ROUTES.LOGIN
          return
        }
        if (!auth.roles.includes(ROLES.PENANGGUNG_JAWAB_KINERJA)) {
          window.location.href = ROUTES.FORBIDDEN
        }
      } catch {
        window.location.href = ROUTES.LOGIN
      }
    }

    checkAuth()
  }, [])

  return <Outlet />
}
