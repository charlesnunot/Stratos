#!/usr/bin/env node
/**
 * 脚本 8 - 订单操作 / 实名认证 / 小组：鉴权
 * 对应清单：订单取消、实名认证、小组/群组
 *
 * 验证：未登录时以下接口必须返回 401
 * - POST /api/orders/[id]/cancel
 * - GET /api/identity-verification
 * - POST /api/groups/create
 * - GET /api/payment-accounts/[id]
 *
 * 前置：先启动本地服务 npm run dev
 * 执行：node scripts/test-08-orders-identity-groups.js  或  npm run test:08-orders-identity-groups
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

  // 1. POST /api/orders/[id]/cancel（未登录）— 预期 401
  log('1. POST /api/orders/any-id/cancel（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/orders/any-id/cancel`, {
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

  // 2. GET /api/identity-verification（未登录）— 预期 401
  log('2. GET /api/identity-verification（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/identity-verification`, { method: 'GET' })
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

  // 3. POST /api/groups/create（未登录）— 预期 401
  log('3. POST /api/groups/create（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/groups/create`, {
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

  // 4. GET /api/payment-accounts/[id]（未登录）— 预期 401
  log('4. GET /api/payment-accounts/any-id（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/payment-accounts/any-id`, { method: 'GET' })
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
    throw new Error(`脚本 8 未通过：${failed} 项失败`)
  }
  log('脚本 8 全部通过', 'ok')
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
