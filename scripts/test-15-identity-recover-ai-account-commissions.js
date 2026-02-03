#!/usr/bin/env node
/**
 * 脚本 15 - 实名认证/账号恢复/翻译/银行凭证/注销申请/佣金支付：鉴权
 * 对应清单：实名认证、账号恢复、AI 翻译、银行打款凭证、注销申请、佣金支付
 *
 * 验证：未登录时以下接口必须返回 401
 * - POST /api/identity-verification
 * - POST /api/account/recover
 * - POST /api/ai/translate-after-publish
 * - POST /api/payments/bank/upload-proof
 * - POST /api/account/deletion-request
 * - POST /api/commissions/pay
 *
 * 前置：先启动本地服务 npm run dev
 * 执行：node scripts/test-15-identity-recover-ai-account-commissions.js  或  npm run test:15-identity-recover-ai-account-commissions
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

  // 1. POST /api/identity-verification（未登录）— 预期 401
  log('1. POST /api/identity-verification（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/identity-verification`, {
      method: 'POST',
      body: JSON.stringify({
        real_name: 'test',
        id_number: '110101199001011234',
        id_card_front_path: 'x',
        id_card_back_path: 'x',
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

  // 2. POST /api/account/recover（未登录）— 预期 401
  log('2. POST /api/account/recover（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/account/recover`, {
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

  // 3. POST /api/ai/translate-after-publish（未登录）— 预期 401
  log('3. POST /api/ai/translate-after-publish（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/ai/translate-after-publish`, {
      method: 'POST',
      body: JSON.stringify({ type: 'post', id: '00000000-0000-0000-0000-000000000001' }),
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

  // 4. POST /api/payments/bank/upload-proof（未登录）— 预期 401（鉴权在 formData 解析前）
  log('4. POST /api/payments/bank/upload-proof（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/payments/bank/upload-proof`, {
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

  // 5. POST /api/account/deletion-request（未登录）— 预期 401
  log('5. POST /api/account/deletion-request（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/account/deletion-request`, {
      method: 'POST',
      body: JSON.stringify({ password: 'x', confirm: 'delete' }),
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

  // 6. POST /api/commissions/pay（未登录）— 预期 401
  log('6. POST /api/commissions/pay（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/commissions/pay`, {
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

  if (failed > 0) {
    throw new Error(`脚本 15 未通过：${failed} 项失败`)
  }
  log('脚本 15 全部通过', 'ok')
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
