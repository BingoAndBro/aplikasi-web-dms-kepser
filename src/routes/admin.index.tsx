import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { DashboardShell } from '#/components/dashboard/DashboardShell'
import { StatsBento } from '#/components/dashboard/StatsBento'
import { apiFetch } from '#/lib/api-client'
import { ROLES } from '#/lib/constants/roles'

type AuthSessionResponse = {
  session: { userId: string; email: string; userName?: string | null } | null
  roles: string[]
  activeRole: string | null
}

export const Route = createFileRoute('/admin/')({
  component: AdminDashboard,
})

function AdminDashboard() {
  useEffect(() => {
    async function checkAuth() {
      try {
        const auth = await apiFetch<AuthSessionResponse>('/auth/session')
        if (!auth.session) { window.location.href = '/login'; return }
        if (!auth.roles.includes(ROLES.ADMIN)) { window.location.href = '/forbidden'; return }
      } catch {
        window.location.href = '/login'
      }
    }
    checkAuth()
  }, [])

  return (
    <DashboardShell role="ADMIN">
      <StatsBento role="ADMIN" />
    </DashboardShell>
  )
}
