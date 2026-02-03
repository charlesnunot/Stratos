/**
 * 根据请求方 IP 解析大致位置（城市/地区/国家），用于帖子「位置」智能填充。
 * 使用 ip-api.com 免费接口（无需 key，45 次/分钟，国际覆盖）。
 */

import { NextRequest, NextResponse } from 'next/server'

const IP_API_URL = 'http://ip-api.com/json'
const FIELDS = 'status,message,city,regionName,country'
const TIMEOUT_MS = 5000

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return null
}

export async function GET(request: NextRequest) {
  const clientIp = getClientIp(request)
  const query = clientIp && clientIp !== '127.0.0.1' && clientIp !== '::1' ? clientIp : null
  if (!query) {
    return NextResponse.json({ location: null })
  }
  const url = `${IP_API_URL}/${encodeURIComponent(query)}?fields=${FIELDS}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    })
    clearTimeout(timeout)

    if (!res.ok) {
      return NextResponse.json({ location: null })
    }
    const data = await res.json().catch(() => null)
    if (!data || data.status !== 'success') {
      return NextResponse.json({ location: null })
    }
    const parts = [data.city, data.regionName, data.country].filter(Boolean)
    const location = parts.length > 0 ? parts.join(', ') : null
    return NextResponse.json({ location })
  } catch {
    return NextResponse.json({ location: null })
  }
}
