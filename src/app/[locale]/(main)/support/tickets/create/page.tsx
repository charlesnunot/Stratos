'use client'

import { useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

export default function CreateTicketPage() {
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
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
      const { error } = await supabase.from('support_tickets').insert({
        user_id: user.id,
        title: formData.title,
        description: formData.description,
        ticket_type: formData.ticket_type,
        priority: formData.priority,
        status: 'open',
      })

      if (error) throw error

      router.push('/support/tickets')
    } catch (error: any) {
      console.error('Create ticket error:', error)
      toast({
        variant: 'destructive',
        title: '错误',
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
              <option value="general">一般问题</option>
              <option value="technical">技术问题</option>
              <option value="billing">账单问题</option>
              <option value="refund">退款问题</option>
              <option value="other">其他</option>
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
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
              <option value="urgent">紧急</option>
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
