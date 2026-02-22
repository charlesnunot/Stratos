/**
 * Penalty automation for overdue commission payments
 * Applies escalating penalties: warning → restrict_sales → suspend → disable
 */

import { SupabaseClient } from '@supabase/supabase-js'

export async function checkAndApplyPenalties(supabaseAdmin: SupabaseClient): Promise<void> {
  try {
    // Find all overdue obligations
    const { data: overdueObligations, error: obligationsError } = await supabaseAdmin
      .from('commission_payment_obligations')
      .select('*')
      .eq('status', 'pending')
      .lt('due_date', new Date().toISOString())

    if (obligationsError) {
      console.error('Error fetching overdue obligations:', obligationsError)
      return
    }

    if (!overdueObligations || overdueObligations.length === 0) {
      return
    }

    // Process each overdue obligation
    for (const obligation of overdueObligations) {
      // Check penalty history for this seller
      const { data: penalties, error: penaltiesError } = await supabaseAdmin
        .from('seller_penalties')
        .select('*')
        .eq('seller_id', obligation.seller_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })

      if (penaltiesError) {
        console.error('Error fetching penalties:', penaltiesError)
        continue
      }

      const penaltyCount = penalties?.length || 0

      // Determine penalty type based on count
      let penaltyType: 'warning' | 'restrict_sales' | 'suspend' | 'disable'
      if (penaltyCount === 0) {
        penaltyType = 'warning'
      } else if (penaltyCount === 1) {
        penaltyType = 'restrict_sales'
      } else if (penaltyCount === 2) {
        penaltyType = 'suspend'
      } else {
        penaltyType = 'disable'
      }

      // Apply penalty using database function
      const { error: penaltyError } = await supabaseAdmin.rpc('apply_commission_penalty', {
        p_seller_id: obligation.seller_id,
        p_obligation_id: obligation.id,
      })

      if (penaltyError) {
        console.error('Error applying penalty:', penaltyError)
        continue
      }

      // Update obligation status to 'overdue'
      await supabaseAdmin
        .from('commission_payment_obligations')
        .update({ status: 'overdue' })
        .eq('id', obligation.id)

      // Apply penalty actions based on type
      if (penaltyType === 'restrict_sales') {
        // Disable new product creation
        // This would be handled by application logic checking penalty status
      } else if (penaltyType === 'suspend') {
        // Update profile role to suspended
        await supabaseAdmin
          .from('profiles')
          .update({ role: 'seller_suspended' })
          .eq('id', obligation.seller_id)
      } else if (penaltyType === 'disable') {
        // Update profile role to disabled
        await supabaseAdmin
          .from('profiles')
          .update({ role: 'user' }) // Remove seller role
          .eq('id', obligation.seller_id)

        // Disable all products
        await supabaseAdmin
          .from('products')
          .update({ status: 'hidden' })
          .eq('seller_id', obligation.seller_id)
      }

      console.log(`Applied ${penaltyType} penalty to seller ${obligation.seller_id}`)
    }
  } catch (error: any) {
    console.error('checkAndApplyPenalties error:', error)
  }
}
