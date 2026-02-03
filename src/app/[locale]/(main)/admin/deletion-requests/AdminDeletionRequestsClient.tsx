'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { useToast } from '@/lib/hooks/useToast'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle, XCircle, UserCheck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useState } from 'react'

interface BlockingSummary {
  unfulfilled_orders_as_seller?: number
  unfulfilled_orders_as_buyer?: number
  deposit_lots_held?: boolean
  pending_commissions_count?: number
  pending_commissions_amount?: number
  seller_debts?: boolean
  open_disputes?: number
  open_tickets?: number
  active_subscriptions?: number
}

interface DeletionRequestRow {
  id: string
  user_id: string
  status: string
  reason: string | null
  blocking_summary: BlockingSummary | null
  rejected_reason: string | null
  reviewed_at: string | null
  created_at: string
  profile: {
    id: string
    username: string | null
    display_name: string | null
    role: string
    subscription_type: string | null
  } | null
}

function formatBlockingSummary(
  summary: BlockingSummary | null,
  t: (key: string, values?: Record<string, number | string>) => string
): string {
  if (!summary || typeof summary !== 'object') return t('blockingDash')
  const parts: string[] = []
  if (Number(summary.unfulfilled_orders_as_seller) > 0) {
    parts.push(t('blockingUnfulfilledSeller', { count: summary.unfulfilled_orders_as_seller! }))
  }
  if (Number(summary.unfulfilled_orders_as_buyer) > 0) {
    parts.push(t('blockingUnfulfilledBuyer', { count: summary.unfulfilled_orders_as_buyer! }))
  }
  if (summary.deposit_lots_held) parts.push(t('blockingDeposit'))
  if (Number(summary.pending_commissions_count) > 0) {
    parts.push(t('blockingPendingCommissions', { count: summary.pending_commissions_count! }))
  }
  if (summary.seller_debts) parts.push(t('blockingSellerDebt'))
  if (Number(summary.open_disputes) > 0) {
    parts.push(t('blockingOpenDisputes', { count: summary.open_disputes! }))
  }
  if (Number(summary.open_tickets) > 0) {
    parts.push(t('blockingOpenTickets', { count: summary.open_tickets! }))
  }
  if (Number(summary.active_subscriptions) > 0) {
    parts.push(t('blockingActiveSubscriptions', { count: summary.active_subscriptions! }))
  }
  return parts.length ? parts.join('；') : t('blockingNone')
}

export function AdminDeletionRequestsClient() {
  const queryClient = useQueryClient()
  const t = useTranslations('admin')
  const tCommon = useTranslations('common')
  const { toast } = useToast()
  const [rejectDialog, setRejectDialog] = useState<{ id: string } | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['adminDeletionRequests', 'pending'],
    queryFn: async () => {
      const res = await fetch('/api/admin/deletion-requests?status=pending')
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json()
      return (json.requests ?? []) as DeletionRequestRow[]
    },
  })

  const { data: approvedData, isLoading: approvedLoading } = useQuery({
    queryKey: ['adminDeletionRequests', 'approved'],
    queryFn: async () => {
      const res = await fetch('/api/admin/deletion-requests?status=approved&limit=50')
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json()
      return (json.requests ?? []) as DeletionRequestRow[]
    },
  })

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/deletion-requests/${id}/approve`, {
        method: 'POST',
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error || 'Failed to approve')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminDeletionRequests'] })
      toast({ title: tCommon('success'), description: t('deletionApproved') })
    },
    onError: (e: Error) => {
      toast({ variant: 'destructive', title: tCommon('error'), description: e.message })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: async ({ id, rejected_reason }: { id: string; rejected_reason: string }) => {
      const res = await fetch(`/api/admin/deletion-requests/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejected_reason }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error || 'Failed to reject')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminDeletionRequests'] })
      setRejectDialog(null)
      setRejectReason('')
      toast({ title: tCommon('success'), description: t('deletionRejected') })
    },
    onError: (e: Error) => {
      toast({ variant: 'destructive', title: tCommon('error'), description: e.message })
    },
  })

  const restoreMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/profiles/${userId}/restore`, { method: 'POST' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error || 'Failed to restore')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminDeletionRequests'] })
      toast({ title: tCommon('success'), description: t('restoreSuccess') })
    },
    onError: (e: Error) => {
      toast({ variant: 'destructive', title: tCommon('error'), description: e.message })
    },
  })

  const requests = data ?? []
  const approvedRequests = approvedData ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/dashboard">
          <Button variant="outline">{t('backToDashboard')}</Button>
        </Link>
      </div>
      <h1 className="text-2xl font-bold">{t('deletionRequests')}</h1>
      <p className="text-muted-foreground">{t('deletionRequestsDescription')}</p>

      <Card className="p-4 overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : requests.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            {t('noPendingDeletionRequests')}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2">{tCommon('user')}</th>
                <th className="text-left py-2 px-2">{t('requestedAt')}</th>
                <th className="text-left py-2 px-2">{t('blockingItems')}</th>
                <th className="text-left py-2 px-2">{t('reason')}</th>
                <th className="text-right py-2 px-2">{t('action')}</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-2 px-2">
                    <Link
                      href={`/profile/${row.user_id}`}
                      className="text-primary hover:underline"
                    >
                      {row.profile?.display_name || row.profile?.username || row.user_id}
                    </Link>
                    <span className="text-muted-foreground ml-1">
                      ({row.profile?.role ?? '—'})
                    </span>
                  </td>
                  <td className="py-2 px-2">
                    {row.created_at
                      ? new Date(row.created_at).toLocaleString()
                      : '—'}
                  </td>
                  <td className="py-2 px-2 max-w-xs truncate" title={formatBlockingSummary(row.blocking_summary, t)}>
                    {formatBlockingSummary(row.blocking_summary, t)}
                  </td>
                  <td className="py-2 px-2 max-w-[200px] truncate" title={row.reason ?? ''}>
                    {row.reason || '—'}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <Button
                      size="sm"
                      variant="default"
                      className="mr-2"
                      disabled={approveMutation.isPending && approveMutation.variables === row.id}
                      onClick={() => approveMutation.mutate(row.id)}
                    >
                      {approveMutation.isPending && approveMutation.variables === row.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-1" />
                          {t('approve')}
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={rejectMutation.isPending}
                      onClick={() => setRejectDialog({ id: row.id })}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      {t('reject')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <h2 className="text-lg font-semibold mt-8">{t('recentlyApproved')}</h2>
      <p className="text-sm text-muted-foreground mb-2">{t('recentlyApprovedDescription')}</p>
      <Card className="p-4 overflow-x-auto">
        {approvedLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : approvedRequests.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">{t('noApprovedDeletionRequests')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2">{tCommon('user')}</th>
                <th className="text-left py-2 px-2">{t('reviewedAt')}</th>
                <th className="text-right py-2 px-2">{t('action')}</th>
              </tr>
            </thead>
            <tbody>
              {approvedRequests.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-2 px-2">
                    <Link
                      href={`/profile/${row.user_id}`}
                      className="text-primary hover:underline"
                    >
                      {row.profile?.display_name || row.profile?.username || row.user_id}
                    </Link>
                    <span className="text-muted-foreground ml-1">({row.profile?.role ?? '—'})</span>
                  </td>
                  <td className="py-2 px-2">
                    {row.reviewed_at ? new Date(row.reviewed_at).toLocaleString() : '—'}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={restoreMutation.isPending && restoreMutation.variables === row.user_id}
                      onClick={() => restoreMutation.mutate(row.user_id)}
                    >
                      {restoreMutation.isPending && restoreMutation.variables === row.user_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <UserCheck className="h-4 w-4 mr-1" />
                          {t('restore')}
                        </>
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog open={!!rejectDialog} onOpenChange={(open) => !open && setRejectDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('reject')}</DialogTitle>
            <DialogDescription>{t('rejectedReasonPlaceholder')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">{t('rejectedReason')}</Label>
            <Input
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t('rejectedReasonPlaceholder')}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(null)}>
              {tCommon('cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={rejectMutation.isPending}
              onClick={() => {
                if (rejectDialog) {
                  rejectMutation.mutate({ id: rejectDialog.id, rejected_reason: rejectReason })
                }
              }}
            >
              {rejectMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('reject')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
