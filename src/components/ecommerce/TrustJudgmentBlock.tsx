'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronUp, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks/useToast'
import type { TrustJudgmentResponse, TrustEvidenceItem } from '@/app/api/trust/judgment/route'

export interface TrustJudgmentBlockProps {
  productId: string
  sellerId: string
  data: TrustJudgmentResponse
}

export function TrustJudgmentBlock({ productId, sellerId, data }: TrustJudgmentBlockProps) {
  const t = useTranslations('trust')
  const { toast } = useToast()
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [disagreeReason, setDisagreeReason] = useState<'price' | 'seller' | 'description' | ''>('')
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const recommendationText = t(data.recommendationKey as string)

  const handleAgree = async () => {
    if (feedbackSent) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/trust/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, sellerId, agreed: true }),
      })
      if (res.ok) setFeedbackSent(true)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDisagree = async () => {
    if (feedbackSent) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/trust/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          sellerId,
          agreed: false,
          reason: disagreeReason || undefined,
        }),
      })
      if (res.ok) {
        setFeedbackSent(true)
        toast({
          title: t('feedbackRecorded'),
          description: undefined,
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  const renderEvidenceLabel = (item: TrustEvidenceItem) => {
    const key = item.labelKey as string
    if (item.value !== undefined && item.value !== null) {
      return t(key, { value: item.value })
    }
    return t(key)
  }

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
      <div className="flex items-start gap-2">
        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-medium leading-snug">{recommendationText}</p>

          {data.evidence.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setEvidenceOpen((o) => !o)}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                {evidenceOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                <span>{evidenceOpen ? t('collapseReasons') : t('expandReasons')}</span>
              </button>
              {evidenceOpen && (
                <ul className="mt-1 list-inside list-disc space-y-0.5 pl-1 text-muted-foreground">
                  {data.evidence.map((item, i) => (
                    <li key={i}>{renderEvidenceLabel(item)}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!feedbackSent && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={submitting}
                onClick={handleAgree}
              >
                {t('agree')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={submitting}
                onClick={handleDisagree}
              >
                {t('disagree')}
              </Button>
              <select
                value={disagreeReason}
                onChange={(e) =>
                  setDisagreeReason(e.target.value as 'price' | 'seller' | 'description' | '')
                }
                className="rounded border border-input bg-background px-2 py-1 text-xs"
                aria-label={t('reasonsTitle')}
              >
                <option value="">{t('reasonsTitle')}</option>
                <option value="price">{t('reasonPrice')}</option>
                <option value="seller">{t('reasonSeller')}</option>
                <option value="description">{t('reasonDescription')}</option>
              </select>
            </div>
          )}

          <p className="text-xs text-muted-foreground">{t('boundaryDisclaimer')}</p>
        </div>
      </div>
    </div>
  )
}
