const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://ihvjfkxkoxxnnnebrvlc.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlodmpma3hrb3h4bm5uZWJydmxjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzQwNjE3NSwiZXhwIjoyMDgyOTgyMTc1fQ.Zlk93V556RokeQPQrPQQ7RhCltncw_poM0-4qy0SBZI'

const expectedTables = [
  'profiles',
  'subscriptions',
  'payment_accounts',
  'topics',
  'posts',
  'post_topics',
  'products',
  'affiliate_products',
  'orders',
  'logistics_tracking',
  'conversations',
  'messages',
  'notifications',
  'follows',
  'likes',
  'comments',
  'tips',
  'reports',
  'support_tickets'
]

async function verifyMigration() {
  console.log('验证数据库迁移...\n')
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  
  const results = {
    success: [],
    missing: []
  }
  
  for (const table of expectedTables) {
    try {
      // 尝试查询表（使用limit 0只检查表是否存在）
      const { error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
      
      if (error) {
        if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
          results.missing.push(table)
          console.log(`❌ ${table} - 表不存在`)
        } else {
          // 表存在但可能有其他错误（如权限问题）
          results.success.push(table)
          console.log(`✓ ${table} - 表存在`)
        }
      } else {
        results.success.push(table)
        console.log(`✓ ${table} - 表存在`)
      }
    } catch (err) {
      results.missing.push(table)
      console.log(`❌ ${table} - 检查失败: ${err.message}`)
    }
  }
  
  console.log('\n=== 迁移验证结果 ===')
  console.log(`✓ 成功: ${results.success.length}/${expectedTables.length}`)
  console.log(`❌ 缺失: ${results.missing.length}/${expectedTables.length}`)
  
  if (results.missing.length > 0) {
    console.log('\n缺失的表:')
    results.missing.forEach(table => console.log(`  - ${table}`))
    console.log('\n请执行迁移脚本或手动在 Supabase 控制台执行 SQL。')
    process.exit(1)
  } else {
    console.log('\n✅ 所有表都已成功创建！')
    process.exit(0)
  }
}

verifyMigration()
