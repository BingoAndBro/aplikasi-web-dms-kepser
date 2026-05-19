import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import { apiFetch } from '#/lib/api-client'
import { guardRole } from '#/lib/guards'

type AuthSessionResponse = {
  session: { userId: string; email: string; userName: string | null } | null
  roles: string[]
  activeRole: string | null
}

export const Route = createFileRoute('/bendahara')({
  beforeLoad: ({ event }) => {
    guardRole('BENDAHARA')(event)
  },
  component: BendaharaLayout,
})

function BendaharaLayout() {
  useEffect(() => {
    async function checkAuth() {
      try {
        const auth = await apiFetch<AuthSessionResponse>('/auth/session')
        if (!auth.session) { window.location.href = '/login'; return }
        if (!auth.roles.includes('BENDAHARA')) { window.location.href = '/forbidden'; return }
      } catch {
        window.location.href = '/login'
      }
    }
    checkAuth()
  }, [])

  return <Outlet />
}
