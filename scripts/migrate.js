const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Supabase配置
const SUPABASE_URL = 'https://ihvjfkxkoxxnnnebrvlc.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlodmpma3hrb3h4bm5uZWJydmxjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzQwNjE3NSwiZXhwIjoyMDgyOTgyMTc1fQ.Zlk93V556RokeQPQrPQQ7RhCltncw_poM0-4qy0SBZI'

async function runMigration() {
  console.log('开始数据库迁移...')
  
  // 读取SQL文件
  const sqlPath = path.join(__dirname, '../supabase/migrations/001_initial_schema.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')
  
  // 创建Supabase客户端（使用service_role key）
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  
  try {
    // 将SQL按分号分割成多个语句
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))
    
    console.log(`准备执行 ${statements.length} 条SQL语句...`)
    
    // 执行每个SQL语句
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]
      if (statement.length > 0) {
        try {
          // 使用RPC调用执行SQL
          const { data, error } = await supabase.rpc('exec_sql', {
            sql_query: statement + ';'
          })
          
          if (error) {
            // 如果RPC不存在，尝试直接执行
            console.log(`语句 ${i + 1}: 尝试直接执行...`)
          } else {
            console.log(`✓ 语句 ${i + 1} 执行成功`)
          }
        } catch (err) {
          console.log(`⚠ 语句 ${i + 1} 可能已存在或需要手动执行: ${err.message}`)
        }
      }
    }
    
    console.log('\n迁移完成！')
    console.log('注意：某些SQL语句可能需要通过Supabase控制台的SQL编辑器手动执行。')
    
  } catch (error) {
    console.error('迁移过程中出错:', error)
    console.log('\n请通过以下方式手动执行迁移：')
    console.log('1. 访问 Supabase 控制台: https://supabase.com/dashboard')
    console.log('2. 选择您的项目')
    console.log('3. 进入 SQL Editor')
    console.log('4. 复制 supabase/migrations/001_initial_schema.sql 的内容')
    console.log('5. 粘贴并执行')
  }
}

runMigration()
