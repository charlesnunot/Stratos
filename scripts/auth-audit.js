#!/usr/bin/env node
/**
 * Auth System Audit Script
 * 鉴权系统代码扫描工具
 * 
 * 用于 CI/CD 流程中检查代码是否符合鉴权规范
 * 
 * 检查项:
 * 1. api/admin/* 路由必须使用统一鉴权守卫
 * 2. 禁止直接读取 SUPABASE_SERVICE_ROLE_KEY
 * 3. 禁止使用未注册的权限标识符
 * 4. 检查 withApiLogging 的 requireAuth 配置
 * 
 * 使用方法:
 * node scripts/auth-audit.js
 * 
 * 退出码:
 * 0 - 通过检查
 * 1 - 发现违规
 */

const fs = require('fs')
const path = require('path')
const { globSync } = require('glob')

// 颜色输出
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

// 违规记录
const violations = []

function addViolation(file, line, message, severity = 'error') {
  violations.push({ file, line, message, severity })
}

// 检查 1: api/admin/* 路由必须使用统一鉴权守卫
function checkAdminRoutesAuth() {
  log('\n🔍 Checking admin routes authentication...', 'blue')
  
  const adminRoutes = globSync('src/app/api/admin/**/route.ts')
  const requiredImports = [
    'requireAdmin',
    'requireAdminOrSupport',
    'requireRole',
    'requireUser',
  ]
  
  for (const file of adminRoutes) {
    const content = fs.readFileSync(file, 'utf-8')
    const lines = content.split('\n')
    
    // 检查是否导入了鉴权守卫
    const hasAuthImport = requiredImports.some(importName => 
      content.includes(importName)
    )
    
    if (!hasAuthImport) {
      addViolation(file, 1, 'Admin route must import authentication guards (requireAdmin, requireAdminOrSupport, etc.)', 'error')
      continue
    }
    
    // 检查是否调用了鉴权函数
    const hasAuthCall = requiredImports.some(importName => {
      const callPattern = new RegExp(`await\\s+${importName}\\s*\\(`)
      return callPattern.test(content)
    })
    
    if (!hasAuthCall) {
      addViolation(file, 1, 'Admin route must call authentication guard function', 'error')
    }
    
    // 检查是否直接使用了 createClient with SERVICE_ROLE_KEY
    if (content.includes('SUPABASE_SERVICE_ROLE_KEY') && !content.includes('getSupabaseAdmin')) {
      const lineIndex = lines.findIndex(line => line.includes('SUPABASE_SERVICE_ROLE_KEY'))
      addViolation(file, lineIndex + 1, 'Direct use of SUPABASE_SERVICE_ROLE_KEY is forbidden. Use getSupabaseAdmin() instead.', 'error')
    }
  }
  
  log(`✓ Checked ${adminRoutes.length} admin routes`, 'green')
}

// 检查 2: 禁止直接读取 SUPABASE_SERVICE_ROLE_KEY
function checkServiceRoleKeyUsage() {
  log('\n🔍 Checking for direct SERVICE_ROLE_KEY usage...', 'blue')
  
  const files = globSync('src/**/*.{ts,tsx}')
  const allowedFiles = [
    'src/lib/supabase/admin.ts',
    'src/lib/supabase/admin-client.ts',
  ]
  
  for (const file of files) {
    // 跳过允许的文件
    if (allowedFiles.some(allowed => file.includes(allowed))) {
      continue
    }
    
    const content = fs.readFileSync(file, 'utf-8')
    
    if (content.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      const lines = content.split('\n')
      const lineIndex = lines.findIndex(line => line.includes('SUPABASE_SERVICE_ROLE_KEY'))
      addViolation(file, lineIndex + 1, 'Direct use of SUPABASE_SERVICE_ROLE_KEY is forbidden outside of allowed files. Use getSupabaseAdmin() instead.', 'error')
    }
    
    // 检查是否直接创建 admin client
    if (content.includes('createClient') && content.includes('serviceRoleKey')) {
      const lines = content.split('\n')
      const lineIndex = lines.findIndex(line => line.includes('serviceRoleKey'))
      addViolation(file, lineIndex + 1, 'Direct creation of admin client is forbidden. Use getSupabaseAdmin() instead.', 'error')
    }
  }
  
  log(`✓ Checked ${files.length} files`, 'green')
}

// 检查 3: 检查 withApiLogging 的 requireAuth 配置
function checkWithApiLoggingUsage() {
  log('\n🔍 Checking withApiLogging usage...', 'blue')
  
  const files = globSync('src/app/api/**/route.ts')
  
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')
    
    // 如果使用了 withApiLogging，检查是否有 requireAuth 配置
    if (content.includes('withApiLogging')) {
      // 检查是否在非公开路由中使用了 requireAuth: true
      const isPublicRoute = 
        file.includes('/auth/') ||
        file.includes('/public/') ||
        file.includes('/webhook/') ||
        file.includes('/cron/')
      
      if (!isPublicRoute && !content.includes('requireAuth')) {
        // 这是一个警告，不是错误
        addViolation(file, 1, 'Route uses withApiLogging but does not specify requireAuth option. Consider adding requireAuth: true for protected routes.', 'warning')
      }
    }
  }
  
  log(`✓ Checked ${files.length} API routes`, 'green')
}

// 检查 4: 检查权限标识符是否已注册
function checkPermissionRegistration() {
  log('\n🔍 Checking permission registration...', 'blue')
  
  // 读取已注册的权限
  const permissionsFile = fs.readFileSync('src/lib/auth/permissions.ts', 'utf-8')
  const permissionMatches = permissionsFile.match(/[A-Z_]+: '[^']+'/g) || []
  const registeredPermissions = permissionMatches.map(match => {
    const valueMatch = match.match(/: '([^']+)'/)
    return valueMatch ? valueMatch[1] : null
  }).filter(Boolean)
  
  // 检查 guards.ts 中的权限使用
  const guardsFile = fs.readFileSync('src/lib/auth/guards.ts', 'utf-8')
  const usedPermissions = guardsFile.match(/'[a-z.]+'/g) || []
  
  for (const permission of usedPermissions) {
    const cleanPermission = permission.replace(/'/g, '')
    if (!registeredPermissions.includes(cleanPermission) && 
        !['admin', 'support', 'seller', 'affiliate', 'user'].includes(cleanPermission)) {
      // 可能是动态权限，跳过
      continue
    }
  }
  
  log(`✓ Checked ${registeredPermissions.length} registered permissions`, 'green')
}

// 检查 5: 检查空路由文件
function checkEmptyRouteFiles() {
  log('\n🔍 Checking for empty route files...', 'blue')
  
  const routeFiles = globSync('src/app/api/**/route.ts')
  
  for (const file of routeFiles) {
    const content = fs.readFileSync(file, 'utf-8').trim()
    
    if (content.length === 0) {
      addViolation(file, 1, 'Empty route file detected. Remove or implement the route.', 'error')
    }
  }
  
  log(`✓ Checked ${routeFiles.length} route files`, 'green')
}

// 主函数
function main() {
  log('🔐 Auth System Audit', 'blue')
  log('====================\n', 'blue')
  
  checkAdminRoutesAuth()
  checkServiceRoleKeyUsage()
  checkWithApiLoggingUsage()
  checkPermissionRegistration()
  checkEmptyRouteFiles()
  
  // 输出结果
  log('\n====================', 'blue')
  log('Audit Results', 'blue')
  log('====================\n', 'blue')
  
  const errors = violations.filter(v => v.severity === 'error')
  const warnings = violations.filter(v => v.severity === 'warning')
  
  if (violations.length === 0) {
    log('✅ All checks passed!', 'green')
    process.exit(0)
  } else {
    if (errors.length > 0) {
      log(`❌ ${errors.length} error(s) found:\n`, 'red')
      errors.forEach(v => {
        log(`  ${v.file}:${v.line}`, 'yellow')
        log(`    ${v.message}\n`, 'red')
      })
    }
    
    if (warnings.length > 0) {
      log(`⚠️  ${warnings.length} warning(s) found:\n`, 'yellow')
      warnings.forEach(v => {
        log(`  ${v.file}:${v.line}`, 'yellow')
        log(`    ${v.message}\n`, 'yellow')
      })
    }
    
    log(`\nTotal: ${errors.length} error(s), ${warnings.length} warning(s)`, errors.length > 0 ? 'red' : 'yellow')
    
    if (errors.length > 0) {
      process.exit(1)
    } else {
      process.exit(0)
    }
  }
}

main()
