#!/usr/bin/env node
/**
 * 使用真实用户登录并调用需鉴权接口（系统性测试）
 *
 * 凭证从环境变量读取，勿将密码写入代码或提交仓库：
 *   TEST_USER_EMAIL, TEST_USER_PASSWORD  普通用户
 *   TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD 管理员（可选）
 *
 * 建议：复制 .env.test.example 为 .env.test，填入上述变量；.env.test 已在 .gitignore
 * 本脚本会尝试从项目根目录的 .env.test 加载变量（若存在且未在环境里设置）。
 *
 * 前置：npm run dev 已启动；NODE_ENV=development 或 TEST_MODE=1
 * 执行：node scripts/test-auth-with-real-user.js
 */

const path = require('path')
const fs = require('fs')

// 尝试从项目根 .env.test 加载（不覆盖已有环境变量）
const envTestPath = path.resolve(__dirname, '..', '.env.test')
if (fs.existsSync(envTestPath) && !process.env.TEST_USER_EMAIL) {
  const content = fs.readFileSync(envTestPath, 'utf8')
  content.split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) {
      const key = m[1].trim()
      const val = m[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
  })
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const TIMEOUT_MS = 15000

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || ''
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || ''
const TEST_ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || ''
const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || ''

function log(msg, type = 'info') {
  const prefix = type === 'err' ? 'FAIL' : type === 'ok' ? 'OK' : '—'
  console.log(`[${prefix}] ${msg}`)
}

/** 从 Response 的 Set-Cookie 拼出 Cookie 请求头 */
function getCookieHeader(response) {
  const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : []
  if (setCookies.length === 0) {
    const single = response.headers.get('set-cookie')
    if (single) setCookies.push(single)
  }
  return setCookies
    .map((s) => {
      const part = s.split(';')[0]
      return part ? part.trim() : ''
    })
    .filter(Boolean)
    .join('; ')
}

async function fetchWithCookie(url, options = {}, cookieHeader) {
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), options.timeout ?? TIMEOUT_MS)
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (cookieHeader) headers['Cookie'] = cookieHeader
  try {
    const res = await fetch(url, { ...options, signal: controller.signal, headers })
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

async function login(email, password) {
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const res = await fetch(`${BASE_URL}/api/test/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal: controller.signal,
  })
  clearTimeout(tid)
  const cookieHeader = getCookieHeader(res)
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = {}
  }
  return { status: res.status, body, cookieHeader }
}

async function run() {
  log(`BASE_URL = ${BASE_URL}`)
  let failed = 0

  if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
    log('未设置 TEST_USER_EMAIL / TEST_USER_PASSWORD，跳过真实用户测试', 'err')
    log('可复制 .env.test.example 为 .env.test 并填入；或导出环境变量', 'info')
    process.exit(1)
  }

  // 1. 普通用户登录 → 取 Cookie
  log('1. 普通用户登录 POST /api/test/session')
  let userCookie = ''
  try {
    const loginRes = await login(TEST_USER_EMAIL, TEST_USER_PASSWORD)
    if (loginRes.status === 404) {
      log('   /api/test/session 返回 404（仅 NODE_ENV=development 或 TEST_MODE=1 可用）', 'err')
      failed++
    } else if (loginRes.status !== 200 || !loginRes.body?.ok) {
      log(`   登录失败 status=${loginRes.status} body=${JSON.stringify(loginRes.body)}`, 'err')
      failed++
    } else {
      userCookie = loginRes.cookieHeader
      log(`   登录成功 userId=${loginRes.body.userId || '-'}`, 'ok')
    }
  } catch (e) {
    log(`   请求失败: ${e.message}（请确认 npm run dev 已启动）`, 'err')
    failed++
  }

  if (failed > 0) {
    process.exit(1)
  }

  // 2. 带 Cookie 调用 GET /api/settings
  log('2. GET /api/settings（带 session Cookie）')
  try {
    const r = await fetchWithCookie(`${BASE_URL}/api/settings`, { method: 'GET' }, userCookie)
    if (r.status === 200 && typeof r.body.profile_visibility !== 'undefined') {
      log('   返回 200 且含 profile_visibility', 'ok')
    } else if (r.status === 401) {
      log('   返回 401（Cookie 未生效或已过期）', 'err')
      failed++
    } else {
      log(`   预期 200+ 设置对象，实际 status=${r.status} body=${JSON.stringify(r.body)}`, 'err')
      failed++
    }
  } catch (e) {
    log(`   请求失败: ${e.message}`, 'err')
    failed++
  }

  // 2b. 扩展：更多普通用户需鉴权 GET 接口（仅验证 200/403 等，不写库）
  const userGetTests = [
    { path: '/api/subscriptions/history', desc: '订阅历史', ok: (r) => r.status === 200 },
    { path: '/api/payment-accounts', desc: '支付账户列表（非卖家可能 403）', ok: (r) => r.status === 200 || r.status === 403 },
    { path: '/api/deposits/check', desc: '保证金检查（非卖家可能 403）', ok: (r) => r.status === 200 || r.status === 403 },
  ]
  for (const t of userGetTests) {
    log(`2b. GET ${t.path}（${t.desc}）`)
    try {
      const r = await fetchWithCookie(`${BASE_URL}${t.path}`, { method: 'GET' }, userCookie)
      if (r.status === 401) {
        log(`   返回 401（未鉴权）`, 'err')
        failed++
      } else if (t.ok(r)) {
        log(`   返回 ${r.status} 符合预期`, 'ok')
      } else {
        log(`   预期 200/403，实际 status=${r.status}`, 'err')
        failed++
      }
    } catch (e) {
      log(`   请求失败: ${e.message}`, 'err')
      failed++
    }
  }

  // 3. 管理员登录（若配置了则测）
  if (TEST_ADMIN_EMAIL && TEST_ADMIN_PASSWORD) {
    log('3. 管理员登录 POST /api/test/session')
    let adminCookie = ''
    try {
      const adminLogin = await login(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD)
      if (adminLogin.status === 200 && adminLogin.body?.ok) {
        adminCookie = adminLogin.cookieHeader
        log(`   登录成功 userId=${adminLogin.body.userId || '-'}`, 'ok')
      } else {
        log(`   登录失败 status=${adminLogin.status}`, 'err')
        failed++
      }

      if (adminCookie) {
        log('4. GET /api/admin/monitoring/dashboard（带 admin Cookie）')
        const dash = await fetchWithCookie(
          `${BASE_URL}/api/admin/monitoring/dashboard`,
          { method: 'GET' },
          adminCookie
        )
        if (dash.status === 200 && (dash.body?.metrics || dash.body?.healthStatus !== undefined)) {
          log('   返回 200 且含监控数据', 'ok')
        } else if (dash.status === 403) {
          log('   返回 403（非 admin 角色）', 'err')
          failed++
        } else {
          log(`   预期 200，实际 status=${dash.status}`, 'err')
          failed++
        }

        log('5. GET /api/admin/platform-payment-accounts（带 admin Cookie）')
        const platformAccounts = await fetchWithCookie(
          `${BASE_URL}/api/admin/platform-payment-accounts`,
          { method: 'GET' },
          adminCookie
        )
        if (platformAccounts.status === 200 && Array.isArray(platformAccounts.body?.accounts)) {
          log('   返回 200 且含 accounts 列表', 'ok')
        } else if (platformAccounts.status === 403) {
          log('   返回 403（非 admin 角色）', 'err')
          failed++
        } else {
          log(`   预期 200，实际 status=${platformAccounts.status}`, 'err')
          failed++
        }
      }
    } catch (e) {
      log(`   请求失败: ${e.message}`, 'err')
      failed++
    }
  } else {
    log('3. 未配置 TEST_ADMIN_EMAIL/PASSWORD，跳过管理员接口测试', 'info')
  }

  if (failed > 0) {
    process.exit(1)
  }
  log('真实用户鉴权测试全部通过', 'ok')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
