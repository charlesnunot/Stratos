#!/usr/bin/env node
/**
 * 脚本 7 - 订阅历史 / 保证金 / 联盟帖 / 订单支付方式：鉴权
 * 对应清单：订阅、保证金、联盟推广、订单支付流程
 *
 * 验证：未登录时以下接口必须返回 401
 * - GET /api/subscriptions/history
 * - GET /api/deposits/check
 * - POST /api/affiliate/posts/create
 * - POST /api/orders/get-available-payment-methods
 *
 * 前置：先启动本地服务 npm run dev
 * 执行：node scripts/test-07-more-auth.js  或  npm run test:07-more-auth
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

  // 1. GET /api/subscriptions/history（未登录）— 预期 401
  log('1. GET /api/subscriptions/history（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/subscriptions/history`, { method: 'GET' })
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

  // 2. GET /api/deposits/check（未登录）— 预期 401
  log('2. GET /api/deposits/check（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/deposits/check`, { method: 'GET' })
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

  // 3. POST /api/affiliate/posts/create（未登录）— 预期 401
  log('3. POST /api/affiliate/posts/create（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/affiliate/posts/create`, {
      method: 'POST',
      body: JSON.stringify({ product_id: 'any-id', content: 'test' }),
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

  // 4. POST /api/orders/get-available-payment-methods（未登录）— 预期 401
  log('4. POST /api/orders/get-available-payment-methods（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/orders/get-available-payment-methods`, {
      method: 'POST',
      body: JSON.stringify({ productIds: ['any-id'], sellerIds: ['any-id'] }),
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
    throw new Error(`脚本 7 未通过：${failed} 项失败`)
  }
  log('脚本 7 全部通过', 'ok')
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
