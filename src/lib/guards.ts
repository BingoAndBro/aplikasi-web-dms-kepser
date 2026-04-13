import { redirect } from '@tanstack/react-router'
import type { RoleName } from './types/auth'
import { createServerSupabaseClient } from './supabase-server'
import { getSession, hasRole, hasAnyRole } from './auth'

/**
 * SSR route guard: require authenticated user.
 * Throw redirect ke /login jika tidak ada session.
 */
export async function requireAuth(event: { request: Request }) {
  const supabase = createServerSupabaseClient(event, event.request.headers.get('cookie'))
  const session = await getSession(supabase)
  if (!session) {
    throw redirect({ to: '/login' })
  }
  return session
}

/**
 * SSR route guard: require specific role.
 * Throw 403 jika tidak punya role.
 */
export async function guardRole(event: { request: Request }, role: RoleName): Promise<void> {
  const session = await requireAuth(event)
  const supabase = createServerSupabaseClient(event, event.request.headers.get('cookie'))
  const hasTheRole = await hasRole(supabase, session.user.id, role)
  if (!hasTheRole) {
    throw redirect({ to: '/forbidden' })
  }
}

/**
 * SSR route guard: require any of the specified roles.
 * Throw redirect ke /forbidden jika tidak punya satupun role.
 */
export async function guardAnyRole(event: { request: Request }, roles: RoleName[]): Promise<void> {
  const session = await requireAuth(event)
  const supabase = createServerSupabaseClient(event, event.request.headers.get('cookie'))
  const hasAny = await hasAnyRole(supabase, session.user.id, roles)
  if (!hasAny) {
    throw redirect({ to: '/forbidden' })
  }
}
