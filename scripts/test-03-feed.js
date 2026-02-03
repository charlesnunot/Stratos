#!/usr/bin/env node
/**
 * 脚本 3 - 社交内容 & Feed / 推荐反馈：鉴权与参数校验
 * 对应清单：二、社交内容 → 推荐反馈；六、智能与推荐 → feed_recommendation_feedback、trust_judgment_feedback
 *
 * 验证：
 * - 未登录时 POST /api/feed/feedback、POST /api/trust/feedback 返回 401
 * - 已“通过鉴权”的请求若缺必填参数，返回 400（本脚本不传 cookie，仅测 401）
 *
 * 前置：先启动本地服务 npm run dev
 * 执行：node scripts/test-03-feed.js  或  npm run test:03-feed
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

  // 1. POST /api/feed/feedback（未登录）— 预期 401
  log('1. POST /api/feed/feedback（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/feed/feedback`, {
      method: 'POST',
      body: JSON.stringify({ postId: 'any-id', agreed: true }),
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

  // 2. POST /api/trust/feedback（未登录）— 预期 401
  log('2. POST /api/trust/feedback（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/trust/feedback`, {
      method: 'POST',
      body: JSON.stringify({ productId: 'any', sellerId: 'any', agreed: true }),
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
    throw new Error(`脚本 3 未通过：${failed} 项失败`)
  }
  log('脚本 3 全部通过', 'ok')
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
