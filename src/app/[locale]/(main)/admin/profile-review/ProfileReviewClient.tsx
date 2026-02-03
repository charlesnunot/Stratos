'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Loader2, User, Check, X } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'

interface PendingProfile {
  id: string
  display_name: string | null
  username: string | null
  avatar_url: string | null
  bio: string | null
  location: string | null
  pending_display_name: string | null
  pending_username: string | null
  pending_avatar_url: string | null
  pending_bio: string | null
  pending_location: string | null
  updated_at: string
}

export function ProfileReviewClient({ initialProfiles }: { initialProfiles: PendingProfile[] }) {
  const router = useRouter()
  const t = useTranslations('admin')
  const [profiles, setProfiles] = useState<PendingProfile[]>(initialProfiles)
  const [actingId, setActingId] = useState<string | null>(null)

  const handleApprove = async (profileId: string) => {
    setActingId(profileId)
    try {
      // 1. 先迁移头像（待审核头像若为 Supabase 则迁到 Cloudinary）
      const migrateRes = await fetch('/api/cloudinary/migrate-profile-avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId }),
      })
      const migrateBody = await migrateRes.json().catch(() => ({}))
      if (!migrateRes.ok || migrateBody?.ok === false) {
        const msg = migrateBody?.error ?? t('migrateAvatarFailed')
        alert(msg)
        return
      }

      // 2. 审核通过（将 pending_* 写入主字段）
      const res = await fetch(`/api/admin/profiles/${profileId}/approve-profile`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      setProfiles((prev) => prev.filter((p) => p.id !== profileId))
      router.refresh()

      // 3. 触发翻译（display_name、bio 检测语言并写译文，fire-and-forget）
      fetch('/api/ai/translate-profile-after-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId }),
      }).catch(() => {})
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : t('reviewFailed'))
    } finally {
      setActingId(null)
    }
  }

  const handleReject = async (profileId: string) => {
    setActingId(profileId)
    try {
      const res = await fetch(`/api/admin/profiles/${profileId}/reject-profile`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      setProfiles((prev) => prev.filter((p) => p.id !== profileId))
      router.refresh()
    } catch (e) {
      console.error(e)
    } finally {
      setActingId(null)
    }
  }

  if (profiles.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        {t('noPendingProfiles')}
        <Link href="/admin/dashboard" className="ml-2 underline">
          {t('backToDashboard')}
        </Link>
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {profiles.map((p) => (
        <Card key={p.id} className="p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {(p.pending_avatar_url ?? p.avatar_url) ? (
              <img
                src={p.pending_avatar_url ?? p.avatar_url ?? ''}
                alt=""
                className="h-12 w-12 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <User className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-medium truncate">
                {p.pending_display_name ?? p.display_name ?? p.pending_username ?? p.username ?? p.id}
              </p>
              <p className="text-sm text-muted-foreground truncate">
                @{p.pending_username ?? p.username ?? '—'}
              </p>
              {(p.pending_bio ?? p.bio) && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {p.pending_bio ?? p.bio}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="default"
              onClick={() => handleApprove(p.id)}
              disabled={actingId !== null}
            >
              {actingId === p.id ? (
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
              onClick={() => handleReject(p.id)}
              disabled={actingId !== null}
            >
              {actingId === p.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <X className="h-4 w-4 mr-1" />
                  {t('reject')}
                </>
              )}
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/profile/${p.id}`} target="_blank" rel="noopener noreferrer">
                {t('viewProfile')}
              </Link>
            </Button>
          </div>
        </Card>
      ))}
    </div>
  )
}
