#!/usr/bin/env node
/**
 * 脚本 17 - 订单争议 GET & Admin 只读接口：鉴权
 * 对应清单：订单争议详情、后台补偿/注销申请/争议/监控/卖家欠款列表
 *
 * 验证：未登录时以下接口必须返回 401
 * - GET /api/orders/[id]/dispute
 * - GET /api/admin/compensations
 * - GET /api/admin/deletion-requests
 * - GET /api/admin/disputes
 * - GET /api/admin/monitoring/dashboard
 * - GET /api/admin/seller-debts
 *
 * 前置：先启动本地服务 npm run dev
 * 执行：node scripts/test-17-dispute-get-admin-routes.js  或  npm run test:17-dispute-get-admin-routes
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

  // 1. GET /api/orders/[id]/dispute（未登录）— 预期 401
  log('1. GET /api/orders/any-id/dispute（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/orders/any-id/dispute`, { method: 'GET' })
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

  // 2. GET /api/admin/compensations（未登录）— 预期 401
  log('2. GET /api/admin/compensations（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/admin/compensations`, { method: 'GET' })
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

  // 3. GET /api/admin/deletion-requests（未登录）— 预期 401
  log('3. GET /api/admin/deletion-requests（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/admin/deletion-requests`, { method: 'GET' })
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

  // 4. GET /api/admin/disputes（未登录）— 预期 401
  log('4. GET /api/admin/disputes（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/admin/disputes`, { method: 'GET' })
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

  // 5. GET /api/admin/monitoring/dashboard（未登录）— 预期 401
  log('5. GET /api/admin/monitoring/dashboard（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/admin/monitoring/dashboard`, { method: 'GET' })
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

  // 6. GET /api/admin/seller-debts（未登录）— 预期 401
  log('6. GET /api/admin/seller-debts（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/admin/seller-debts`, { method: 'GET' })
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
    throw new Error(`脚本 17 未通过：${failed} 项失败`)
  }
  log('脚本 17 全部通过', 'ok')
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
