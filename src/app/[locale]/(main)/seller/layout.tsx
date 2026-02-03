'use client'

import { useSellerGuard } from '@/lib/hooks/useSellerGuard'
import { Loader2 } from 'lucide-react'

/**
 * 卖家区布局：未登录重定向到登录页，非卖家订阅用户重定向到卖家订阅页
 */
export default function SellerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading, isSeller } = useSellerGuard({
    redirectTo: '/subscription/seller',
  })

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user || !isSeller) {
    return null
  }

  return <>{children}</>
}
