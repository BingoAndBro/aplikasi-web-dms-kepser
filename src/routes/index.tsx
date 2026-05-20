import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { getClientAuthState } from '#/lib/auth-state'
import { getDefaultRouteForRoles, ROUTES } from '#/lib/constants/routes'

export const Route = createFileRoute('/')({
  component: RootDefaultRedirect,
})

function RootDefaultRedirect() {
  useEffect(() => {
    const authState = getClientAuthState()

    if (!authState.isReady) return

    if (authState.status !== 'authenticated' || !authState.userId) {
      window.location.href = ROUTES.LOGIN
      return
    }

    const defaultRoute = getDefaultRouteForRoles(authState.roles, authState.activeRole)
    if (defaultRoute !== ROUTES.HOME) {
      window.location.replace(defaultRoute)
    }
  }, [])

  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
