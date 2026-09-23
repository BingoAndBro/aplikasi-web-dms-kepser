import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import { apiFetch } from '#/lib/api-client'
import { guardRole } from '#/lib/guards'

type AuthSessionResponse = {
  session: { userId: string; username: string; displayName: string | null } | null
  roles: string[]
  activeRole: string | null
}

export const Route = createFileRoute('/ppk')({
  beforeLoad: ({ event }) => {
    guardRole('PPK')(event)
  },
  component: PpkLayout,
})

function PpkLayout() {
  useEffect(() => {
    async function checkAuth() {
      try {
        const auth = await apiFetch<AuthSessionResponse>('/auth/session')
        if (!auth.session) { window.location.href = '/login'; return }
        if (!auth.roles.includes('PPK')) { window.location.href = '/forbidden'; return }
      } catch {
        window.location.href = '/login'
      }
    }
    checkAuth()
  }, [])

  return <Outlet />
}
