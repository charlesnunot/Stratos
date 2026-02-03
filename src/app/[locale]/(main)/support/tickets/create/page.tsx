'use client'

import { useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { sanitizeContent } from '@/lib/utils/sanitize-content'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

const TITLE_MAX_LENGTH = 200
const DESCRIPTION_MAX_LENGTH = 5000

export default function CreateTicketPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const t = useTranslations('support')
  const tCommon = useTranslations('common')
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    ticket_type: 'general',
    priority: 'medium',
  })

  if (!user) {
    router.push('/login')
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const rawTitle = formData.title.trim()
      const rawDescription = formData.description.trim()
      if (!rawTitle || !rawDescription) {
        toast({ variant: 'destructive', title: tCommon('error'), description: t('ticketTitleAndDescriptionRequired') })
        setLoading(false)
        return
      }
      if (rawTitle.length > TITLE_MAX_LENGTH) {
        toast({ variant: 'destructive', title: tCommon('error'), description: t('ticketTitleTooLong', { max: TITLE_MAX_LENGTH }) })
        setLoading(false)
        return
      }
      if (rawDescription.length > DESCRIPTION_MAX_LENGTH) {
        toast({ variant: 'destructive', title: tCommon('error'), description: t('ticketDescriptionTooLong', { max: DESCRIPTION_MAX_LENGTH }) })
        setLoading(false)
        return
      }
      const title = sanitizeContent(rawTitle)
      const description = sanitizeContent(rawDescription)
      const ticketType = ['general', 'technical', 'billing', 'refund', 'other'].includes(formData.ticket_type)
        ? formData.ticket_type
        : 'general'
      const priority = ['low', 'medium', 'high', 'urgent'].includes(formData.priority)
        ? formData.priority
        : 'medium'

      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          ticket_type: ticketType,
          priority,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || response.statusText)
      }

      router.push('/support/tickets')
    } catch (error: any) {
      console.error('Create ticket error:', error)
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: t('ticketCreatedFailed') + ': ' + error.message,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t('createTicket')}</h1>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium">{t('ticketTitle')}</label>
            <Input
              required
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder={t('enterTicketTitle')}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">{t('problemDescription')}</label>
            <textarea
              required
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder={t('describeProblem')}
              className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">{t('ticketType')}</label>
            <select
              value={formData.ticket_type}
              onChange={(e) =>
                setFormData({ ...formData, ticket_type: e.target.value })
              }
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="general">{t('typeGeneral')}</option>
              <option value="technical">{t('typeTechnical')}</option>
              <option value="billing">{t('typeBilling')}</option>
              <option value="refund">{t('typeRefund')}</option>
              <option value="other">{t('typeOther')}</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">{t('priority')}</label>
            <select
              value={formData.priority}
              onChange={(e) =>
                setFormData({ ...formData, priority: e.target.value })
              }
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="low">{t('priorityLow')}</option>
              <option value="medium">{t('priorityMedium')}</option>
              <option value="high">{t('priorityHigh')}</option>
              <option value="urgent">{t('priorityUrgent')}</option>
            </select>
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={loading}
            >
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tCommon('loading')}
                </>
              ) : (
                t('createTicket')
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
