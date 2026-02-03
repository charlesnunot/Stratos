#!/usr/bin/env node
/**
 * 脚本 16 - AI 审核/支付账户根路径/银行凭证审核：鉴权
 * 对应清单：AI 审核通过后能力、支付账户 PUT/DELETE（根路径）、银行打款审核
 *
 * 验证：未登录时以下接口必须返回 401
 * - POST /api/ai/extract-topics-after-approval
 * - POST /api/ai/translate-profile-after-approval
 * - PUT /api/payment-accounts（根路径，body 含 id）
 * - DELETE /api/payment-accounts（根路径，query id）
 * - POST /api/payments/bank/approve-proof
 *
 * 前置：先启动本地服务 npm run dev
 * 执行：node scripts/test-16-ai-admin-payment-accounts-bank-approve.js  或  npm run test:16-ai-admin-payment-accounts-bank-approve
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

  // 1. POST /api/ai/extract-topics-after-approval（未登录）— 预期 401
  log('1. POST /api/ai/extract-topics-after-approval（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/ai/extract-topics-after-approval`, {
      method: 'POST',
      body: JSON.stringify({ postId: '00000000-0000-0000-0000-000000000001' }),
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

  // 2. POST /api/ai/translate-profile-after-approval（未登录）— 预期 401
  log('2. POST /api/ai/translate-profile-after-approval（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/ai/translate-profile-after-approval`, {
      method: 'POST',
      body: JSON.stringify({ profileId: '00000000-0000-0000-0000-000000000001' }),
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

  // 3. PUT /api/payment-accounts（未登录）— 预期 401
  log('3. PUT /api/payment-accounts（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/payment-accounts`, {
      method: 'PUT',
      body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000001', accountName: 'test' }),
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

  // 4. DELETE /api/payment-accounts?id=any（未登录）— 预期 401
  log('4. DELETE /api/payment-accounts?id=any（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/payment-accounts?id=00000000-0000-0000-0000-000000000001`, {
      method: 'DELETE',
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

  // 5. POST /api/payments/bank/approve-proof（未登录）— 预期 401
  log('5. POST /api/payments/bank/approve-proof（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/payments/bank/approve-proof`, {
      method: 'POST',
      body: JSON.stringify({ proofId: 'any', approved: true }),
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
    throw new Error(`脚本 16 未通过：${failed} 项失败`)
  }
  log('脚本 16 全部通过', 'ok')
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
