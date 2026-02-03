#!/usr/bin/env node
/**
 * 脚本 12 - 账号恢复 & 支付会话 & 支付账户创建：鉴权
 * 对应清单：账号恢复、订单/打赏/订阅 Stripe 会话、支付账户创建
 *
 * 验证：未登录时以下接口必须返回 401
 * - GET /api/account/recover
 * - POST /api/payments/stripe/create-order-checkout-session
 * - POST /api/payments/stripe/create-tip-session
 * - POST /api/payments/stripe/create-checkout-session（订阅）
 * - POST /api/payments/stripe/create-user-tip-session
 * - POST /api/payment-accounts
 *
 * 前置：先启动本地服务 npm run dev
 * 执行：node scripts/test-12-account-recover-payments.js  或  npm run test:12-account-recover-payments
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

  // 1. GET /api/account/recover（未登录）— 预期 401
  log('1. GET /api/account/recover（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/account/recover`, { method: 'GET' })
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

  // 2. POST /api/payments/stripe/create-order-checkout-session（未登录）— 预期 401
  log('2. POST /api/payments/stripe/create-order-checkout-session（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/payments/stripe/create-order-checkout-session`, {
      method: 'POST',
      body: JSON.stringify({
        orderId: '00000000-0000-0000-0000-000000000001',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      }),
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

  // 3. POST /api/payments/stripe/create-tip-session（未登录）— 预期 401
  log('3. POST /api/payments/stripe/create-tip-session（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/payments/stripe/create-tip-session`, {
      method: 'POST',
      body: JSON.stringify({
        amount: 1,
        postId: '00000000-0000-0000-0000-000000000001',
        postAuthorId: '00000000-0000-0000-0000-000000000002',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      }),
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

  // 4. POST /api/payments/stripe/create-checkout-session（未登录，订阅）— 预期 401
  log('4. POST /api/payments/stripe/create-checkout-session（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/payments/stripe/create-checkout-session`, {
      method: 'POST',
      body: JSON.stringify({
        subscriptionType: 'seller',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      }),
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

  // 5. POST /api/payments/stripe/create-user-tip-session（未登录）— 预期 401
  log('5. POST /api/payments/stripe/create-user-tip-session（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/payments/stripe/create-user-tip-session`, {
      method: 'POST',
      body: JSON.stringify({
        amount: 1,
        targetUserId: '00000000-0000-0000-0000-000000000001',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      }),
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

  // 6. POST /api/payment-accounts（未登录）— 预期 401
  log('6. POST /api/payment-accounts（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/payment-accounts`, {
      method: 'POST',
      body: JSON.stringify({ accountType: 'stripe', accountInfo: {} }),
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
    throw new Error(`脚本 12 未通过：${failed} 项失败`)
  }
  log('脚本 12 全部通过', 'ok')
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
