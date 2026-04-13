import { createClient } from '@supabase/supabase-js'

/**
 * Admin client — menggunakan service role key.
 * HANYA untuk server-side. JANGAN import di client-side code.
 */
export function createAdminClient() {
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. ' +
      'Admin client cannot be used without service role key.'
    )
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
