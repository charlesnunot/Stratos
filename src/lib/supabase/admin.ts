/**
 * Supabase Admin Client utilities
 * Provides unified admin client creation with proper error handling
 */

import { createClient } from '@supabase/supabase-js'

/**
 * Get Supabase admin client
 * Creates a new client instance for each call (safe for serverless)
 * 
 * @throws Error if SUPABASE_SERVICE_ROLE_KEY is not configured
 */
export async function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Supabase admin client configuration missing. ' +
      'Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY'
    )
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
