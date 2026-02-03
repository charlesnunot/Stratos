#!/usr/bin/env node
/**
 * 脚本 10 - 发货 / 订阅创建 / 信任判断 / 工单更新 / 小组退出 / 佣金：鉴权
 * 对应清单：订单发货、订阅、信任判断、支持工单、社区小组、佣金
 *
 * 验证：未登录时以下接口必须返回 401
 * - POST /api/orders/[id]/ship
 * - POST /api/subscriptions/create-pending
 * - GET /api/trust/judgment
 * - PUT /api/support/tickets/[id]
 * - POST /api/community-groups/[id]/leave
 * - GET /api/commissions/pay
 *
 * 前置：先启动本地服务 npm run dev
 * 执行：node scripts/test-10-ship-trust-support-commissions.js  或  npm run test:10-ship-trust-support-commissions
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

  // 1. POST /api/orders/[id]/ship（未登录）— 预期 401
  log('1. POST /api/orders/any-id/ship（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/orders/any-id/ship`, {
      method: 'POST',
      body: JSON.stringify({ tracking_number: 'x', logistics_provider: 'y' }),
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

  // 2. POST /api/subscriptions/create-pending（未登录）— 预期 401
  log('2. POST /api/subscriptions/create-pending（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/subscriptions/create-pending`, {
      method: 'POST',
      body: JSON.stringify({ subscriptionType: 'seller', paymentMethod: 'alipay' }),
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

  // 3. GET /api/trust/judgment（未登录）— 预期 401
  log('3. GET /api/trust/judgment（未登录）')
  try {
    const r = await fetchJson(
      `${BASE_URL}/api/trust/judgment?productId=any&sellerId=any`,
      { method: 'GET' }
    )
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

  // 4. PUT /api/support/tickets/[id]（未登录）— 预期 401
  log('4. PUT /api/support/tickets/any-id（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/support/tickets/any-id`, {
      method: 'PUT',
      body: JSON.stringify({ title: 'x', description: 'y' }),
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

  // 5. POST /api/community-groups/[id]/leave（未登录）— 预期 401
  log('5. POST /api/community-groups/any-id/leave（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/community-groups/any-id/leave`, {
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

  // 6. GET /api/commissions/pay（未登录）— 预期 401
  log('6. GET /api/commissions/pay（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/commissions/pay`, { method: 'GET' })
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
    throw new Error(`脚本 10 未通过：${failed} 项失败`)
  }
  log('脚本 10 全部通过', 'ok')
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
