'use client'

import { useState, useMemo, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { showSuccess, showError } from '@/lib/utils/toast'
import { Link } from '@/i18n/navigation'

const DEBOUNCE_MS = 500

interface ReportDialogProps {
  open: boolean
  onClose: () => void
  reportedType: 'post' | 'product' | 'user' | 'comment' | 'product_comment' | 'order' | 'affiliate_post' | 'tip' | 'message'
  reportedId: string
}

export function ReportDialog({
  open,
  onClose,
  reportedType,
  reportedId,
}: ReportDialogProps) {
  const { user } = useAuth()
  const supabase = useMemo(() => {
    if (typeof window !== 'undefined') {
      return createClient()
    }
    return null
  }, [])
  const t = useTranslations('posts')
  const tCommon = useTranslations('common')
  const tSupport = useTranslations('support')
  const [reason, setReason] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  const reasons = [
    { value: 'spam', label: t('reportReasons.spam') },
    { value: 'inappropriate', label: t('reportReasons.inappropriate') },
    { value: 'harassment', label: t('reportReasons.harassment') },
    { value: 'copyright', label: t('reportReasons.copyright') },
    { value: 'fake', label: t('reportReasons.fake') },
    { value: 'other', label: t('reportReasons.other') },
  ]

  const handleSubmit = useCallback(async () => {
    if (!user) {
      showError('请先登录')
      return
    }

    if (!reason) {
      showError('请选择举报原因')
      return
    }

    if (!supabase) {
      showError('客户端未初始化')
      return
    }

    if (loading) return // 防止重复提交
    
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    
    debounceTimerRef.current = setTimeout(async () => {
      debounceTimerRef.current = null
      setLoading(true)

      try {
        const { error } = await supabase.from('reports').insert({
          reporter_id: user.id,
          reported_type: reportedType,
          reported_id: reportedId,
          reason: reason,
          description: description.trim() || null,
          status: 'pending',
        })

        if (error) throw error

        showSuccess(t('reportSubmitted'))
        handleClose()
      } catch (error: any) {
        console.error('Report error:', error)
        showError(t('reportFailed'))
      } finally {
        setLoading(false)
      }
    }, DEBOUNCE_MS)
  }, [user, reason, supabase, loading, reportedType, reportedId, description, t])

  const handleClose = () => {
    setReason('')
    setDescription('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('reportTitle')}</DialogTitle>
          <DialogDescription>
            请选择举报原因，我们会尽快处理您的举报
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 举报原因选择 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('reportReason')} *</label>
            <div className="grid grid-cols-2 gap-2">
              {reasons.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReason(r.value)}
                  className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                    reason === r.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input hover:bg-accent'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* 详细描述 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('reportDescription')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('reportDescriptionPlaceholder')}
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              {description.length}/500
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="w-full sm:w-auto sm:mr-auto">
            <Link href="/support/tickets/create" onClick={handleClose}>
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                {tSupport('createTicketForHelp')}
              </Button>
            </Link>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={handleClose} disabled={loading}>
              {tCommon('cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={loading || !reason}>
              {loading ? tCommon('loading') : t('report')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
