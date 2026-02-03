#!/usr/bin/env node
/**
 * 脚本 14 - 支付账户更新/删除 & 支付渠道：鉴权
 * 对应清单：支付账户管理、PayPal 捕获、微信/银行/卖家确认/支付宝退款
 *
 * 验证：未登录时以下接口必须返回 401
 * - PUT /api/payment-accounts/[id]
 * - DELETE /api/payment-accounts/[id]
 * - POST /api/payments/paypal/capture-order
 * - POST /api/payments/wechat/create-order
 * - POST /api/payments/bank/init
 * - POST /api/payments/seller/confirm-payment
 * - POST /api/payments/alipay/refund
 *
 * 前置：先启动本地服务 npm run dev
 * 执行：node scripts/test-14-payment-accounts-and-payments.js  或  npm run test:14-payment-accounts-and-payments
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

  // 1. PUT /api/payment-accounts/[id]（未登录）— 预期 401
  log('1. PUT /api/payment-accounts/any-id（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/payment-accounts/any-id`, {
      method: 'PUT',
      body: JSON.stringify({ accountName: 'test' }),
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

  // 2. DELETE /api/payment-accounts/[id]（未登录）— 预期 401
  log('2. DELETE /api/payment-accounts/any-id（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/payment-accounts/any-id`, { method: 'DELETE' })
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

  // 3. POST /api/payments/paypal/capture-order（未登录）— 预期 401
  log('3. POST /api/payments/paypal/capture-order（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/payments/paypal/capture-order`, {
      method: 'POST',
      body: JSON.stringify({ orderId: 'any-paypal-order-id' }),
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

  // 4. POST /api/payments/wechat/create-order（未登录）— 预期 401
  log('4. POST /api/payments/wechat/create-order（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/payments/wechat/create-order`, {
      method: 'POST',
      body: JSON.stringify({
        orderId: '00000000-0000-0000-0000-000000000001',
        amount: 1,
        description: 'test',
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

  // 5. POST /api/payments/bank/init（未登录）— 预期 401
  log('5. POST /api/payments/bank/init（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/payments/bank/init`, {
      method: 'POST',
      body: JSON.stringify({ orderId: '00000000-0000-0000-0000-000000000001' }),
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

  // 6. POST /api/payments/seller/confirm-payment（未登录）— 预期 401
  log('6. POST /api/payments/seller/confirm-payment（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/payments/seller/confirm-payment`, {
      method: 'POST',
      body: JSON.stringify({ orderId: '00000000-0000-0000-0000-000000000001' }),
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

  // 7. POST /api/payments/alipay/refund（未登录）— 预期 401
  log('7. POST /api/payments/alipay/refund（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/payments/alipay/refund`, {
      method: 'POST',
      body: JSON.stringify({
        orderId: '00000000-0000-0000-0000-000000000001',
        refundAmount: 1,
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

  if (failed > 0) {
    throw new Error(`脚本 14 未通过：${failed} 项失败`)
  }
  log('脚本 14 全部通过', 'ok')
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
