// Unified Supabase client factory
// Pilih server atau browser client berdasarkan environment

export { createServerSupabaseClient } from './supabase-server'
export type { ServerEventContext } from './supabase-server'
export { getBrowserClient } from './supabase-browser'
