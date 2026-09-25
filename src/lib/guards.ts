import { redirect } from '@tanstack/react-router'
import type { RoleName } from './types/auth'
import { getClientAuthState, type ClientAuthState } from './auth-state'
import { logDev, warnDev } from './dev-logger'

/**
 * Route guard: require authenticated user.
 * Throw redirect ke /login jika tidak ada session.
 */
function requireAuth(
  currentAuthState?: ClientAuthState | null,
): ClientAuthState | null {
  const authState = currentAuthState ?? getClientAuthState()
  logDev('[GUARD] requireAuth', {
    userId: authState?.userId,
    userRoles: authState?.roles ?? [],
    activeUxRole: authState?.activeRole,
    isReady: authState?.isReady,
  }, `requireAuth:${authState?.userId ?? 'none'}:${authState?.activeRole ?? 'none'}:${authState?.isReady ? '1' : '0'}`)

  if (!authState || !authState.isReady) {
    warnDev('[GUARD] skip requireAuth karena belum ready', {
      isReady: authState?.isReady ?? null,
      userId: authState?.userId ?? null,
    }, `requireAuth-skip:${authState?.userId ?? 'none'}:${authState?.isReady ? '1' : '0'}`)
    return null
  }

  if (!authState.userId || authState.status !== 'authenticated') {
    throw redirect({ to: '/login' })
  }

  return authState
}

/**
 * Route guard: require specific role.
 * Throw 403 jika tidak punya role.
 */
export function guardRole(role: RoleName) {
  return (): void => {
    const authState = getClientAuthState()

    if (!authState || !authState.isReady) {
      warnDev('[GUARD] skip guardRole karena belum ready', {
        isReady: authState?.isReady ?? null,
        userId: authState?.userId ?? null,
      }, `guardRole-skip:${authState?.userId ?? 'none'}:${authState?.isReady ? '1' : '0'}`)
      return
    }

    const authenticatedState = requireAuth(authState)
    if (!authenticatedState) return

    logDev('[GUARD] guardRole', {
      requiredRouteRole: role,
      userId: authenticatedState.userId,
      userRoles: authenticatedState.roles ?? [],
      activeUxRole: authenticatedState.activeRole,
    }, `guardRole:${role}:${authenticatedState.userId ?? 'none'}:${authenticatedState.activeRole ?? 'none'}`)

    if (!authenticatedState.roles?.includes(role)) {
      throw redirect({ to: '/forbidden' })
    }
  }
}
