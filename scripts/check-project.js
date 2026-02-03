#!/usr/bin/env node
/**
 * Stratos 项目自动化检查脚本
 * 用于发现项目中的问题和潜在风险，对应上线清单与代码健康度。
 *
 * 用法: node scripts/check-project.js [--e2e] [--no-lint]
 *   --e2e    同时运行 E2E 检查（需先 npm run dev）
 *   --no-lint 跳过 next lint（加快本地快速检查）
 */

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const results = [] // { name, passed, severity, message?, details? }

function add(name, passed, severity = 'error', message = '', details = []) {
  results.push({ name, passed, severity, message, details })
}

// ---------- 1. JSON 消息文件 ----------
function checkMessageJson() {
  const dir = path.join(ROOT, 'src', 'messages')
  if (!fs.existsSync(dir)) {
    add('messages-json', true, 'info', 'src/messages 不存在，跳过')
    return
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  const errors = []
  const parsed = {}
  for (const file of files) {
    const filePath = path.join(dir, file)
    try {
      const raw = fs.readFileSync(filePath, 'utf8')
      parsed[file] = JSON.parse(raw)
    } catch (e) {
      errors.push(`${file}: ${e.message}`)
    }
  }
  if (errors.length) {
    add('messages-json', false, 'error', 'i18n JSON 解析失败', errors)
    return
  }
  add('messages-json', true, 'info', `已检查 ${files.length} 个 JSON，解析通过`)
  const ref = parsed['en.json'] || parsed[Object.keys(parsed)[0]]
  if (!ref || Object.keys(parsed).length === 1) {
    return
  }
  const refKeys = keysFromObject(ref)
  const missingByFile = []
  for (const [file, obj] of Object.entries(parsed)) {
    const keys = keysFromObject(obj)
    const missing = refKeys.filter((k) => !keys.includes(k))
    if (missing.length) missingByFile.push(`${file} 缺少 key: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}`)
  }
  if (missingByFile.length) {
    add('messages-keys', false, 'warn', '部分语言缺少与参考语言一致的 key', missingByFile)
  } else {
    add('messages-keys', true, 'info', '各语言 key 与参考一致')
  }
}

function keysFromObject(obj, prefix = '') {
  let list = []
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      list = list.concat(keysFromObject(v, key))
    } else {
      list.push(key)
    }
  }
  return list
}

// ---------- 2. 环境变量示例 ----------
function checkEnvExample() {
  const envPath = path.join(ROOT, '.env.example')
  if (!fs.existsSync(envPath)) {
    add('env-example', false, 'warn', '缺少 .env.example')
    return
  }
  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
  const content = fs.readFileSync(envPath, 'utf8')
  const missing = required.filter((r) => !content.includes(r))
  if (missing.length) {
    add('env-example', false, 'warn', '.env.example 缺少必填项说明', missing)
  } else {
    add('env-example', true, 'info', '.env.example 包含必填项说明')
  }
}

// ---------- 3. Lint ----------
function checkLint(skip) {
  if (skip) {
    add('lint', true, 'info', '已跳过 (--no-lint)')
    return
  }
  const r = spawnSync('npm', ['run', 'lint'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 })
  if (r.status !== 0) {
    // 仅作警告：lint 未通过不阻塞 check（多为 no-img-element / exhaustive-deps 等，可后续逐步修）
    add('lint', false, 'warn', 'next lint 未通过，建议修复后上线', (r.stderr || r.stdout || '').split('\n').slice(-8))
  } else {
    add('lint', true, 'info', 'next lint 通过')
  }
}

// ---------- 4. 关键 API 鉴权（getUser）----------
function checkApiAuth() {
  const critical = [
    'src/app/api/orders/create/route.ts',
    'src/app/api/orders/[id]/cancel/route.ts',
    'src/app/api/messages/route.ts',
    'src/app/api/subscriptions/create-payment/route.ts',
  ]
  const missing = []
  for (const rel of critical) {
    const full = path.join(ROOT, rel)
    if (!fs.existsSync(full)) continue
    const content = fs.readFileSync(full, 'utf8')
    if (!content.includes('getUser()') && !content.includes('getUser (')) {
      missing.push(rel)
    }
  }
  if (missing.length) {
    add('api-auth', false, 'error', '关键 API 未发现 getUser 鉴权', missing)
  } else {
    add('api-auth', true, 'info', '关键订单/消息/订阅 API 含 getUser 鉴权')
  }
}

// ---------- 5. 支付 Webhook 幂等（provider_ref）----------
function checkWebhookIdempotency() {
  const files = [
    'src/app/api/payments/stripe/webhook/route.ts',
    'src/app/api/payments/alipay/callback/route.ts',
  ]
  const missing = []
  for (const rel of files) {
    const full = path.join(ROOT, rel)
    if (!fs.existsSync(full)) continue
    const content = fs.readFileSync(full, 'utf8')
    if (!content.includes('provider_ref')) {
      missing.push(rel)
    }
  }
  if (missing.length) {
    add('webhook-idempotency', false, 'warn', '支付回调未发现 provider_ref 幂等', missing)
  } else {
    add('webhook-idempotency', true, 'info', '支付回调含 provider_ref 幂等')
  }
}

// ---------- 6. 关键 UI 防重复（loading/disabled）----------
function checkUiLoading() {
  const files = [
    'src/app/[locale]/(main)/checkout/page.tsx',
    'src/components/chat/ChatWindow.tsx',
    'src/components/social/ChatButton.tsx',
  ]
  const missing = []
  for (const rel of files) {
    const full = path.join(ROOT, rel)
    if (!fs.existsSync(full)) continue
    const content = fs.readFileSync(full, 'utf8')
    const hasDisabled = content.includes('disabled={') && (content.includes('loading') || content.includes('uploading'))
    if (!hasDisabled) {
      missing.push(rel)
    }
  }
  if (missing.length) {
    add('ui-loading', false, 'warn', '关键按钮未发现 loading/disabled 防重复', missing)
  } else {
    add('ui-loading', true, 'info', '结账/聊天等关键处有 loading+disabled')
  }
}

// ---------- 7. Cron 鉴权（verifyCronSecret）----------
function checkCronAuth() {
  const dir = path.join(ROOT, 'src', 'app', 'api', 'cron')
  if (!fs.existsSync(dir)) {
    add('cron-auth', true, 'info', '无 cron 路由，跳过')
    return
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const routeDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
  const missing = []
  for (const name of routeDirs) {
    const routePath = path.join(dir, name, 'route.ts')
    if (!fs.existsSync(routePath)) continue
    const content = fs.readFileSync(routePath, 'utf8')
    if (!content.includes('verifyCronSecret')) {
      missing.push(name)
    }
  }
  if (missing.length) {
    add('cron-auth', false, 'warn', '部分 Cron 路由未使用 verifyCronSecret', missing)
  } else {
    add('cron-auth', true, 'info', 'Cron 路由均使用 verifyCronSecret')
  }
}

// ---------- 8. 健康检查端点 ----------
function checkHealthRoute() {
  const full = path.join(ROOT, 'src', 'app', 'api', 'health', 'route.ts')
  if (!fs.existsSync(full)) {
    add('health-route', false, 'warn', '缺少 GET /api/health')
    return
  }
  const content = fs.readFileSync(full, 'utf8')
  if (!content.includes('profiles') && !content.includes('select')) {
    add('health-route', false, 'warn', '/api/health 可能未校验 Supabase')
  } else {
    add('health-route', true, 'info', '存在 /api/health 且校验 DB')
  }
}

// ---------- 9. E2E（可选）----------
function checkE2e(runE2e) {
  if (!runE2e) {
    add('e2e', true, 'info', '未执行 (加 --e2e 可运行 Playwright)')
    return
  }
  const r = spawnSync('npx', ['playwright', 'test', 'e2e/check-en.spec.ts', '--reporter=list'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, CI: '1' },
  })
  if (r.status !== 0) {
    add('e2e', false, 'warn', 'E2E /en 检查未通过（请确保 npm run dev 已启动）', (r.stdout || r.stderr || '').split('\n').slice(-20))
  } else {
    add('e2e', true, 'info', 'E2E /en 检查通过')
  }
}

// ---------- 运行与报告 ----------
function run(skipLint, runE2e) {
  checkMessageJson()
  checkEnvExample()
  checkLint(skipLint)
  checkApiAuth()
  checkWebhookIdempotency()
  checkUiLoading()
  checkCronAuth()
  checkHealthRoute()
  checkE2e(runE2e)

  const failed = results.filter((r) => !r.passed)
  const errors = failed.filter((r) => r.severity === 'error')
  const warns = failed.filter((r) => r.severity === 'warn')

  console.log('\n========== Stratos 项目检查报告 ==========\n')
  for (const r of results) {
    const icon = r.passed ? '✓' : r.severity === 'error' ? '✗' : '!'
    const tag = r.severity === 'error' ? 'ERROR' : r.severity === 'warn' ? 'WARN' : 'OK'
    console.log(`  ${icon} [${tag}] ${r.name}${r.message ? ': ' + r.message : ''}`)
    if (r.details && r.details.length) {
      r.details.slice(0, 5).forEach((d) => console.log(`      ${d}`))
      if (r.details.length > 5) console.log(`      ... 共 ${r.details.length} 条`)
    }
  }
  console.log('\n============================================\n')
  if (errors.length) {
    console.log(`失败: ${errors.length} 项 (error)，${warns.length} 项 (warn)`)
    process.exit(1)
  }
  if (warns.length) {
    console.log(`通过，但有 ${warns.length} 项警告，建议修复后再上线。`)
  } else {
    console.log('全部通过。')
  }
  process.exit(0)
}

const args = process.argv.slice(2)
const skipLint = args.includes('--no-lint')
const runE2e = args.includes('--e2e')
run(skipLint, runE2e)
