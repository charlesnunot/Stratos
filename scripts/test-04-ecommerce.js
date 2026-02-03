#!/usr/bin/env node
/**
 * 脚本 4 - 电商与交易：下单/结算相关接口鉴权
 * 对应清单：三、电商与交易 → 购物车 & 结算、下单/支付
 *
 * 验证：未登录时以下接口必须返回 401
 * - POST /api/checkout/validate-product（校验商品可购买）
 * - POST /api/orders/create（创建订单）
 *
 * 前置：先启动本地服务 npm run dev
 * 执行：node scripts/test-04-ecommerce.js  或  npm run test:04-ecommerce
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

  // 1. POST /api/checkout/validate-product（未登录）— 预期 401
  log('1. POST /api/checkout/validate-product（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/checkout/validate-product`, {
      method: 'POST',
      body: JSON.stringify({ productId: 'any-product-id' }),
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

  // 2. POST /api/orders/create（未登录）— 预期 401
  log('2. POST /api/orders/create（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/orders/create`, {
      method: 'POST',
      body: JSON.stringify({
        items: [{ product_id: 'any-id', quantity: 1, price: 100 }],
        shipping_address_id: 'any-address-id',
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
    throw new Error(`脚本 4 未通过：${failed} 项失败`)
  }
  log('脚本 4 全部通过', 'ok')
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
