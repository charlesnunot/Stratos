import { NextRequest, NextResponse } from 'next/server'
import { withApiLogging } from '@/lib/api/logger'
import { RateLimitConfigs } from '@/lib/api/rate-limit'

/**
 * 验证密码强度
 * 后端验证密码强度，防止客户端绕过验证
 * 限流：按 IP 每分钟 10 次（RateLimitConfigs.AUTH），并记录审计日志（不记录 body/密码）
 */
async function validatePasswordHandler(request: NextRequest) {
  const { password } = await request.json()

  if (!password) {
    return NextResponse.json(
      { error: '密码不能为空' },
      { status: 400 }
    )
  }

  // 密码强度验证规则
  const minLength = 6
  const hasLower = /[a-z]/.test(password)
  const hasUpper = /[A-Z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const hasSpecial = /[^a-zA-Z0-9]/.test(password)

  // 检查长度
  if (password.length < minLength) {
    return NextResponse.json(
      {
        valid: false,
        strength: 'weak',
        errors: [`密码至少需要 ${minLength} 个字符`],
      },
      { status: 200 }
    )
  }

  // 计算强度
  const score = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length
  let strength: 'weak' | 'medium' | 'strong' = 'weak'
  const errors: string[] = []

  if (score >= 3) {
    strength = 'strong'
  } else if (score >= 2) {
    strength = 'medium'
  } else {
    strength = 'weak'
    if (!hasLower) errors.push('建议包含小写字母')
    if (!hasUpper) errors.push('建议包含大写字母')
    if (!hasNumber) errors.push('建议包含数字')
    if (!hasSpecial) errors.push('建议包含特殊字符')
  }

  // 如果密码强度为 weak，返回错误
  if (strength === 'weak') {
    return NextResponse.json(
      {
        valid: false,
        strength,
        errors: errors.length > 0 ? errors : ['密码强度较弱，建议包含大小写字母、数字和特殊字符'],
      },
      { status: 200 }
    )
  }

  return NextResponse.json({
    valid: true,
    strength,
  })
}

export const POST = withApiLogging(
  async (request: NextRequest) => {
    try {
      return await validatePasswordHandler(request)
    } catch (error: unknown) {
      // 不记录 request body，避免泄露密码
      return NextResponse.json(
        { error: '密码验证失败，请重试' },
        { status: 500 }
      )
    }
  },
  { rateLimitConfig: RateLimitConfigs.AUTH }
)
