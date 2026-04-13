import { createBrowserClient as makeBrowserClient } from '@supabase/ssr'

// Singleton instance untuk use di seluruh client-side code
let browserClient: ReturnType<typeof makeBrowserClient> | null = null

export function getBrowserClient() {
  if (!browserClient) {
    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL) as string | undefined
    const supabaseKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY) as string | undefined

    if (!supabaseUrl || !supabaseKey) {
      console.error('[supabase-browser] SUPABASE_URL or SUPABASE_ANON_KEY is undefined! Check .env file.')
      return null
    }

    browserClient = makeBrowserClient(supabaseUrl, supabaseKey)
  }
  return browserClient
}
