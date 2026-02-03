'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, Edit2, Reply, ChevronDown, ChevronUp, Flag, Image as ImageIcon, X } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useImageUpload } from '@/lib/hooks/useImageUpload'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmojiPicker } from '@/components/ui/EmojiPicker'
import { ReportDialog } from '@/components/social/ReportDialog'
import { handleError } from '@/lib/utils/handleError'
import { showInfo, showSuccess, showWarning } from '@/lib/utils/toast'
import { useTranslations, useLocale } from 'next-intl'
import { sanitizeContent } from '@/lib/utils/sanitize-content'
import { getDisplayContent } from '@/lib/ai/display-translated'

interface ProductComment {
  id: string
  content: string
  content_lang?: 'zh' | 'en' | null
  content_translated?: string | null
  user_id: string
  parent_id: string | null
  image_urls?: string[]
  created_at: string
  user?: {
    username: string
    display_name: string
    avatar_url: string | null
  }
}

interface ProductCommentSectionProps {
  productId: string
}

export function ProductCommentSection({ productId }: ProductCommentSectionProps) {
  const t = useTranslations('products')
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()

  const [newComment, setNewComment] = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [commentToDelete, setCommentToDelete] = useState<string | null>(null)
  const [lastSubmitTime, setLastSubmitTime] = useState(0)
  const RATE_LIMIT_MS = 2000
  const locale = useLocale()
  const tCommon = useTranslations('common')

  const { data: userProfile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!user,
  })

  // Image upload for new comment
  const newCommentImageUpload = useImageUpload({
    bucket: 'post-images',
    folder: 'product-comments',
    maxImages: 5,
    onUploadComplete: () => {},
  })

  // Image upload for reply
  const replyImageUpload = useImageUpload({
    bucket: 'post-images',
    folder: 'product-comments',
    maxImages: 5,
    onUploadComplete: () => {},
  })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const replyFileInputRef = useRef<HTMLInputElement>(null)
  const commentInputRef = useRef<HTMLInputElement>(null)
  const replyInputRef = useRef<HTMLInputElement>(null)

  const insertEmojiAtCursor = (input: HTMLInputElement | HTMLTextAreaElement, emoji: string) => {
    const start = input.selectionStart || 0
    const end = input.selectionEnd || 0
    const text = input.value
    const newText = text.substring(0, start) + emoji + text.substring(end)
    input.value = newText
    input.focus()
    input.setSelectionRange(start + emoji.length, start + emoji.length)

    const event = new Event('input', { bubbles: true })
    input.dispatchEvent(event)
  }

  const handleNewCommentEmoji = (emoji: string) => {
    if (commentInputRef.current) {
      insertEmojiAtCursor(commentInputRef.current, emoji)
      setNewComment(commentInputRef.current.value)
    }
  }

  const handleReplyEmoji = (emoji: string) => {
    if (replyInputRef.current) {
      insertEmojiAtCursor(replyInputRef.current, emoji)
      setReplyContent(replyInputRef.current.value)
    }
  }

  const handleEditEmoji = (commentId: string, emoji: string) => {
    if (editingCommentId !== commentId) return
    setEditingContent((prev) => `${prev}${emoji}`)
  }

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['productComments', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_comments')
        .select(
          `
          *,
          user:profiles!product_comments_user_id_fkey(username, display_name, avatar_url)
        `
        )
        .eq('product_id', productId)
        .order('created_at', { ascending: true })

      if (error) throw error
      return (data || []) as ProductComment[]
    },
    enabled: !!productId,
  })

  // Subscribe to real-time updates
  useEffect(() => {
    if (!productId) return
    const channel = supabase
      .channel(`product_comments:${productId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'product_comments',
          filter: `product_id=eq.${productId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['productComments', productId] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [productId, supabase, queryClient])

  const checkRateLimit = useCallback(() => {
    const now = Date.now()
    if (now - lastSubmitTime < RATE_LIMIT_MS) {
      showWarning(t('rateLimitComment'))
      return false
    }
    setLastSubmitTime(now)
    return true
  }, [lastSubmitTime, t])

  const addCommentMutation = useMutation({
    mutationFn: async ({
      content,
      parentId,
      imageUrls,
    }: {
      content: string
      parentId?: string | null
      imageUrls?: string[]
    }) => {
      if (!user) throw new Error('Not authenticated')

      const trimmedContent = content.trim()
      if (!trimmedContent && (!imageUrls || imageUrls.length === 0)) {
        throw new Error(t('commentEmptyError') || 'Comment cannot be empty')
      }
      if (trimmedContent.length > 500) {
        throw new Error(t('commentTooLongError') || 'Comment too long')
      }

      const sanitizedContent = sanitizeContent(trimmedContent) || ''

      let uploadedImageUrls: string[] = []
      if (parentId) {
        if (replyImageUpload.images.length > 0) {
          uploadedImageUrls = await replyImageUpload.uploadImages()
        } else {
          uploadedImageUrls = replyImageUpload.existingImages
        }
      } else {
        if (newCommentImageUpload.images.length > 0) {
          uploadedImageUrls = await newCommentImageUpload.uploadImages()
        } else {
          uploadedImageUrls = newCommentImageUpload.existingImages
        }
      }

      const isAdminOrSupport =
        userProfile?.role === 'admin' || userProfile?.role === 'support'
      const commentStatus = isAdminOrSupport ? 'approved' : 'pending'

      const { data, error } = await supabase
        .from('product_comments')
        .insert({
          product_id: productId,
          user_id: user.id,
          content: sanitizedContent,
          parent_id: parentId || null,
          image_urls: uploadedImageUrls,
          status: commentStatus,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      setNewComment('')
      setReplyContent('')
      setReplyingToId(null)
      newCommentImageUpload.clearImages()
      replyImageUpload.clearImages()
      queryClient.invalidateQueries({ queryKey: ['productComments', productId] })
      showSuccess(variables.parentId ? (t('replySuccess') || 'Reply sent') : (t('commentSuccess') || 'Comment sent'))
    },
    onError: (err: any) => {
      const errorMessage = String(err?.message || '')
      if (errorMessage.includes('Rate limit exceeded')) {
        showWarning(t('rateLimitComment'))
      } else if (errorMessage.includes(t('commentEmptyError')) || errorMessage.includes(t('commentTooLongError'))) {
        showWarning(errorMessage)
      } else {
        handleError(err, t('operationFailed'))
      }
    },
  })

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase.from('product_comments').delete().eq('id', commentId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productComments', productId] })
      showSuccess(t('commentDeleted') || 'Deleted')
    },
    onError: (err: any) => {
      handleError(err, t('deleteCommentFailed'))
    },
  })

  const updateCommentMutation = useMutation({
    mutationFn: async ({ commentId, content }: { commentId: string; content: string }) => {
      const trimmedContent = content.trim()
      if (trimmedContent.length > 500) {
        throw new Error(t('commentTooLongError') || 'Comment too long')
      }
      const sanitizedContent = sanitizeContent(trimmedContent) || ''

      const { data, error } = await supabase
        .from('product_comments')
        .update({
          content: sanitizedContent,
        })
        .eq('id', commentId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      setEditingCommentId(null)
      setEditingContent('')
      queryClient.invalidateQueries({ queryKey: ['productComments', productId] })
      showSuccess(t('commentUpdated') || 'Updated')
    },
    onError: (err: any) => {
      const errorMessage = String(err?.message || '')
      if (errorMessage.includes(t('commentEmptyError')) || errorMessage.includes(t('commentTooLongError'))) {
        showWarning(errorMessage)
      } else {
        handleError(err, t('updateFailedRetry'))
      }
    },
  })

  const getReplies = (parentId: string) => comments.filter((c) => c.parent_id === parentId)

  const getParentCommentUser = (parentId: string | null) => {
    if (!parentId) return null
    const parent = comments.find((c) => c.id === parentId)
    if (!parent) return null
    return { display_name: parent.user?.display_name, username: parent.user?.username, user_id: parent.user_id }
  }

  const handleEdit = (comment: ProductComment) => {
    setEditingCommentId(comment.id)
    setEditingContent(comment.content)
    setReplyingToId(null)
  }

  const handleDelete = (id: string) => {
    setCommentToDelete(id)
    setShowDeleteDialog(true)
  }

  const confirmDelete = () => {
    if (commentToDelete) {
      deleteCommentMutation.mutate(commentToDelete)
      setShowDeleteDialog(false)
      setCommentToDelete(null)
    }
  }

  const handleReport = (id: string) => {
    if (!user) {
      showInfo(t('loginToReport') || 'Please login to report')
      return
    }
    setSelectedCommentId(id)
    setShowReportDialog(true)
  }

  const handleReply = (id: string) => {
    if (!user) {
      showInfo(t('loginToComment') || 'Please login to comment')
      return
    }
    setReplyingToId((prev) => (prev === id ? null : id))
    setReplyContent('')
    replyImageUpload.clearImages()
  }

  const handleSaveEdit = (commentId: string) => {
    updateCommentMutation.mutate({ commentId, content: editingContent })
  }

  const handleCancelEdit = () => {
    setEditingCommentId(null)
    setEditingContent('')
  }


  const topLevelComments = comments.filter((c) => !c.parent_id)

  const handleSubmitNew = (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      showInfo(t('loginToComment') || 'Please login to comment')
      return
    }
    if (!checkRateLimit()) return
    addCommentMutation.mutate({ content: newComment, parentId: null })
  }

  const handleReplySubmit = (e: React.FormEvent, parentId: string) => {
    e.preventDefault()
    if (!checkRateLimit()) return
    addCommentMutation.mutate({ content: replyContent, parentId })
  }

  return (
    <div className="mt-8 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t('discussionTitle') || 'Discussion'}</h3>
        <p className="text-sm text-muted-foreground">
          {comments.length} {t('commentCount') || 'comments'}
        </p>
      </div>

      <Card className="p-4">
        <form onSubmit={handleSubmitNew} className="flex gap-2 min-w-0">
          <div className="flex-1 min-w-0">
            <input
              ref={commentInputRef}
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={t('discussionPlaceholder') || 'Ask or share your thoughts…'}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-w-0"
              disabled={!user}
              maxLength={500}
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">{newComment.length}/500</p>
          </div>
          <EmojiPicker onEmojiSelect={handleNewCommentEmoji} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={!user || newCommentImageUpload.totalImageCount >= 5}
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={newCommentImageUpload.handleImageSelect}
            className="hidden"
            disabled={!user || newCommentImageUpload.totalImageCount >= 5}
          />
          <Button
            type="submit"
            size="sm"
            disabled={
              !user ||
              addCommentMutation.isPending ||
              (!newComment.trim() && newCommentImageUpload.totalImageCount === 0)
            }
          >
            {t('send') || 'Send'}
          </Button>
        </form>

        {newCommentImageUpload.totalImageCount > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {newCommentImageUpload.imagePreviews.map((src, idx) => (
              <div key={idx} className="relative">
                <img src={src} alt="preview" className="h-16 w-16 rounded object-cover" />
                <button
                  type="button"
                  className="absolute -top-2 -right-2 rounded-full bg-background border p-1"
                  onClick={() => newCommentImageUpload.removeImage(idx)}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {isLoading ? (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('loading') || 'Loading…'}</p>
        </Card>
      ) : topLevelComments.length === 0 ? (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('noDiscussion') || 'No discussion yet.'}</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {topLevelComments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              user={user}
              locale={locale ?? 'en'}
              t={t}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onReport={handleReport}
              onReply={handleReply}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={handleCancelEdit}
              editingCommentId={editingCommentId}
              editingContent={editingContent}
              setEditingContent={setEditingContent}
              replyingToId={replyingToId}
              replyContent={replyContent}
              setReplyContent={setReplyContent}
              onReplySubmit={handleReplySubmit}
              getReplies={getReplies}
              getParentCommentUser={getParentCommentUser}
              comments={comments}
              productId={productId}
              tCommon={tCommon}
              newCommentImageUpload={newCommentImageUpload}
              replyImageUpload={replyImageUpload}
              replyFileInputRef={replyFileInputRef}
              replyInputRef={replyInputRef}
              onEditEmoji={handleEditEmoji}
              onReplyEmoji={handleReplyEmoji}
            />
          ))}
        </div>
      )}

      <ReportDialog
        open={showReportDialog}
        onClose={() => {
          setShowReportDialog(false)
          setSelectedCommentId(null)
        }}
        reportedType="product_comment"
        reportedId={selectedCommentId || ''}
      />

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmDeleteComment')}</DialogTitle>
            <DialogDescription>{t('confirmDeleteComment')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false)
                setCommentToDelete(null)
              }}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteCommentMutation.isPending}
            >
              {deleteCommentMutation.isPending ? tCommon('loading') : tCommon('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface CommentItemProps {
  comment: ProductComment
  user: any
  locale: string
  t: (key: string) => string
  tCommon: (key: string) => string
  onEdit: (comment: ProductComment) => void
  onDelete: (id: string) => void
  onReport: (id: string) => void
  onReply: (id: string) => void
  onSaveEdit: (id: string) => void | Promise<void>
  onCancelEdit: () => void
  editingCommentId: string | null
  editingContent: string
  setEditingContent: (content: string) => void
  replyingToId: string | null
  replyContent: string
  setReplyContent: (content: string) => void
  onReplySubmit: (e: React.FormEvent, parentId: string) => void
  getReplies: (parentId: string) => ProductComment[]
  getParentCommentUser: (parentId: string | null) => { display_name?: string; username?: string; user_id?: string } | null
  comments: ProductComment[]
  productId: string
  depth?: number
  newCommentImageUpload?: ReturnType<typeof useImageUpload>
  replyImageUpload?: ReturnType<typeof useImageUpload>
  replyFileInputRef?: React.RefObject<HTMLInputElement>
  replyInputRef?: React.RefObject<HTMLInputElement>
  onEditEmoji?: (commentId: string, emoji: string) => void
  onReplyEmoji?: (emoji: string) => void
}

function CommentItem({
  comment,
  user,
  locale,
  t,
  tCommon,
  onEdit,
  onDelete,
  onReport,
  onReply,
  onSaveEdit,
  onCancelEdit,
  editingCommentId,
  editingContent,
  setEditingContent,
  replyingToId,
  replyContent,
  setReplyContent,
  onReplySubmit,
  getReplies,
  getParentCommentUser,
  depth = 0,
  replyImageUpload,
  replyFileInputRef,
  replyInputRef,
  onEditEmoji,
  onReplyEmoji,
}: CommentItemProps) {
  const isEditing = editingCommentId === comment.id
  const isReplying = replyingToId === comment.id
  const isOwner = user?.id === comment.user_id
  const isReply = depth === 1

  const replies = depth === 0 ? getReplies(comment.id) : []
  const [isExpanded, setIsExpanded] = useState(false)
  const displayedReplies = replies.length > 3 && !isExpanded ? replies.slice(0, 3) : replies
  const parentCommentUser = getParentCommentUser(comment.parent_id)

  return (
    <Card className="p-3 border-0 shadow-none min-w-0">
      <div className="flex items-start gap-3 min-w-0">
        <Link href={`/profile/${comment.user_id}`}>
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
            {comment.user?.avatar_url ? (
              <img
                src={comment.user.avatar_url}
                alt={comment.user.display_name}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <span className="text-xs">{comment.user?.display_name?.[0] || '?'}</span>
            )}
          </div>
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <Link href={`/profile/${comment.user_id}`} className="text-sm font-medium truncate">
                {comment.user?.display_name || comment.user?.username || tCommon('user')}
              </Link>
              {parentCommentUser && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {t('reply')} @{parentCommentUser.display_name || parentCommentUser.username || tCommon('user')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              {!isReply && (
                <Button variant="ghost" size="sm" onClick={() => onReply(comment.id)} className="h-8 px-2">
                  <Reply className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => onReport(comment.id)} className="h-8 px-2">
                <Flag className="h-4 w-4" />
              </Button>
              {isOwner && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => onEdit(comment)} className="h-8 px-2">
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onDelete(comment.id)} className="h-8 px-2">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {!isEditing ? (
            <>
              <p className="mt-1 text-sm whitespace-pre-wrap break-words">
                {getDisplayContent(
                  locale,
                  comment.content_lang ?? null,
                  comment.content,
                  comment.content_translated
                )}
              </p>
              {(comment.image_urls?.length || 0) > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {comment.image_urls?.map((src, idx) => (
                    <img key={idx} src={src} alt="comment" className="h-24 w-24 rounded object-cover" />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="mt-2 space-y-2">
              <textarea
                value={editingContent}
                onChange={(e) => setEditingContent(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground text-right">{editingContent.length}/500</p>
              <div className="flex items-center gap-2">
                <EmojiPicker onEmojiSelect={(emoji) => onEditEmoji?.(comment.id, emoji)} />
                <Button type="button" size="sm" onClick={() => onSaveEdit(comment.id)}>
                  {tCommon('save')}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={onCancelEdit}>
                  {tCommon('cancel')}
                </Button>
              </div>
            </div>
          )}

          {isReplying && user && (
            <div className="mt-3 space-y-2">
              <form onSubmit={(e) => onReplySubmit(e, comment.id)} className="flex gap-2 min-w-0">
                <input
                  ref={replyInputRef}
                  type="text"
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder={t('replyPlaceholder') || 'Write a reply...'}
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm min-w-0"
                  maxLength={500}
                />
                <EmojiPicker onEmojiSelect={(emoji) => onReplyEmoji?.(emoji)} />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => replyFileInputRef?.current?.click()}
                  disabled={replyImageUpload && replyImageUpload.totalImageCount >= 5}
                >
                  <ImageIcon className="h-4 w-4" />
                </Button>
                {replyFileInputRef && (
                  <input
                    ref={replyFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={replyImageUpload?.handleImageSelect}
                    className="hidden"
                    disabled={replyImageUpload && replyImageUpload.totalImageCount >= 5}
                  />
                )}
                <Button
                  type="submit"
                  size="sm"
                  disabled={!replyContent.trim() && (!replyImageUpload || replyImageUpload.totalImageCount === 0)}
                >
                  {t('send') || 'Send'}
                </Button>
              </form>
            </div>
          )}

          {displayedReplies.length > 0 && (
            <div className="mt-3 space-y-2 border-l pl-3">
              {displayedReplies.map((r) => (
                <CommentItem
                  key={r.id}
                  comment={r}
                  user={user}
                  locale={locale}
                  t={t}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onReport={onReport}
                  onReply={onReply}
                  onSaveEdit={onSaveEdit}
                  onCancelEdit={onCancelEdit}
                  editingCommentId={editingCommentId}
                  editingContent={editingContent}
                  setEditingContent={setEditingContent}
                  replyingToId={replyingToId}
                  replyContent={replyContent}
                  setReplyContent={setReplyContent}
                  onReplySubmit={onReplySubmit}
                  getReplies={getReplies}
                  getParentCommentUser={getParentCommentUser}
                  comments={[]}
                  productId=""
                  depth={1}
                  tCommon={tCommon}
                  replyImageUpload={replyImageUpload}
                  replyFileInputRef={replyFileInputRef}
                  replyInputRef={replyInputRef}
                  onEditEmoji={onEditEmoji}
                  onReplyEmoji={onReplyEmoji}
                />
              ))}

              {replies.length > 3 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2"
                  onClick={() => setIsExpanded((v) => !v)}
                >
                  {isExpanded ? (
                    <>
                      {t('collapseReplies')} <ChevronUp className="h-4 w-4" />
                    </>
                  ) : (
                    <>
                      {t('expandReplies')} <ChevronDown className="h-4 w-4" />
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

