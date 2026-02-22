/**
 * Unified Authentication Guards
 * 统一鉴权守卫函数
 * 
 * 提供标准化的鉴权入口，所有 Route Handler 应通过这些守卫进行鉴权
 * 
 * 使用模式:
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   const authResult = await requireAdmin(request)
 *   if (!authResult.success) return authResult.response
 *   // ... 执行业务逻辑
 * }
 * ```
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { verifyCronSecret as verifyCronSecretImpl } from '@/lib/cron/verify-cron-secret'

export interface AuthGuardResult<T = { user: { id: string }; profile: { role: string } }> {
  success: true
  data: T
}

export interface AuthGuardFailure {
  success: false
  response: NextResponse
}

export type GuardResult<T = { user: { id: string }; profile: { role: string } }> = 
  | AuthGuardResult<T> 
  | AuthGuardFailure

/**
 * 基础用户鉴权
 * 验证请求是否来自已登录用户
 * 
 * @param request - NextRequest 对象
 * @returns GuardResult 包含用户信息或错误响应
 */
export async function requireUser(
  request: NextRequest
): Promise<GuardResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Unauthorized', message: 'Please login to access this resource' },
        { status: 401 }
      ),
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Profile not found', message: 'User profile not found' },
        { status: 404 }
      ),
    }
  }

  // 检查用户是否被封禁
  if (profile.status === 'banned' || profile.status === 'suspended') {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Account suspended', message: 'Your account has been suspended' },
        { status: 403 }
      ),
    }
  }

  return {
    success: true,
    data: { user, profile },
  }
}

/**
 * 要求指定角色
 * 验证用户是否具有指定角色之一
 * 
 * @param request - NextRequest 对象
 * @param allowedRoles - 允许的角色列表
 * @returns GuardResult 包含用户信息或错误响应
 */
export async function requireRole(
  request: NextRequest,
  allowedRoles: string[]
): Promise<GuardResult> {
  const userResult = await requireUser(request)
  
  if (!userResult.success) {
    return userResult
  }

  const { profile } = userResult.data

  if (!allowedRoles.includes(profile.role)) {
    return {
      success: false,
      response: NextResponse.json(
        { 
          error: 'Forbidden', 
          message: `Access denied. Required role: ${allowedRoles.join(' or ')}` 
        },
        { status: 403 }
      ),
    }
  }

  return userResult
}

/**
 * 要求管理员角色
 * 
 * @param request - NextRequest 对象
 * @returns GuardResult 包含管理员信息或错误响应
 */
export async function requireAdmin(
  request: NextRequest
): Promise<GuardResult> {
  return requireRole(request, ['admin'])
}

/**
 * 要求管理员或客服角色
 * 
 * @param request - NextRequest 对象
 * @returns GuardResult 包含用户信息或错误响应
 */
export async function requireAdminOrSupport(
  request: NextRequest
): Promise<GuardResult> {
  return requireRole(request, ['admin', 'support'])
}

/**
 * 要求卖家角色
 * 
 * @param request - NextRequest 对象
 * @returns GuardResult 包含卖家信息或错误响应
 */
export async function requireSeller(
  request: NextRequest
): Promise<GuardResult> {
  const userResult = await requireUser(request)
  
  if (!userResult.success) {
    return userResult
  }

  const { user, profile } = userResult.data
  const supabase = await createClient()

  // 检查卖家订阅状态
  const { data: sellerProfile, error } = await supabase
    .from('profiles')
    .select('seller_subscription_active, seller_type')
    .eq('id', user.id)
    .single()

  if (error || !sellerProfile) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Seller profile not found' },
        { status: 404 }
      ),
    }
  }

  const isDirectSeller = sellerProfile.seller_type === 'direct'
  const hasActiveSubscription = sellerProfile.seller_subscription_active === true

  if (!isDirectSeller && !hasActiveSubscription) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Active seller subscription required' },
        { status: 403 }
      ),
    }
  }

  return {
    success: true,
    data: { user, profile: { ...profile, ...sellerProfile } },
  }
}

/**
 * 要求带货员角色
 * 
 * @param request - NextRequest 对象
 * @returns GuardResult 包含带货员信息或错误响应
 */
export async function requireAffiliate(
  request: NextRequest
): Promise<GuardResult> {
  const userResult = await requireUser(request)
  
  if (!userResult.success) {
    return userResult
  }

  const { user, profile } = userResult.data
  const supabase = await createClient()

  // 检查带货订阅状态
  const { data: affiliateProfile, error } = await supabase
    .from('profiles')
    .select('affiliate_subscription_active, user_origin, internal_affiliate_enabled')
    .eq('id', user.id)
    .single()

  if (error || !affiliateProfile) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Affiliate profile not found' },
        { status: 404 }
      ),
    }
  }

  const isInternalUser = affiliateProfile.user_origin === 'internal'
  const hasInternalAffiliate = affiliateProfile.internal_affiliate_enabled === true
  const hasAffiliateSubscription = affiliateProfile.affiliate_subscription_active === true
  const isAffiliate = isInternalUser 
    ? (hasInternalAffiliate || hasAffiliateSubscription)
    : hasAffiliateSubscription

  if (!isAffiliate) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Active affiliate subscription required' },
        { status: 403 }
      ),
    }
  }

  return {
    success: true,
    data: { user, profile: { ...profile, ...affiliateProfile } },
  }
}

/**
 * 要求打赏功能权限
 * 
 * @param request - NextRequest 对象
 * @returns GuardResult 包含用户信息或错误响应
 */
export async function requireTipEnabled(
  request: NextRequest
): Promise<GuardResult> {
  const userResult = await requireUser(request)
  
  if (!userResult.success) {
    return userResult
  }

  const { user, profile } = userResult.data
  const supabase = await createClient()

  // 检查打赏权限
  const { data: tipProfile, error } = await supabase
    .from('profiles')
    .select('tip_subscription_active, user_origin, internal_tip_enabled')
    .eq('id', user.id)
    .single()

  if (error || !tipProfile) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      ),
    }
  }

  const isInternalUser = tipProfile.user_origin === 'internal'
  const hasInternalTip = tipProfile.internal_tip_enabled === true
  const hasTipSubscription = tipProfile.tip_subscription_active === true
  const isTipEnabled = isInternalUser 
    ? (hasInternalTip || hasTipSubscription)
    : hasTipSubscription

  if (!isTipEnabled) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Tip feature not enabled' },
        { status: 403 }
      ),
    }
  }

  return {
    success: true,
    data: { user, profile: { ...profile, ...tipProfile } },
  }
}

/**
 * Cron 任务鉴权
 * 验证请求是否携带有效的 CRON_SECRET
 * 
 * @param request - NextRequest 对象
 * @returns null 表示通过，NextResponse 表示失败响应
 */
export function requireCron(request: NextRequest): NextResponse | null {
  return verifyCronSecretImpl(request)
}

/**
 * 重导出 verifyCronSecret 以保持兼容性
 * @deprecated 使用 requireCron 替代
 */
export { verifyCronSecretImpl as verifyCronSecret }

/**
 * 获取管理员客户端（带鉴权检查）
 * 仅在确认用户有管理员权限后才返回 admin client
 * 
 * @param request - NextRequest 对象
 * @returns 包含 admin client 的 GuardResult 或错误响应
 */
export async function requireAdminWithClient(
  request: NextRequest
): Promise<GuardResult<{ user: { id: string }; profile: { role: string }; supabaseAdmin: Awaited<ReturnType<typeof getSupabaseAdmin>> }>> {
  const adminResult = await requireAdmin(request)
  
  if (!adminResult.success) {
    return adminResult
  }

  try {
    const supabaseAdmin = await getSupabaseAdmin()
    return {
      success: true,
      data: {
        ...adminResult.data,
        supabaseAdmin,
      },
    }
  } catch (error) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Internal server error', message: 'Failed to initialize admin client' },
        { status: 500 }
      ),
    }
  }
}

/**
 * 权限检查辅助函数
 * 检查用户是否具有特定权限（基于角色的简单权限模型）
 * 
 * @param profile - 用户 profile
 * @param permission - 权限标识
 * @returns boolean 是否具有权限
 */
export function hasPermission(
  profile: { role: string },
  permission: string
): boolean {
  const permissionMap: Record<string, string[]> = {
    admin: ['*'], // 管理员拥有所有权限
    support: [
      'ticket.read',
      'ticket.update',
      'ticket.assign',
      'user.read',
      'user.ban',
      'user.unban',
    ],
    seller: [
      'product.create',
      'product.update',
      'product.delete',
      'order.read',
      'order.update',
    ],
    affiliate: [
      'product.promote',
      'commission.read',
    ],
    user: [
      'profile.read',
      'profile.update',
      'order.create',
    ],
  }

  const permissions = permissionMap[profile.role] || []
  return permissions.includes('*') || permissions.includes(permission)
}

/**
 * 要求特定权限
 * 
 * @param request - NextRequest 对象
 * @param permission - 权限标识
 * @returns GuardResult 包含用户信息或错误响应
 */
export async function requirePermission(
  request: NextRequest,
  permission: string
): Promise<GuardResult> {
  const userResult = await requireUser(request)
  
  if (!userResult.success) {
    return userResult
  }

  const { profile } = userResult.data

  if (!hasPermission(profile, permission)) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Forbidden', message: `Permission denied: ${permission}` },
        { status: 403 }
      ),
    }
  }

  return userResult
}
