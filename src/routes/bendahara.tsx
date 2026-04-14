import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { getBrowserClient } from '#/lib/supabase-browser'
import { DashboardShell } from '#/components/dashboard/DashboardShell'
import { StatsBento } from '#/components/dashboard/StatsBento'

export const Route = createFileRoute('/bendahara')({
  component: BendaharaDashboard,
})

function BendaharaDashboard() {
  useEffect(() => {
    async function checkAuth() {
      const supabase = getBrowserClient()
      if (!supabase) { window.location.href = '/login'; return }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.href = '/login'; return }
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('role:roles(nama)')
        .eq('user_id', session.user.id)
      const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
      if (!roleNames.includes('BENDAHARA')) { window.location.href = '/forbidden'; return }
    }
    checkAuth()
  }, [])

  return (
    <DashboardShell role="BENDAHARA">
      <StatsBento role="BENDAHARA" />
    </DashboardShell>
  )
}
