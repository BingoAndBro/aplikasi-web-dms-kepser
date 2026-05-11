import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import { getBrowserClient } from '#/lib/supabase-browser'
import { guardRole } from '#/lib/guards'

export const Route = createFileRoute('/ppk')({
  beforeLoad: ({ event }) => {
    guardRole('PPK')(event)
  },
  component: PpkLayout,
})

function PpkLayout() {
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
      if (!roleNames.includes('PPK')) { window.location.href = '/forbidden'; return }
    }
    checkAuth()
  }, [])

  return <Outlet />
}
