import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { getConfigValue } from './env'

export function createSupabaseAdminClient() {
  const supabaseUrl = getConfigValue([
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_URL',
    'REACT_APP_SUPABASE_URL',
  ])
  const serviceRoleKey = getConfigValue([
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_KEY',
    'SUPABASE_SERVICE_ROLE',
  ])

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
