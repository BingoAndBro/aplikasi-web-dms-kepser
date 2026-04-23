import { redirect } from '@tanstack/react-router'
import type { RoleName } from './types/auth'
import { createServerSupabaseClient, type ServerEventContext } from './supabase-server'
import { getServerSession, hasRole, hasAnyRole } from './auth'

/**
 * SSR route guard: require authenticated user.
 * Throw redirect ke /login jika tidak ada session.
 */
export async function requireAuth(event: ServerEventContext) {
  const cookieHeader = event.request.headers.get('cookie') ?? null
  const supabase = createServerSupabaseClient(event, cookieHeader)
  const session = await getServerSession(supabase)
  if (!session) {
    throw redirect({ to: '/login' })
  }
  return session
}

/**
 * SSR route guard: require specific role.
 * Throw 403 jika tidak punya role.
 */
export async function guardRole(event: ServerEventContext, role: RoleName): Promise<void> {
  const session = await requireAuth(event)
  const cookieHeader = event.request.headers.get('cookie') ?? null
  const supabase = createServerSupabaseClient(event, cookieHeader)
  const hasTheRole = await hasRole(supabase, session.user.id, role)
  if (!hasTheRole) {
    throw redirect({ to: '/forbidden' })
  }
}

/**
 * SSR route guard: require any of the specified roles.
 * Throw redirect ke /forbidden jika tidak punya satupun role.
 */
export async function guardAnyRole(event: ServerEventContext, roles: RoleName[]): Promise<void> {
  const session = await requireAuth(event)
  const cookieHeader = event.request.headers.get('cookie') ?? null
  const supabase = createServerSupabaseClient(event, cookieHeader)
  const hasAny = await hasAnyRole(supabase, session.user.id, roles)
  if (!hasAny) {
    throw redirect({ to: '/forbidden' })
  }
}
