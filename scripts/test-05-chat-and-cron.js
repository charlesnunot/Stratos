#!/usr/bin/env node
/**
 * 脚本 5 - 聊天 & Cron：鉴权
 * 对应清单：四、聊天系统 → 消息发送；七、系统与运维 → Cron 任务触发
 *
 * 验证：
 * - 未登录时 POST /api/messages 返回 401
 * - 无 CRON_SECRET 时 GET /api/cron/... 返回 401
 *
 * 前置：先启动本地服务 npm run dev
 * 执行：node scripts/test-05-chat-and-cron.js  或  npm run test:05-chat-and-cron
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

  // 1. POST /api/messages（未登录）— 预期 401
  log('1. POST /api/messages（未登录）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/messages`, {
      method: 'POST',
      body: JSON.stringify({ conversation_id: 'any-id', content: 'hi' }),
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

  // 2. GET /api/cron/cancel-expired-orders（无 Authorization）— 预期 401
  log('2. GET /api/cron/cancel-expired-orders（无密钥）')
  try {
    const r = await fetchJson(`${BASE_URL}/api/cron/cancel-expired-orders`, {
      method: 'GET',
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
    throw new Error(`脚本 5 未通过：${failed} 项失败`)
  }
  log('脚本 5 全部通过', 'ok')
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
