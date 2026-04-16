import { createServerClient } from '@supabase/ssr'

export type CookieParser = (cookieHeader: string | null) => Array<{ name: string; value: string }>

/**
 * Parse cookie string into array of { name, value }
 */
function parseCookies(cookieHeader: string | null): Array<{ name: string; value: string }> {
  if (!cookieHeader) return []
  return cookieHeader.split('; ').map(c => {
    const eqIdx = c.indexOf('=')
    if (eqIdx === -1) return { name: c.trim(), value: '' }
    return { name: c.substring(0, eqIdx).trim(), value: decodeURIComponent(c.substring(eqIdx + 1)) }
  })
}

export type ServerEventContext = {
  request: Request
  cookie: {
    get: (name: string) => { value: string } | undefined
    set: (name: string, value: string, options?: object) => void
    delete: (name: string) => void
  }
}

/**
 * Create Supabase server client with cookie management for TanStack Start SSR.
 *
 * @param event - TanStack Start beforeLoad event context
 * @param cookieHeader - Raw cookie header string from request (fallback if event.cookie unavailable)
 */
export function createServerSupabaseClient(
  event: ServerEventContext,
  cookieHeader?: string | null
) {
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          // Try to get cookies from event.cookie if available
          if (event?.cookie) {
            // For read access, we need raw cookies from request headers
            // event.cookie is for writing, so we parse from the request
            const rawCookie = cookieHeader ?? event.request.headers.get('cookie') ?? null
            return parseCookies(rawCookie)
          }
          return parseCookies(cookieHeader ?? null)
        },
        setAll(cookiesToSet) {
          if (!event?.cookie) return
          cookiesToSet.forEach(({ name, value, options }) => {
            event.cookie.set(name, value, {
              path: '/',
              sameSite: 'lax',
              httpOnly: false, // Need readable by client for active_role switcher
              secure: process.env.NODE_ENV === 'production',
              maxAge: 60 * 60 * 24 * 30, // 30 days
              ...options,
            })
          })
        },
      },
    }
  )
}
