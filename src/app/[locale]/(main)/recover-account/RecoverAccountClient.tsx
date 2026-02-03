'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { useToast } from '@/lib/hooks/useToast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, UserCheck, LogOut } from 'lucide-react'

const RECOVERY_GRACE_DAYS = 30

export function RecoverAccountClient() {
  const t = useTranslations('recoverAccount')
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['accountRecoverInfo'],
    queryFn: async () => {
      const res = await fetch('/api/account/recover')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json() as Promise<{
        status: string
        canRecover: boolean
        reviewedAt: string | null
        graceEndAt: string | null
        message: string | null
      }>
    },
  })

  const restoreMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/account/recover', { method: 'POST' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error || 'Failed to restore')
      }
      return res.json()
    },
    onSuccess: () => {
      toast({ title: t('restoreSuccess'), description: t('restoreSuccessDescription') })
      queryClient.invalidateQueries({ queryKey: ['accountRecoverInfo'] })
      router.push('/')
    },
    onError: (e: Error) => {
      toast({ variant: 'destructive', title: e.message })
    },
  })

  const handleKeepDeleted = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-16 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const canRecover = data?.canRecover ?? false
  const graceEndAt = data?.graceEndAt

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <UserCheck className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl">{t('title')}</CardTitle>
            <CardDescription className="mt-2">{t('description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canRecover ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {t('canRecover', { days: RECOVERY_GRACE_DAYS })}
                  {graceEndAt && (
                    <span className="block mt-1">
                      （{t('graceEndBefore', { date: new Date(graceEndAt).toLocaleDateString() })}）
                    </span>
                  )}
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => restoreMutation.mutate()}
                    disabled={restoreMutation.isPending}
                  >
                    {restoreMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <UserCheck className="h-4 w-4 mr-2" />
                    )}
                    {t('restoreButton')}
                  </Button>
                  <Button variant="outline" onClick={handleKeepDeleted}>
                    <LogOut className="h-4 w-4 mr-2" />
                    {t('keepDeleted')}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{t('graceExpired')}</p>
                <p className="text-sm text-muted-foreground">{t('contactSupport')}</p>
                <Button variant="outline" onClick={handleKeepDeleted} className="w-full">
                  <LogOut className="h-4 w-4 mr-2" />
                  {t('keepDeleted')}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
