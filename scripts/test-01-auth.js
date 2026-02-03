#!/usr/bin/env node
/**
 * 脚本 1 - 用户 & 身份：健康检查 + 登出 API
 * 对应清单：一、用户行为链路 → 登录/登出；七、系统与运维 → 健康检查
 *
 * 前置：先启动本地服务 npm run dev（BASE_URL 默认 http://localhost:3000）
 * 执行：node scripts/test-01-auth.js
 * 环境变量：BASE_URL（可选，默认 http://localhost:3000）
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const TIMEOUT_MS = 10000

function log(msg, type = 'info') {
  const prefix = type === 'err' ? 'FAIL' : type === 'ok' ? 'OK' : '—'
  console.log(`[${prefix}] ${msg}`)
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), options.timeout ?? TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
    clearTimeout(tid)
    const text = await res.text()
    let body
    try {
      body = text ? JSON.parse(text) : {}
    } catch {
      body = {}
    }
    return { ok: res.ok, status: res.status, body, headers: res.headers }
  } catch (e) {
    clearTimeout(tid)
    throw e
  }
}

async function run() {
  log(`BASE_URL = ${BASE_URL}`)
  let failed = 0

  // 1. GET /api/health — 预期 200 + status: 'ok'；503 表示环境/DB 未就绪
  log('1. GET /api/health')
  try {
    const health = await fetchJson(`${BASE_URL}/api/health`, { method: 'GET' })
    if (health.status === 200 && health.body?.status === 'ok') {
      log('   health 返回 200, status=ok', 'ok')
    } else if (health.status === 503) {
      log('   health 返回 503（Supabase 未就绪或环境缺失）', 'err')
      failed++
    } else {
      log(`   health 异常: status=${health.status}, body=${JSON.stringify(health.body)}`, 'err')
      failed++
    }
  } catch (e) {
    log(`   health 请求失败: ${e.message}（请确认已执行 npm run dev）`, 'err')
    failed++
  }

  // 2. POST /api/auth/logout — 无 cookie 时也应返回 200 + success: true
  log('2. POST /api/auth/logout')
  try {
    const logout = await fetchJson(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    if (logout.status === 200 && logout.body?.success === true) {
      log('   logout 返回 200, success=true', 'ok')
    } else {
      log(`   logout 异常: status=${logout.status}, body=${JSON.stringify(logout.body)}`, 'err')
      failed++
    }
  } catch (e) {
    log(`   logout 请求失败: ${e.message}`, 'err')
    failed++
  }

  if (failed > 0) {
    throw new Error(`脚本 1 未通过：${failed} 项失败`)
  }
  log('脚本 1 全部通过', 'ok')
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
