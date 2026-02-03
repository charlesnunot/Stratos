/**
 * Cron 接口鉴权：仅允许携带有效 CRON_SECRET 的请求执行
 * 若 CRON_SECRET 未设置或为空，一律拒绝，防止 "Bearer undefined" 绕过
 */

import { NextRequest, NextResponse } from 'next/server'

/**
 * 校验请求是否携带有效的 CRON_SECRET
 * @returns 未通过时返回 401 NextResponse，通过时返回 null
 */
export function verifyCronSecret(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret || typeof secret !== 'string' || secret.trim() === '') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const authHeader = request.headers.get('authorization')
  const expected = `Bearer ${secret}`
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
