'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Check, X, User, Image as ImageIcon } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface VerificationItem {
  user_id: string
  real_name: string
  id_number_masked: string
  id_card_front_url: string | null
  id_card_back_url: string | null
  created_at: string
}

export function IdentityVerificationReviewClient() {
  const t = useTranslations('admin')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [list, setList] = useState<VerificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)
  const [rejectDialog, setRejectDialog] = useState<{ userId: string } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectSubmitting, setRejectSubmitting] = useState(false)

  const fetchList = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/identity-verification')
      if (res.ok) {
        const data = await res.json()
        setList(data.list ?? [])
      }
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchList()
  }, [])

  const handleApprove = async (userId: string) => {
    setActingId(userId)
    try {
      const res = await fetch(`/api/admin/identity-verification/${userId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'verified' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || t('reviewFailed'))
      }
      setList((prev) => prev.filter((i) => i.user_id !== userId))
      router.refresh()
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : t('reviewFailed'))
    } finally {
      setActingId(null)
    }
  }

  const handleRejectSubmit = async () => {
    if (!rejectDialog) return
    setRejectSubmitting(true)
    try {
      const res = await fetch(`/api/admin/identity-verification/${rejectDialog.userId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'rejected',
          rejected_reason: rejectReason.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || t('rejectFailed'))
      }
      setList((prev) => prev.filter((i) => i.user_id !== rejectDialog.userId))
      setRejectDialog(null)
      setRejectReason('')
      router.refresh()
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : t('rejectFailed'))
    } finally {
      setRejectSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (list.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        {t('noPendingIdentityVerification')}
        <Link href="/admin/dashboard" className="ml-2 underline">
          {t('backToDashboard')}
        </Link>
      </p>
    )
  }

  return (
    <>
      <div className="space-y-4">
        {list.map((item) => (
          <Card key={item.user_id} className="p-4 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <User className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium">{item.real_name}</p>
                  <p className="text-sm text-muted-foreground">身份证号：{item.id_number_masked}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    提交时间：{new Date(item.created_at).toLocaleString()}
                  </p>
                  <Link
                    href={`/profile/${item.user_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline mt-1 inline-block"
                  >
                    查看用户主页
                  </Link>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleApprove(item.user_id)}
                  disabled={actingId !== null}
                >
                  {actingId === item.user_id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      {t('approve')}
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRejectDialog({ userId: item.user_id })}
                  disabled={actingId !== null}
                >
                  <X className="h-4 w-4 mr-1" />
                  {t('reject')}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 border-t pt-4">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" />
                  {t('idCardFront')}
                </p>
                {item.id_card_front_url ? (
                  <a
                    href={item.id_card_front_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-24 h-16 rounded border bg-muted overflow-hidden hover:opacity-90"
                  >
                    <img
                      src={item.id_card_front_url}
                      alt={t('idCardFront')}
                      className="w-full h-full object-cover"
                    />
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">{t('none')}</span>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" />
                  {t('idCardBack')}
                </p>
                {item.id_card_back_url ? (
                  <a
                    href={item.id_card_back_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-24 h-16 rounded border bg-muted overflow-hidden hover:opacity-90"
                  >
                    <img
                      src={item.id_card_back_url}
                      alt={t('idCardBack')}
                      className="w-full h-full object-cover"
                    />
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">{t('none')}</span>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!rejectDialog} onOpenChange={(open) => !open && setRejectDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('rejectIdentityTitle')}</DialogTitle>
            <DialogDescription>{t('rejectIdentityDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">{t('rejectReasonOptional')}</Label>
            <Input
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t('rejectReasonPlaceholder')}
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(null)} disabled={rejectSubmitting}>
              {tCommon('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleRejectSubmit} disabled={rejectSubmitting}>
              {rejectSubmitting ? tCommon('submitting') : t('confirmReject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
