import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** True when real Supabase credentials are configured. Without them the app
 *  runs in local demo mode (see lib/queries/demo.ts) and this client is a
 *  placeholder that never gets used. */
export const hasSupabaseEnv = Boolean(url && anonKey)

export const supabase = createClient<Database>(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
)
