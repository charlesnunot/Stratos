#!/usr/bin/env node
/**
 * 脚本 13 - 社区小组创建 / AI 推理 / Stripe 与支付宝：鉴权
 * 对应清单：社区小组、AI 能力、支付意图与渠道
 *
 * 验证：未登录时以下接口必须返回 401
 * - POST /api/community-groups/create
 * - POST /api/ai/complete
 * - POST /api/payments/stripe/create-intent
 * - POST /api/payments/stripe/connect/create-account
 * - POST /api/payments/paypal/create-order
 * - POST /api/payments/alipay/create-order
 *
 * 前置：先启动本地服务 npm run dev
 * 执行：node scripts/test-13-community-ai-payments.js  或  npm run test:13-community-ai-payments
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

  // 1. POST /api/community-groups/create（未登录）— 预期 401
  log('1. POST /api/community-groups/create（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/community-groups/create`, {
      method: 'POST',
      body: JSON.stringify({ name: 'test group' }),
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

  // 2. POST /api/ai/complete（未登录）— 预期 401
  log('2. POST /api/ai/complete（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/ai/complete`, {
      method: 'POST',
      body: JSON.stringify({ input: 'test', task: 'extract_topics' }),
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

  // 3. POST /api/payments/stripe/create-intent（未登录）— 预期 401
  log('3. POST /api/payments/stripe/create-intent（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/payments/stripe/create-intent`, {
      method: 'POST',
      body: JSON.stringify({ amount: 100, orderId: '00000000-0000-0000-0000-000000000001' }),
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

  // 4. POST /api/payments/stripe/connect/create-account（未登录）— 预期 401
  log('4. POST /api/payments/stripe/connect/create-account（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/payments/stripe/connect/create-account`, {
      method: 'POST',
      body: JSON.stringify({
        returnUrl: 'https://example.com/return',
        refreshUrl: 'https://example.com/refresh',
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

  // 5. POST /api/payments/paypal/create-order（未登录）— 预期 401
  log('5. POST /api/payments/paypal/create-order（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/payments/paypal/create-order`, {
      method: 'POST',
      body: JSON.stringify({ amount: 1, type: 'order', orderId: '00000000-0000-0000-0000-000000000001' }),
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

  // 6. POST /api/payments/alipay/create-order（未登录）— 预期 401
  log('6. POST /api/payments/alipay/create-order（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/payments/alipay/create-order`, {
      method: 'POST',
      body: JSON.stringify({
        amount: 1,
        orderId: '00000000-0000-0000-0000-000000000001',
        subject: 'test',
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
    throw new Error(`脚本 13 未通过：${failed} 项失败`)
  }
  log('脚本 13 全部通过', 'ok')
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
