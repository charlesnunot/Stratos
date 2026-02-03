'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, X, Users } from 'lucide-react'
import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'

interface CreateGroupProps {
  onClose: () => void
}

export function CreateGroup({ onClose }: CreateGroupProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()
  const supabase = createClient()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const t = useTranslations('messages')
  const tCommon = useTranslations('common')

  // Get user's following list for member selection
  const { data: following = [] } = useQuery({
    queryKey: ['following', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('follows')
        .select('followee_id, followee:profiles!follows_followee_id_fkey(id, username, display_name, avatar_url)')
        .eq('follower_id', user.id)

      if (error) throw error
      return data || []
    },
    enabled: !!user,
  })

  const handleToggleMember = (memberId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    )
  }

  const handleCreate = async () => {
    if (!name.trim() || !user) return

    setLoading(true)
    try {
      const response = await fetch('/api/groups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          memberIds: selectedMembers,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || t('createGroupFailed'))
      }

      const { group } = await response.json()

      // Refresh conversations list
      queryClient.invalidateQueries({ queryKey: ['conversations'] })

      onClose()
      router.push(`/messages/${group.id}`)
    } catch (error: any) {
      console.error('Create group error:', error)
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: error.message || t('createGroupFailed'),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('createGroup')}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">{t('groupNameRequired')}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('groupNamePlaceholder')}
              maxLength={50}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t('groupDescription')}</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('groupDescriptionPlaceholder')}
              maxLength={200}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">{t('addMembers')}</label>
            <div className="max-h-48 space-y-2 overflow-y-auto border rounded-md p-3">
              {following.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t('noFollowingToAdd')}
                </p>
              ) : (
                following.map((follow: any) => {
                  const followee = follow.followee
                  const isSelected = selectedMembers.includes(followee.id)
                  return (
                    <div
                      key={followee.id}
                      role="button"
                      tabIndex={0}
                      className={`flex items-center gap-2 rounded-md p-2 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-primary/10 border border-primary'
                          : 'hover:bg-muted'
                      }`}
                      onClick={() => handleToggleMember(followee.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleToggleMember(followee.id)
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        tabIndex={-1}
                        className="h-4 w-4 shrink-0 pointer-events-none"
                        aria-hidden
                      />
                      {followee.avatar_url && (
                        <img
                          src={followee.avatar_url}
                          alt={followee.display_name || followee.username}
                          className="h-8 w-8 rounded-full"
                        />
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {followee.display_name || followee.username}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            {selectedMembers.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t('selectedMembersCount', { count: selectedMembers.length })}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              {tCommon('cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={loading || !name.trim()}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('creating')}
                </>
              ) : (
                t('createGroup')
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
