#!/usr/bin/env node
/**
 * 脚本 11 - 订单争议 / 支付账户默认 / 保证金支付 / 工单回复 / 小组成员：鉴权
 * 对应清单：订单争议、支付账户、保证金、支持工单回复、小组管理
 *
 * 验证：未登录时以下接口必须返回 401
 * - POST /api/orders/[id]/dispute
 * - POST /api/orders/[id]/dispute/respond
 * - POST /api/payment-accounts/[id]/set-default
 * - POST /api/deposits/pay
 * - POST /api/support/tickets/[id]/replies
 * - POST /api/groups/[id]/members
 *
 * 前置：先启动本地服务 npm run dev
 * 执行：node scripts/test-11-dispute-deposits-tickets-groups.js  或  npm run test:11-dispute-deposits-tickets-groups
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

  // 1. POST /api/orders/[id]/dispute（未登录）— 预期 401
  log('1. POST /api/orders/any-id/dispute（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/orders/any-id/dispute`, {
      method: 'POST',
      body: JSON.stringify({ disputeType: 'refund', reason: 'test' }),
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

  // 2. POST /api/orders/[id]/dispute/respond（未登录）— 预期 401
  log('2. POST /api/orders/any-id/dispute/respond（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/orders/any-id/dispute/respond`, {
      method: 'POST',
      body: JSON.stringify({ action: 'refuse', response: 'test' }),
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

  // 3. POST /api/payment-accounts/[id]/set-default（未登录）— 预期 401
  log('3. POST /api/payment-accounts/any-id/set-default（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/payment-accounts/any-id/set-default`, {
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

  // 4. POST /api/deposits/pay（未登录）— 预期 401
  log('4. POST /api/deposits/pay（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/deposits/pay`, {
      method: 'POST',
      body: JSON.stringify({ amount: 100, currency: 'USD' }),
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

  // 5. POST /api/support/tickets/[id]/replies（未登录）— 预期 401
  log('5. POST /api/support/tickets/any-id/replies（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/support/tickets/any-id/replies`, {
      method: 'POST',
      body: JSON.stringify({ content: 'test reply' }),
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

  // 6. POST /api/groups/[id]/members（未登录）— 预期 401
  log('6. POST /api/groups/any-id/members（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/groups/any-id/members`, {
      method: 'POST',
      body: JSON.stringify({ memberIds: ['any-user-id'] }),
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

  if (failed > 0) {
    throw new Error(`脚本 11 未通过：${failed} 项失败`)
  }
  log('脚本 11 全部通过', 'ok')
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
