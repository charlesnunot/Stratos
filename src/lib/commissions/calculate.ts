/**
 * Calculate and create commission records for orders
 */

interface OrderDetails {
  id: string
  affiliate_id?: string | null
  affiliate_post_id?: string | null
  total_amount: number
  commission_amount?: number
  product_id?: string | null
  order_items?: Array<{
    product_id: string
    quantity: number
    price?: number
  }>
}

/**
 * Calculate commission for an order
 */
export async function calculateAndCreateCommissions(
  order: OrderDetails,
  supabaseAdmin: any
) {
  // If no affiliate is associated, no commission needed
  // Check both affiliate_post_id and affiliate_id for backward compatibility
  if (!order.affiliate_post_id && !order.affiliate_id) {
    return null
  }

  // If we have affiliate_post_id, get affiliate_id from it
  let affiliateId = order.affiliate_id
  if (order.affiliate_post_id && !affiliateId) {
    const { data: affiliatePost } = await supabaseAdmin
      .from('affiliate_posts')
      .select('affiliate_id')
      .eq('id', order.affiliate_post_id)
      .single()
    
    if (affiliatePost) {
      affiliateId = affiliatePost.affiliate_id
    } else {
      // Invalid affiliate_post_id, skip commission calculation
      return null
    }
  }

  if (!affiliateId) {
    return null
  }

  const commissions: any[] = []

  // Handle order_items (multiple products)
  if (order.order_items && order.order_items.length > 0) {
    for (const item of order.order_items) {
      // Get product details including commission rate
      const { data: product } = await supabaseAdmin
        .from('products')
        .select('commission_rate, seller_id')
        .eq('id', item.product_id)
        .single()

      if (!product) continue

      // Check if there's an affiliate_product record for this specific combination
      // If we have affiliate_post_id, also match by post_id for more precise matching
      let affiliateProductQuery = supabaseAdmin
        .from('affiliate_products')
        .select('commission_rate')
        .eq('product_id', item.product_id)
        .eq('affiliate_id', affiliateId)
        .eq('status', 'active')
      
      if (order.affiliate_post_id) {
        affiliateProductQuery = affiliateProductQuery.eq('post_id', order.affiliate_post_id)
      }
      
      const { data: affiliateProduct } = await affiliateProductQuery.single()

      // Use affiliate_product commission_rate if available, otherwise use product commission_rate
      const commissionRate = affiliateProduct?.commission_rate || product.commission_rate

      if (!commissionRate || commissionRate <= 0) continue

      // Calculate commission amount
      const itemTotal = (item.price || 0) * item.quantity
      const commissionAmount = (itemTotal * commissionRate) / 100

      if (commissionAmount <= 0) continue

        // Create commission record
        const { data: commission, error } = await supabaseAdmin
          .from('affiliate_commissions')
          .insert({
            affiliate_id: affiliateId,
            order_id: order.id,
            product_id: item.product_id,
            amount: commissionAmount,
            commission_rate: commissionRate,
            status: 'pending', // Will be paid after order completion
          })
          .select()
          .single()

      if (error) {
        console.error('Error creating commission:', error)
      } else if (commission) {
        commissions.push(commission)

        // Update order commission_amount
        await supabaseAdmin
          .from('orders')
          .update({
            commission_amount: (order.commission_amount || 0) + commissionAmount,
          })
          .eq('id', order.id)

        // Create notification for affiliate
        await supabaseAdmin.from('notifications').insert({
          user_id: affiliateId,
          type: 'commission',
          title: '收到新佣金',
          content: `订单 ${order.id.substring(0, 8)}... 产生了 ¥${commissionAmount.toFixed(2)} 佣金`,
          related_id: order.id,
          related_type: 'order',
          link: `/affiliate/commissions?order=${order.id}`,
        })
      }
    }
  }
  // Handle single product (legacy format)
  else if (order.product_id) {
    // Get product details including commission rate
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('commission_rate, seller_id')
      .eq('id', order.product_id)
      .single()

    if (product) {
      // Check if there's an affiliate_product record
      // If we have affiliate_post_id, also match by post_id for more precise matching
      let affiliateProductQuery = supabaseAdmin
        .from('affiliate_products')
        .select('commission_rate')
        .eq('product_id', order.product_id)
        .eq('affiliate_id', affiliateId)
        .eq('status', 'active')
      
      if (order.affiliate_post_id) {
        affiliateProductQuery = affiliateProductQuery.eq('post_id', order.affiliate_post_id)
      }
      
      const { data: affiliateProduct } = await affiliateProductQuery.single()

      // Use affiliate_product commission_rate if available, otherwise use product commission_rate
      const commissionRate = affiliateProduct?.commission_rate || product.commission_rate

      if (commissionRate && commissionRate > 0) {
        // Calculate commission amount
        const commissionAmount = (order.total_amount * commissionRate) / 100

        if (commissionAmount > 0) {
          // Create commission record
          const { data: commission, error } = await supabaseAdmin
            .from('affiliate_commissions')
            .insert({
              affiliate_id: affiliateId,
              order_id: order.id,
              product_id: order.product_id,
              amount: commissionAmount,
              commission_rate: commissionRate,
              status: 'pending',
            })
            .select()
            .single()

          if (error) {
            console.error('Error creating commission:', error)
          } else if (commission) {
            commissions.push(commission)

            // Update order commission_amount
            await supabaseAdmin
              .from('orders')
              .update({
                commission_amount: commissionAmount,
              })
              .eq('id', order.id)

            // Create notification for affiliate
            await supabaseAdmin.from('notifications').insert({
              user_id: affiliateId,
              type: 'commission',
              title: '收到新佣金',
              content: `订单 ${order.id.substring(0, 8)}... 产生了 ¥${commissionAmount.toFixed(2)} 佣金`,
              related_id: order.id,
              related_type: 'order',
            })
          }
        }
      }
    }
  }

  return commissions
}
