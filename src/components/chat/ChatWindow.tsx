'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { handleError } from '@/lib/utils/handleError'
import { Button } from '@/components/ui/button'
import { MessageBubble } from './MessageBubble'
import { useTranslations, useLocale } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { EmojiPicker } from '@/components/ui/EmojiPicker'
import { useImageUpload } from '@/lib/hooks/useImageUpload'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { ImagePlus, Package, FileText } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import type { GroupMember } from '@/app/[locale]/(main)/messages/[id]/ChatPageClient'

interface ChatWindowProps {
  conversationId: string
  isGroup?: boolean
  groupMembers?: GroupMember[]
}

const MAX_MESSAGE_LENGTH = 10000
const CHAT_IMAGE_BUCKET = 'chat'
const CHAT_IMAGE_FOLDER = 'chat'

export function ChatWindow({ conversationId, isGroup = false, groupMembers = [] }: ChatWindowProps) {
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [shareProductOpen, setShareProductOpen] = useState(false)
  const [sharePostOpen, setSharePostOpen] = useState(false)
  const [shareProductInput, setShareProductInput] = useState('')
  const [sharePostInput, setSharePostInput] = useState('')
  const [shareLoading, setShareLoading] = useState(false)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [mentionCursorStart, setMentionCursorStart] = useState(0)
  const [cursorPos, setCursorPos] = useState(0)
  const [mentionIndex, setMentionIndex] = useState(0)
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const locale = useLocale()
  const supabase = useMemo(() => createClient(), [])
  const { toast } = useToast()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const mentionListRef = useRef<HTMLDivElement>(null)
  const t = useTranslations('messages')

  const { data: followerList = [] } = useQuery({
    queryKey: ['myFollowers', user?.id],
    queryFn: async (): Promise<GroupMember[]> => {
      if (!user?.id || isGroup) return []
      const { data, error } = await supabase
        .from('follows')
        .select(`
          follower_id,
          profile:profiles!follows_follower_id_fkey(id, username, display_name, avatar_url)
        `)
        .eq('followee_id', user.id)
      if (error) return []
      const list = (data ?? [])
        .map((r: any) => r.profile)
        .filter(Boolean)
        .map((p: any) => ({
          id: p.id,
          username: p.username ?? null,
          display_name: p.display_name ?? null,
          avatar_url: p.avatar_url ?? null,
        }))
      return list
    },
    enabled: !!user?.id && !isGroup,
  })

  const mentionableUsers = isGroup ? groupMembers : followerList

  const mentionCandidates = useMemo(() => {
    if (!mentionableUsers.length) return []
    const filter = mentionFilter.trim().toLowerCase()
    const excludeSelf = mentionableUsers.filter((m) => m.id !== user?.id)
    if (!filter) return excludeSelf.slice(0, 10)
    return excludeSelf
      .filter(
        (m) =>
          (m.username?.toLowerCase().includes(filter) ?? false) ||
          (m.display_name?.toLowerCase().includes(filter) ?? false)
      )
      .slice(0, 10)
  }, [mentionableUsers, user?.id, mentionFilter])

  const {
    allPreviews,
    uploading,
    handleImageSelect,
    removeImage,
    removeExistingImage,
    uploadImages,
    totalImageCount,
    clearImages,
    existingImages,
  } = useImageUpload({
    bucket: CHAT_IMAGE_BUCKET,
    folder: CHAT_IMAGE_FOLDER,
    maxImages: 4,
  })

  const removePreviewAt = useCallback(
    (index: number) => {
      if (index < existingImages.length) {
        removeExistingImage(index)
      } else {
        removeImage(index - existingImages.length)
      }
    },
    [existingImages.length, removeExistingImage, removeImage]
  )

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const appendMessageDeduped = useCallback((msg: any) => {
    setMessages((prev) => {
      if (!msg) return prev
      const msgId = msg.id
      if (msgId && prev.some((m) => m?.id === msgId)) return prev

      // fallback: content + sender + created_at 组合去重
      const key = `${msg?.sender_id ?? ''}\u0000${msg?.created_at ?? ''}\u0000${msg?.content ?? ''}`
      if (prev.some((m) => `${m?.sender_id ?? ''}\u0000${m?.created_at ?? ''}\u0000${m?.content ?? ''}` === key)) {
        return prev
      }
      return [...prev, msg]
    })
  }, [])

  const loadMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select(`
        id,
        conversation_id,
        sender_id,
        content,
        message_type,
        created_at,
        is_read,
        sender:profiles!messages_sender_id_fkey(id, username, display_name, avatar_url)
      `)
      .eq('conversation_id', conversationId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error loading messages:', error)
      return
    }

    if (data) {
      setMessages(data)

      // Mark messages as read (best-effort); then invalidate so chat list unread count updates
      if (user) {
        const { error: readError } = await supabase
          .from('messages')
          .update({ is_read: true })
          .eq('conversation_id', conversationId)
          .neq('sender_id', user.id)
          .eq('is_read', false)
        if (readError) {
          console.error('Error marking messages as read:', readError)
        } else {
          queryClient.invalidateQueries({ queryKey: ['conversationDetails', user.id] })
          queryClient.invalidateQueries({ queryKey: ['conversations', user.id] })
        }
      }
    }
  }, [conversationId, queryClient, supabase, user])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  useEffect(() => {
    // Subscribe to new messages
    const channel = supabase
      .channel(`messages_${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          appendMessageDeduped(payload.new)
          scrollToBottom()
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [appendMessageDeduped, conversationId, scrollToBottom, supabase])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const updateMentionState = useCallback((value: string, selectionStart: number) => {
    setCursorPos(selectionStart)
    const textBeforeCursor = value.slice(0, selectionStart)
    const lastAt = textBeforeCursor.lastIndexOf('@')
    if (lastAt !== -1) {
      const between = textBeforeCursor.slice(lastAt + 1)
      if (!between.includes(' ') && between.length <= 30) {
        setMentionCursorStart(lastAt)
        setMentionFilter(between)
        setMentionOpen(true)
        setMentionIndex(0)
        return
      }
    }
    setMentionOpen(false)
  }, [])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value
      const pos = e.target.selectionStart ?? 0
      setNewMessage(v)
      const hasMentionList = isGroup ? groupMembers.length > 0 : followerList.length > 0
      if (hasMentionList) {
        updateMentionState(v, pos)
      }
    },
    [isGroup, groupMembers.length, followerList.length, updateMentionState]
  )

  const insertMention = useCallback(
    (member: GroupMember) => {
      const username = member.username || member.display_name || member.id.slice(0, 8)
      const before = newMessage.slice(0, mentionCursorStart)
      const after = newMessage.slice(cursorPos)
      const next = before + '@' + username + ' ' + after
      setNewMessage(next)
      setMentionOpen(false)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        const pos = mentionCursorStart + username.length + 2
        inputRef.current?.setSelectionRange(pos, pos)
      })
    },
    [newMessage, mentionCursorStart, cursorPos]
  )

  const insertEmojiAtCursor = useCallback((emoji: string) => {
    const input = inputRef.current
    if (!input) return
    const start = input.selectionStart ?? 0
    const end = input.selectionEnd ?? 0
    const text = newMessage
    const newText = text.slice(0, start) + emoji + text.slice(end)
    setNewMessage(newText)
    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }, [newMessage])

  const sendMessage = useCallback(
    async (content: string, messageType: string = 'text') => {
      if (!user) return
      setLoading(true)
      try {
        const res = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conversationId,
            content,
            message_type: messageType,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          handleError(
            new Error(data?.error || res.statusText || 'Send failed'),
            t('sendFailed')
          )
          return
        }
        const optimisticMsg = {
          id: data.id ?? `temp_${Date.now()}`,
          conversation_id: conversationId,
          sender_id: user.id,
          content,
          message_type: messageType,
          created_at: data.created_at ?? new Date().toISOString(),
        }
        appendMessageDeduped(optimisticMsg)
        await loadMessages()
      } catch (error) {
        handleError(error, t('sendFailed'))
      } finally {
        setLoading(false)
      }
    },
    [conversationId, user, appendMessageDeduped, loadMessages, t]
  )

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading || !user || !newMessage.trim()) return
    const content = newMessage.trim()
    if (content.length > MAX_MESSAGE_LENGTH) {
      toast({
        variant: 'destructive',
        title: t('messageTooLong'),
        description: t('messageTooLongDescription', { max: MAX_MESSAGE_LENGTH }),
      })
      return
    }
    await sendMessage(content, 'text')
    setNewMessage('')
  }

  const handleSendImage = useCallback(async () => {
    if (!user || totalImageCount === 0) return
    try {
      const urls = await uploadImages()
      for (const url of urls) {
        await sendMessage(url, 'image')
      }
      clearImages()
    } catch (error) {
      handleError(error, t('sendImageFailed'))
    }
  }, [user, totalImageCount, uploadImages, sendMessage, clearImages, t])

  const parseIdFromInput = (input: string): string | null => {
    const trimmed = input.trim()
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidRegex.test(trimmed)) return trimmed
    const productMatch = trimmed.match(/\/product\/([0-9a-f-]{36})/i)
    if (productMatch) return productMatch[1]
    const postMatch = trimmed.match(/\/post\/([0-9a-f-]{36})/i)
    if (postMatch) return postMatch[1]
    return null
  }

  const handleShareProduct = async () => {
    const id = parseIdFromInput(shareProductInput)
    if (!id) {
      toast({
        variant: 'destructive',
        title: t('invalidProductId'),
        description: t('invalidProductIdDescription'),
      })
      return
    }
    setShareLoading(true)
    try {
      const { data: product, error } = await supabase
        .from('products')
        .select('id, name, price, images')
        .eq('id', id)
        .eq('status', 'active')
        .single()
      if (error || !product) {
        toast({
          variant: 'destructive',
          title: t('productNotFound'),
        })
        return
      }
      const url = `/${locale}/product/${product.id}`
      const payload = {
        type: 'product',
        id: product.id,
        name: product.name,
        price: product.price,
        image: Array.isArray(product.images) ? product.images[0] ?? null : null,
        url,
      }
      await sendMessage(JSON.stringify(payload), 'product')
      setShareProductOpen(false)
      setShareProductInput('')
    } catch (error) {
      handleError(error, t('sendFailed'))
    } finally {
      setShareLoading(false)
    }
  }

  const handleSharePost = async () => {
    const id = parseIdFromInput(sharePostInput)
    if (!id) {
      toast({
        variant: 'destructive',
        title: t('invalidPostId'),
        description: t('invalidPostIdDescription'),
      })
      return
    }
    setShareLoading(true)
    try {
      const { data: post, error } = await supabase
        .from('posts')
        .select('id, content, image_urls')
        .eq('id', id)
        .eq('status', 'approved')
        .single()
      if (error || !post) {
        toast({
          variant: 'destructive',
          title: t('postNotFound'),
        })
        return
      }
      const url = `/${locale}/post/${post.id}`
      const title = typeof post.content === 'string' ? post.content.slice(0, 80) : ''
      const image = Array.isArray(post.image_urls) ? post.image_urls[0] ?? null : null
      const payload = {
        type: 'post',
        id: post.id,
        title: title || undefined,
        image,
        url,
      }
      await sendMessage(JSON.stringify(payload), 'post')
      setSharePostOpen(false)
      setSharePostInput('')
    } catch (error) {
      handleError(error, t('sendFailed'))
    } finally {
      setShareLoading(false)
    }
  }

  return (
    <div className="flex h-[600px] flex-col">
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isOwn={message.sender_id === user?.id}
            groupMembers={mentionableUsers.length > 0 ? mentionableUsers : undefined}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
      {allPreviews.length > 0 && (
        <div className="border-t px-4 py-2 flex flex-wrap gap-2 items-center">
          {allPreviews.map((src, i) => (
            <div key={i} className="relative">
              <img src={src} alt="" className="h-16 w-16 rounded object-cover" />
              <button
                type="button"
                onClick={() => removePreviewAt(i)}
                className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs"
              >
                ×
              </button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            onClick={handleSendImage}
            disabled={uploading || loading}
          >
            {uploading ? t('uploading') : t('sendImage')}
          </Button>
        </div>
      )}
      <form onSubmit={handleSend} className="border-t p-4 relative">
        {mentionOpen && mentionCandidates.length > 0 && (
          <div
            ref={mentionListRef}
            className="absolute bottom-full left-4 right-4 mb-1 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-lg z-10"
          >
            <p className="px-2 py-1.5 text-xs text-muted-foreground border-b">
              {isGroup ? t('mentionHint') : t('mentionHintPrivate')}
            </p>
            {mentionCandidates.map((m, i) => (
              <button
                key={m.id}
                type="button"
                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent ${i === mentionIndex ? 'bg-accent' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertMention(m)
                }}
              >
                <div className="h-7 w-7 rounded-full overflow-hidden bg-muted shrink-0">
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs flex items-center justify-center h-full">
                      {m.display_name?.[0] || m.username?.[0] || '?'}
                    </span>
                  )}
                </div>
                <span className="truncate">{m.display_name || m.username || m.id.slice(0, 8)}</span>
                {m.username && (
                  <span className="text-xs text-muted-foreground truncate">@{m.username}</span>
                )}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2 items-center">
          <div className="flex items-center gap-1">
            <EmojiPicker onEmojiSelect={insertEmojiAtCursor} />
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
              multiple
              className="hidden"
              id="chat-image-upload"
              onChange={(e) => {
                handleImageSelect(e)
                e.target.value = ''
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => document.getElementById('chat-image-upload')?.click()}
              title={t('sendImage')}
            >
              <ImagePlus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShareProductOpen(true)}
              title={t('sendProductCard')}
            >
              <Package className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSharePostOpen(true)}
              title={t('sendPostCard')}
            >
              <FileText className="h-4 w-4" />
            </Button>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={newMessage}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (!mentionOpen || mentionCandidates.length === 0) return
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setMentionIndex((i) => (i + 1) % mentionCandidates.length)
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setMentionIndex((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length)
              } else if (e.key === 'Enter' && mentionCandidates[mentionIndex]) {
                e.preventDefault()
                insertMention(mentionCandidates[mentionIndex])
              } else if (e.key === 'Escape') {
                setMentionOpen(false)
              }
            }}
            placeholder={
              mentionableUsers.length > 0
                ? isGroup
                  ? t('typeMessagePlaceholderMention')
                  : t('typeMessagePlaceholderMentionPrivate')
                : t('typeMessagePlaceholder')
            }
            maxLength={MAX_MESSAGE_LENGTH}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2"
          />
          <Button type="submit" disabled={loading || !newMessage.trim()}>
            {t('send')}
          </Button>
        </div>
      </form>

      <Dialog open={shareProductOpen} onOpenChange={setShareProductOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('shareProduct')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('shareProductDescription')}</p>
          <input
            type="text"
            value={shareProductInput}
            onChange={(e) => setShareProductInput(e.target.value)}
            placeholder={t('shareProductPlaceholder')}
            className="w-full rounded-md border border-input bg-background px-3 py-2"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareProductOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleShareProduct} disabled={shareLoading}>
              {shareLoading ? t('sending') : t('send')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sharePostOpen} onOpenChange={setSharePostOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('sharePost')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('sharePostDescription')}</p>
          <input
            type="text"
            value={sharePostInput}
            onChange={(e) => setSharePostInput(e.target.value)}
            placeholder={t('sharePostPlaceholder')}
            className="w-full rounded-md border border-input bg-background px-3 py-2"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSharePostOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSharePost} disabled={shareLoading}>
              {shareLoading ? t('sending') : t('send')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
