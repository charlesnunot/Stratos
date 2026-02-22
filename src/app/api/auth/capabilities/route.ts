/**
 * GET /api/auth/capabilities
 * 返回当前用户的能力列表（capability snapshot）
 * 用于前端权限判断，避免前端重复实现权限逻辑
 * 前端应以此 API 返回的数据作为权限判断的唯一真相源
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserCapabilities, Role } from '@/lib/auth/permissions'

export interface CapabilitySnapshot {
  userId: string
  role: Role
  capabilities: string[]
  subscriptions: {
    seller: boolean
    affiliate: boolean
    tip: boolean
  }
  metadata: {
    isInternalUser: boolean
    sellerType: string | null
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // 获取当前用户
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Please login to access this resource' },
        { status: 401 }
      )
    }

    // 获取用户 profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, seller_subscription_active, affiliate_subscription_active, tip_subscription_active, user_origin, seller_type')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Profile not found', message: 'User profile not found' },
        { status: 404 }
      )
    }

    // 获取用户能力列表
    const role = profile.role as Role
    const capabilities = getUserCapabilities(role)

    // 构建 capability snapshot
    const snapshot: CapabilitySnapshot = {
      userId: user.id,
      role,
      capabilities,
      subscriptions: {
        seller: profile.seller_subscription_active === true || profile.seller_type === 'direct',
        affiliate: profile.affiliate_subscription_active === true,
        tip: profile.tip_subscription_active === true,
      },
      metadata: {
        isInternalUser: profile.user_origin === 'internal',
        sellerType: profile.seller_type,
      },
    }

    return NextResponse.json(snapshot)
  } catch (error) {
    console.error('Get capabilities error:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to get user capabilities' },
      { status: 500 }
    )
  }
}
