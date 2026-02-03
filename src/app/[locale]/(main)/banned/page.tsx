import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle } from 'lucide-react'

export default async function BannedPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/${locale}`)
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('status')
    .eq('id', user.id)
    .single()
  const isBannedOrSuspended =
    profile?.status === 'banned' || profile?.status === 'suspended'
  if (!isBannedOrSuspended) {
    redirect(`/${locale}`)
  }

  const t = await getTranslations('common')

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle className="text-2xl">账户已被禁用</CardTitle>
            <CardDescription className="mt-2">
              您的账户已被管理员禁用，无法继续使用平台功能
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm text-muted-foreground">
                如果您认为这是一个错误，请联系客服支持。
              </p>
            </div>
            <div className="text-center text-sm text-muted-foreground">
              <p>如需帮助，请发送邮件至：support@example.com</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
