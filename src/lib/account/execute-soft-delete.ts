/**
 * Execute soft delete: set profiles.status = 'deleted' for a user.
 * Used by admin approve flow; does not sign out the user (next request will see deleted status).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export async function executeSoftDelete(
  supabase: SupabaseClient,
  userId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('profiles')
    .update({ status: 'deleted', updated_at: new Date().toISOString() })
    .eq('id', userId)

  return { error: error?.message ?? null }
}
