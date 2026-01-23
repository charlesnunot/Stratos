'use client'

import { ReactNode } from 'react'
import { useAuthGuard } from '@/lib/hooks/useAuthGuard'
import { Loader2 } from 'lucide-react'

interface AuthGuardProps {
  children: ReactNode
  redirectTo?: string
  fallback?: ReactNode
}

export function AuthGuard({ 
  children, 
  redirectTo = '/login',
  fallback 
}: AuthGuardProps) {
  const { loading, isAuthenticated } = useAuthGuard({ redirectTo })

  if (loading) {
    return fallback || (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return null // 正在重定向
  }

  return <>{children}</>
}
