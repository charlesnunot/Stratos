'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Search, UserPlus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

interface CreateConversationProps {
  onClose: () => void
}

export function CreateConversation({ onClose }: CreateConversationProps) {
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  const { toast } = useToast()
  const [searchQuery, setSearchQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const t = useTranslations('messages')

  const { data: users = [] } = useQuery({
    queryKey: ['searchUsers', searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim() || !user) return []
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
        .neq('id', user.id)
        .limit(10)

      if (error) throw error
      return data || []
    },
    enabled: !!searchQuery.trim() && !!user,
  })

  const handleCreateConversation = async (otherUserId: string) => {
    if (!user) return

    setCreating(true)
    try {
      // Check if conversation already exists
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .or(
          `participant1_id.eq.${user.id},participant2_id.eq.${user.id}`
        )
        .or(
          `participant1_id.eq.${otherUserId},participant2_id.eq.${otherUserId}`
        )
        .limit(1)
        .single()

      if (existing) {
        router.push(`/messages/${existing.id}`)
        onClose()
        return
      }

      // Create new conversation
      const { data: conversation, error } = await supabase
        .from('conversations')
        .insert({
          participant1_id: user.id,
          participant2_id: otherUserId,
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) throw error

      router.push(`/messages/${conversation.id}`)
      onClose()
    } catch (error) {
      console.error('Error creating conversation:', error)
      toast({
        variant: 'destructive',
        title: '错误',
        description: t('createConversationFailed'),
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('startNewConversation')}</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          ×
        </Button>
      </div>

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder={t('searchUsers')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="max-h-64 space-y-2 overflow-y-auto">
        {users.length === 0 && searchQuery && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t('noUsersFound')}
          </p>
        )}
        {users.map((otherUser: any) => (
          <Button
            key={otherUser.id}
            variant="ghost"
            className="w-full justify-start"
            onClick={() => handleCreateConversation(otherUser.id)}
            disabled={creating}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                {otherUser.avatar_url ? (
                  <img
                    src={otherUser.avatar_url}
                    alt={otherUser.display_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span>{otherUser.display_name?.[0]}</span>
                )}
              </div>
              <div className="text-left">
                <p className="font-semibold">{otherUser.display_name}</p>
                <p className="text-xs text-muted-foreground">
                  @{otherUser.username}
                </p>
              </div>
            </div>
          </Button>
        ))}
      </div>
    </Card>
  )
}
