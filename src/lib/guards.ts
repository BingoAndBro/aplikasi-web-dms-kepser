import { redirect } from '@tanstack/react-router'
import type { RoleName } from './types/auth'
import { createServerSupabaseClient, type ServerEventContext } from './supabase-server'
import { getServerSession, hasRole, hasAnyRole } from './auth'
import { getBrowserClient } from './supabase-browser'

type GuardContext = Partial<ServerEventContext> | null | undefined

function hasServerRequest(event: GuardContext): event is ServerEventContext {
  return !!event?.request
}

async function getClientSession() {
  if (typeof window === 'undefined') return null
  const supabase = getBrowserClient()
  if (!supabase) return null

  const { data: { session } } = await supabase.auth.getSession()
  return session
}

/**
 * Route guard: require authenticated user.
 * Throw redirect ke /login jika tidak ada session.
 */
export async function requireAuth(event?: GuardContext) {
  if (!hasServerRequest(event)) {
    const session = await getClientSession()
    if (!session) {
      throw redirect({ to: '/login' })
    }
    return session
  }

  const cookieHeader = event.request.headers.get('cookie') ?? null
  const supabase = createServerSupabaseClient(event, cookieHeader)
  const session = await getServerSession(supabase)
  if (!session) {
    throw redirect({ to: '/login' })
  }
  return session
}

/**
 * Route guard: require specific role.
 * Throw 403 jika tidak punya role.
 */
export async function guardRole(event: GuardContext, role: RoleName): Promise<void> {
  const session = await requireAuth(event)

  if (!hasServerRequest(event)) {
    const supabase = getBrowserClient()
    if (!supabase) {
      throw redirect({ to: '/login' })
    }

    const hasTheRole = await hasRole(supabase, session.user.id, role)
    if (!hasTheRole) {
      throw redirect({ to: '/forbidden' })
    }
    return
  }

  const cookieHeader = event.request.headers.get('cookie') ?? null
  const supabase = createServerSupabaseClient(event, cookieHeader)
  const hasTheRole = await hasRole(supabase, session.user.id, role)
  if (!hasTheRole) {
    throw redirect({ to: '/forbidden' })
  }
}

/**
 * Route guard: require any of the specified roles.
 * Throw redirect ke /forbidden jika tidak punya satupun role.
 */
export async function guardAnyRole(event: GuardContext, roles: RoleName[]): Promise<void> {
  const session = await requireAuth(event)

  if (!hasServerRequest(event)) {
    const supabase = getBrowserClient()
    if (!supabase) {
      throw redirect({ to: '/login' })
    }

    const hasAny = await hasAnyRole(supabase, session.user.id, roles)
    if (!hasAny) {
      throw redirect({ to: '/forbidden' })
    }
    return
  }

  const cookieHeader = event.request.headers.get('cookie') ?? null
  const supabase = createServerSupabaseClient(event, cookieHeader)
  const hasAny = await hasAnyRole(supabase, session.user.id, roles)
  if (!hasAny) {
    throw redirect({ to: '/forbidden' })
  }
}
