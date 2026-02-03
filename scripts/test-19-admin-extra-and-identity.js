#!/usr/bin/env node
/**
 * 脚本 19 - Admin 扩展与实名审核：鉴权
 * 对应清单：佣金结算/内容驳回/解封/保证金退款/重试转账/违规扣款/平台费/平台支付账户/实名审核列表
 *
 * 验证：未登录时以下接口必须返回 401
 * - POST /api/admin/commissions/[id]/settle
 * - POST /api/admin/content-review/[id]/reject
 * - POST /api/admin/profiles/[id]/unban
 * - POST /api/admin/deposits/[lotId]/process-refund
 * - POST /api/admin/transfers/retry
 * - POST /api/admin/violation-penalties/deduct
 * - POST /api/admin/platform-fees/charge
 * - GET /api/admin/platform-payment-accounts
 * - GET /api/admin/identity-verification
 *
 * 前置：先启动本地服务 npm run dev
 * 执行：node scripts/test-19-admin-extra-and-identity.js  或  npm run test:19-admin-extra-and-identity
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

  const tests = [
    {
      name: 'POST /api/admin/commissions/any-id/settle（未登录）',
      url: `${BASE_URL}/api/admin/commissions/00000000-0000-0000-0000-000000000001/settle`,
      options: { method: 'POST', body: JSON.stringify({}) },
    },
    {
      name: 'POST /api/admin/content-review/any-id/reject（未登录）',
      url: `${BASE_URL}/api/admin/content-review/any-id/reject`,
      options: { method: 'POST', body: JSON.stringify({ reason: 'test' }) },
    },
    {
      name: 'POST /api/admin/profiles/any-id/unban（未登录）',
      url: `${BASE_URL}/api/admin/profiles/00000000-0000-0000-0000-000000000001/unban`,
      options: { method: 'POST', body: JSON.stringify({}) },
    },
    {
      name: 'POST /api/admin/deposits/any-lotId/process-refund（未登录）',
      url: `${BASE_URL}/api/admin/deposits/00000000-0000-0000-0000-000000000001/process-refund`,
      options: { method: 'POST', body: JSON.stringify({}) },
    },
    {
      name: 'POST /api/admin/transfers/retry（未登录）',
      url: `${BASE_URL}/api/admin/transfers/retry`,
      options: { method: 'POST', body: JSON.stringify({ transferId: '00000000-0000-0000-0000-000000000001' }) },
    },
    {
      name: 'POST /api/admin/violation-penalties/deduct（未登录）',
      url: `${BASE_URL}/api/admin/violation-penalties/deduct`,
      options: { method: 'POST', body: JSON.stringify({ sellerId: '00000000-0000-0000-0000-000000000001', amount: 0 }) },
    },
    {
      name: 'POST /api/admin/platform-fees/charge（未登录）',
      url: `${BASE_URL}/api/admin/platform-fees/charge`,
      options: { method: 'POST', body: JSON.stringify({}) },
    },
    {
      name: 'GET /api/admin/platform-payment-accounts（未登录）',
      url: `${BASE_URL}/api/admin/platform-payment-accounts`,
      options: { method: 'GET' },
    },
    {
      name: 'GET /api/admin/identity-verification（未登录）',
      url: `${BASE_URL}/api/admin/identity-verification`,
      options: { method: 'GET' },
    },
  ]

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i]
    log(`${i + 1}. ${t.name}`)
    try {
      const r = await fetchJson(t.url, t.options)
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
  }

  if (failed > 0) {
    throw new Error(`脚本 19 未通过：${failed} 项失败`)
  }
  log('脚本 19 全部通过', 'ok')
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
