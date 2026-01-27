/**
 * API endpoint for creating affiliate posts
 * Validates subscription status and creates affiliate_posts + affiliate_products records
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { product_id, content, images, location } = body

    if (!product_id) {
      return NextResponse.json(
        { error: 'Missing required field: product_id' },
        { status: 400 }
      )
    }

    // Verify user has active affiliate subscription using database function
    const { data: hasSubscription, error: subCheckError } = await supabase.rpc(
      'check_subscription_status',
      {
        p_user_id: user.id,
        p_subscription_type: 'affiliate',
        p_required_tier: null,
      }
    )

    if (subCheckError) {
      console.error('[affiliate/posts/create] Error checking subscription:', subCheckError)
      return NextResponse.json(
        { error: 'Failed to verify subscription status' },
        { status: 500 }
      )
    }

    if (!hasSubscription) {
      return NextResponse.json(
        { error: 'You need an active affiliate subscription to create promotional posts' },
        { status: 403 }
      )
    }

    // Get product to get commission_rate
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, commission_rate, allow_affiliate')
      .eq('id', product_id)
      .single()

    if (productError || !product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    if (!product.allow_affiliate) {
      return NextResponse.json(
        { error: 'This product does not allow affiliate promotion' },
        { status: 400 }
      )
    }

    // Create post
    const { data: post, error: postError } = await supabase
      .from('posts')
      .insert({
        user_id: user.id,
        content: content || null,
        image_urls: images || [],
        location: location || null,
        status: 'pending', // Needs approval
      })
      .select()
      .single()

    if (postError) {
      console.error('[affiliate/posts/create] Error creating post:', postError)
      return NextResponse.json(
        { error: 'Failed to create post', details: postError.message },
        { status: 500 }
      )
    }

    // Create affiliate_posts record
    const { data: affiliatePost, error: affiliateError } = await supabase
      .from('affiliate_posts')
      .insert({
        post_id: post.id,
        product_id: product_id,
        affiliate_id: user.id,
      })
      .select()
      .single()

    if (affiliateError) {
      console.error('[affiliate/posts/create] Error creating affiliate_post:', affiliateError)
      // Rollback: delete the post if affiliate_post creation fails
      await supabase.from('posts').delete().eq('id', post.id)
      return NextResponse.json(
        { error: 'Failed to create affiliate post', details: affiliateError.message },
        { status: 500 }
      )
    }

    // Create affiliate_products record with default commission_rate
    const commissionRate = product.commission_rate || 0
    if (commissionRate > 0) {
      const { error: affiliateProductError } = await supabase
        .from('affiliate_products')
        .insert({
          product_id: product_id,
          affiliate_id: user.id,
          post_id: post.id,
          commission_rate: commissionRate,
          status: 'active',
        })

      if (affiliateProductError) {
        console.error('[affiliate/posts/create] Error creating affiliate_product:', affiliateProductError)
        // Don't fail the request, just log the error
        // The commission calculation can still use product.commission_rate as fallback
      }
    }

    return NextResponse.json(
      {
        post_id: post.id,
        affiliate_post_id: affiliatePost.id,
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    const err = error as { message?: string; stack?: string }
    console.error('[affiliate/posts/create] Unexpected error:', {
      message: err?.message,
      stack: err?.stack,
    })
    return NextResponse.json(
      {
        error: err?.message ?? 'Failed to create affiliate post',
        details: 'An unexpected error occurred. Check server logs for more context.',
      },
      { status: 500 }
    )
  }
}
