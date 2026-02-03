'use client'

import { useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useAuthGuard } from '@/lib/hooks/useAuthGuard'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

const MAX_NAME = 80
const MAX_DESC = 500

export default function CreateGroupPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuthGuard()
  const t = useTranslations('groups')
  const tCommon = useTranslations('common')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleNameChange = (v: string) => {
    setName(v)
    if (!slug || slug === name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')) {
      setSlug(v.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const nameTrim = name.trim()
    if (!nameTrim) {
      setError(t('nameRequired'))
      return
    }
    if (nameTrim.length > MAX_NAME) {
      setError(t('nameTooLong'))
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/community-groups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameTrim,
          slug: slug.trim() || undefined,
          description: description.trim().slice(0, MAX_DESC) || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error === 'slug_taken' ? t('slugTaken') : data.error || t('createFailed'))
        return
      }
      if (data.group?.slug) {
        router.push(`/groups/${data.group.slug}`)
      } else {
        router.push('/groups')
      }
    } catch {
      setError(t('createFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading || !user) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">{t('createGroup')}</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="p-4">
          <label className="block text-sm font-medium">{t('groupName')} *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder={t('groupNamePlaceholder')}
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            maxLength={MAX_NAME}
          />
        </Card>
        <Card className="p-4">
          <label className="block text-sm font-medium">{t('slug')}</label>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder="my-group"
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">{t('slugHint')}</p>
        </Card>
        <Card className="p-4">
          <label className="block text-sm font-medium">{t('description')}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESC))}
            placeholder={t('descriptionPlaceholder')}
            className="mt-2 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
            rows={3}
            maxLength={MAX_DESC}
          />
        </Card>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            {tCommon('cancel')}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('create')}
          </Button>
        </div>
      </form>
    </div>
  )
}
