#!/usr/bin/env node
/**
 * 脚本 2 - Profile 与用户设置：/api/settings 鉴权
 * 对应清单：一、用户行为链路 → 用户信息修改（/api/settings）；七、权限 → 受限接口未登录应 401
 *
 * 验证：未登录时 GET/PATCH /api/settings 必须返回 401，防止未授权访问。
 *
 * 前置：先启动本地服务 npm run dev
 * 执行：node scripts/test-02-profile.js  或  npm run test:02-profile
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

  // 1. GET /api/settings（无 cookie）— 预期 401
  log('1. GET /api/settings（未登录）')
  try {
    const get = await fetchJson(`${BASE_URL}/api/settings`, { method: 'GET' })
    if (get.status === 401) {
      log('   返回 401 Unauthorized', 'ok')
    } else {
      log(`   预期 401，实际 status=${get.status} body=${JSON.stringify(get.body)}`, 'err')
      failed++
    }
  } catch (e) {
    log(`   请求失败: ${e.message}`, 'err')
    failed++
  }

  // 2. PATCH /api/settings（无 cookie）— 预期 401
  log('2. PATCH /api/settings（未登录）')
  try {
    const patch = await fetchJson(`${BASE_URL}/api/settings`, {
      method: 'PATCH',
      body: JSON.stringify({ profile_visibility: 'public' }),
    })
    if (patch.status === 401) {
      log('   返回 401 Unauthorized', 'ok')
    } else {
      log(`   预期 401，实际 status=${patch.status} body=${JSON.stringify(patch.body)}`, 'err')
      failed++
    }
  } catch (e) {
    log(`   请求失败: ${e.message}`, 'err')
    failed++
  }

  if (failed > 0) {
    throw new Error(`脚本 2 未通过：${failed} 项失败`)
  }
  log('脚本 2 全部通过', 'ok')
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
