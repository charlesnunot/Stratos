#!/usr/bin/env node
/**
 * 脚本 9 - 确认收货 / 保证金退款 / 小组加入 / 账号注销：鉴权
 * 对应清单：订单确认收货、保证金、社区小组、账号安全
 *
 * 验证：未登录时以下接口必须返回 401
 * - POST /api/orders/[id]/confirm-receipt
 * - POST /api/deposits/[lotId]/request-refund
 * - POST /api/community-groups/[id]/join
 * - GET /api/account/deletion-request
 *
 * 前置：先启动本地服务 npm run dev
 * 执行：node scripts/test-09-receipt-deposits-account.js  或  npm run test:09-receipt-deposits-account
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

  // 1. POST /api/orders/[id]/confirm-receipt（未登录）— 预期 401
  log('1. POST /api/orders/any-id/confirm-receipt（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/orders/any-id/confirm-receipt`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    if (r.status === 401) {
      log('   返回 401 Unauthorized', 'ok')
    } else {
      log(`   预期 401，实际 status=${r.status} body=${JSON.stringify(r.body)}`, 'err')
      failed++
    }
  } catch (e) {
    log(`   请求失败: ${e.message}`, 'err')
    failed++
  }

  // 2. POST /api/deposits/[lotId]/request-refund（未登录）— 预期 401
  log('2. POST /api/deposits/any-lot-id/request-refund（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/deposits/any-lot-id/request-refund`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    if (r.status === 401) {
      log('   返回 401 Unauthorized', 'ok')
    } else {
      log(`   预期 401，实际 status=${r.status} body=${JSON.stringify(r.body)}`, 'err')
      failed++
    }
  } catch (e) {
    log(`   请求失败: ${e.message}`, 'err')
    failed++
  }

  // 3. POST /api/community-groups/[id]/join（未登录）— 预期 401
  log('3. POST /api/community-groups/any-id/join（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/community-groups/any-id/join`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    if (r.status === 401) {
      log('   返回 401 Unauthorized', 'ok')
    } else {
      log(`   预期 401，实际 status=${r.status} body=${JSON.stringify(r.body)}`, 'err')
      failed++
    }
  } catch (e) {
    log(`   请求失败: ${e.message}`, 'err')
    failed++
  }

  // 4. GET /api/account/deletion-request（未登录）— 预期 401
  log('4. GET /api/account/deletion-request（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/account/deletion-request`, { method: 'GET' })
    if (r.status === 401) {
      log('   返回 401 Unauthorized', 'ok')
    } else {
      log(`   预期 401，实际 status=${r.status} body=${JSON.stringify(r.body)}`, 'err')
      failed++
    }
  } catch (e) {
    log(`   请求失败: ${e.message}`, 'err')
    failed++
  }

  if (failed > 0) {
    throw new Error(`脚本 9 未通过：${failed} 项失败`)
  }
  log('脚本 9 全部通过', 'ok')
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
