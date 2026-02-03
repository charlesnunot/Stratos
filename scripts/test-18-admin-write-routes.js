#!/usr/bin/env node
/**
 * 脚本 18 - Admin 写操作与列表：鉴权
 * 对应清单：后台补偿/退款/内容审核/支付账户审核/封禁/注销审核/工单列表
 *
 * 验证：未登录时以下接口必须返回 401
 * - POST /api/admin/compensations
 * - POST /api/admin/refunds/process
 * - POST /api/admin/content-review/[id]/approve
 * - POST /api/admin/payment-accounts/[id]/verify
 * - POST /api/admin/profiles/[id]/ban
 * - POST /api/admin/deletion-requests/[id]/approve
 * - GET /api/admin/support/tickets
 *
 * 前置：先启动本地服务 npm run dev
 * 执行：node scripts/test-18-admin-write-routes.js  或  npm run test:18-admin-write-routes
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

  // 1. POST /api/admin/compensations（未登录）— 预期 401
  log('1. POST /api/admin/compensations（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/admin/compensations`, {
      method: 'POST',
      body: JSON.stringify({ obligationId: '00000000-0000-0000-0000-000000000001' }),
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

  // 2. POST /api/admin/refunds/process（未登录）— 预期 401
  log('2. POST /api/admin/refunds/process（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/admin/refunds/process`, {
      method: 'POST',
      body: JSON.stringify({
        refundId: '00000000-0000-0000-0000-000000000001',
        orderId: '00000000-0000-0000-0000-000000000002',
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

  // 3. POST /api/admin/content-review/[id]/approve（未登录）— 预期 401
  log('3. POST /api/admin/content-review/any-id/approve（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/admin/content-review/any-id/approve`, {
      method: 'POST',
      body: JSON.stringify({ type: 'post' }),
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

  // 4. POST /api/admin/payment-accounts/[id]/verify（未登录）— 预期 401
  log('4. POST /api/admin/payment-accounts/any-id/verify（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/admin/payment-accounts/any-id/verify`, {
      method: 'POST',
      body: JSON.stringify({ status: 'verified' }),
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

  // 5. POST /api/admin/profiles/[id]/ban（未登录）— 预期 401
  log('5. POST /api/admin/profiles/any-id/ban（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/admin/profiles/any-id/ban`, {
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

  // 6. POST /api/admin/deletion-requests/[id]/approve（未登录）— 预期 401
  log('6. POST /api/admin/deletion-requests/any-id/approve（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/admin/deletion-requests/any-id/approve`, {
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

  // 7. GET /api/admin/support/tickets（未登录）— 预期 401
  log('7. GET /api/admin/support/tickets（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/admin/support/tickets`, { method: 'GET' })
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
    throw new Error(`脚本 18 未通过：${failed} 项失败`)
  }
  log('脚本 18 全部通过', 'ok')
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
