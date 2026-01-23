import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ReportManagement } from '@/components/admin/ReportManagement'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default async function AdminReportsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if user is admin or support
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  // 开发环境记录日志
  if (process.env.NODE_ENV === 'development') {
    if (profileError) {
      console.error('[AdminReportsPage] Profile query error:', {
        error: profileError,
        userId: user.id,
        message: profileError.message,
        details: profileError.details,
        hint: profileError.hint,
      })
    } else if (!profile) {
      console.warn('[AdminReportsPage] Profile not found:', {
        userId: user.id,
      })
    } else {
      console.log('[AdminReportsPage] Profile query success:', {
        userId: user.id,
        role: profile.role,
      })
    }
  }

  // 检查查询是否失败
  if (profileError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-bold text-destructive">查询失败</h1>
          <p className="text-muted-foreground">
            无法获取用户信息。请稍后重试。
          </p>
          {process.env.NODE_ENV === 'development' && (
            <p className="text-xs text-muted-foreground">
              错误详情: {profileError.message}
            </p>
          )}
          <div className="flex gap-2 justify-center">
            <Button variant="outline" asChild>
              <Link href="/">返回首页</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // 检查 profile 是否存在
  if (!profile) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-bold text-destructive">用户资料不存在</h1>
          <p className="text-muted-foreground">
            无法找到您的用户资料。请联系管理员。
          </p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" asChild>
              <Link href="/">返回首页</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // 获取用户角色，传递给客户端组件用于权限控制
  const userRole = profile.role || 'user'

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">
        {userRole === 'admin' || userRole === 'support' ? '举报管理' : '我的举报'}
      </h1>
      <ReportManagement userRole={userRole} />
    </div>
  )
}
