'use client'

import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useQuery, useInfiniteQuery, useMutation, useQueryClient, InfiniteData } from '@tanstack/react-query'
import Link from 'next/link'
import { Link as I18nLink } from '@/i18n/navigation'
import { Trash2, Edit2, Reply, ChevronDown, ChevronUp, Flag, Image as ImageIcon, X } from 'lucide-react'
import { ReportDialog } from './ReportDialog'
import { showInfo, showError, showSuccess, showWarning } from '@/lib/utils/toast'
import { handleError } from '@/lib/utils/handleError'
import { CommentLikeButton } from './CommentLikeButton'
import { useImageUpload } from '@/lib/hooks/useImageUpload'
import { EmojiPicker } from '@/components/ui/EmojiPicker'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
// ✅ 修复 P0-3: 添加 XSS 防护
// 简单的 HTML 转义函数（作为 DOMPurify 的后备）
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (m) => map[m])
}

// 动态加载 DOMPurify（如果可用）
let DOMPurifyPromise: Promise<any> | null = null

async function loadDOMPurify(): Promise<any> {
  if (typeof window === 'undefined') return null
  
  if (!DOMPurifyPromise) {
    DOMPurifyPromise = import('dompurify')
      .then((mod) => mod.default)
      .catch(() => null)
  }
  
  return DOMPurifyPromise
}

// Sanitize 函数：优先使用 DOMPurify，否则使用简单转义
function sanitizeContent(content: string): string {
  if (typeof window === 'undefined') return escapeHtml(content)
  
  // 同步情况下使用简单转义（DOMPurify 是异步加载的）
  // 如果需要 DOMPurify，应该使用异步版本
  return escapeHtml(content)
}

// 异步版本的 sanitize（使用 DOMPurify）
async function sanitizeContentAsync(content: string): Promise<string> {
  if (typeof window === 'undefined') return escapeHtml(content)
  
  const DOMPurify = await loadDOMPurify()
  if (DOMPurify) {
    return DOMPurify.sanitize(content, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
  }
  return escapeHtml(content)
}

interface Comment {
  id: string
  content: string
  user_id: string
  parent_id: string | null
  like_count?: number
  image_urls?: string[]
  created_at: string
  user?: {
    username: string
    display_name: string
    avatar_url: string | null
  }
}

interface CommentSectionProps {
  postId: string
}

const COMMENTS_PER_PAGE = 20 // ✅ 修复 P0-1: 分页大小

export function CommentSection({ postId }: CommentSectionProps) {
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()
  const t = useTranslations('posts')
  const tCommon = useTranslations('common')
  const tMessages = useTranslations('messages')
  const [newComment, setNewComment] = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [commentToDelete, setCommentToDelete] = useState<string | null>(null)
  
  // ✅ 修复 P0-4: Rate limit 防抖（2秒内只能提交一次）
  const [lastSubmitTime, setLastSubmitTime] = useState(0)
  const RATE_LIMIT_MS = 2000
  
  // ✅ 修复 P0-2 & P1-1: 检查帖子状态和用户状态
  const { data: post } = useQuery({
    queryKey: ['post', postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('id, status, user_id')
        .eq('id', postId)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!postId,
  })
  
  const { data: userProfile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data, error } = await supabase
        .from('profiles')
        .select('status, role')
        .eq('id', user.id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!user,
  })
  
  // ✅ 修复 P0-2: 检查是否被拉黑
  const { data: isBlocked } = useQuery({
    queryKey: ['isBlockedByPostAuthor', user?.id, post?.user_id],
    queryFn: async () => {
      if (!user || !post?.user_id || user.id === post.user_id) return false
      const { data } = await supabase
        .from('blocked_users')
        .select('id')
        .eq('blocker_id', post.user_id)
        .eq('blocked_id', user.id)
        .limit(1)
        .maybeSingle()
      return !!data
    },
    enabled: !!user && !!post?.user_id && user.id !== post.user_id,
  })
  
  // ✅ 修复 P0-2: 检查帖子是否允许评论
  const canComment = post?.status === 'approved' && !isBlocked && userProfile?.status === 'active'
  
  // Image upload for new comment
  const newCommentImageUpload = useImageUpload({
    bucket: 'post-images',
    folder: 'comments',
    maxImages: 5,
    onUploadComplete: () => {},
  })
  
  // Image upload for reply
  const replyImageUpload = useImageUpload({
    bucket: 'post-images',
    folder: 'comments',
    maxImages: 5,
    onUploadComplete: () => {},
  })
  
  // Image upload for editing - use state to manage per comment
  const [editingImageFiles, setEditingImageFiles] = useState<Record<string, File[]>>({})
  const [editingImagePreviews, setEditingImagePreviews] = useState<Record<string, string[]>>({})
  const [editingExistingImages, setEditingExistingImages] = useState<Record<string, string[]>>({})
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replyFileInputRef = useRef<HTMLInputElement>(null)
  const commentInputRef = useRef<HTMLInputElement>(null)
  const replyInputRef = useRef<HTMLInputElement>(null)
  const editingTextareaRefs = useRef<Record<string, HTMLTextAreaElement>>({})
  
  const insertEmojiAtCursor = (input: HTMLInputElement | HTMLTextAreaElement, emoji: string) => {
    const start = input.selectionStart || 0
    const end = input.selectionEnd || 0
    const text = input.value
    const newText = text.substring(0, start) + emoji + text.substring(end)
    input.value = newText
    input.focus()
    input.setSelectionRange(start + emoji.length, start + emoji.length)
    
    // Trigger onChange event
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
    const textarea = editingTextareaRefs.current[commentId]
    if (textarea) {
      insertEmojiAtCursor(textarea, emoji)
      setEditingContent(textarea.value)
    }
  }

  // ✅ 修复 P0-1: 使用分页查询评论
  const {
    data: commentsData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['comments', postId],
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * COMMENTS_PER_PAGE
      const to = from + COMMENTS_PER_PAGE - 1
      
      const { data, error } = await supabase
        .from('comments')
        .select(`
          *,
          like_count,
          user:profiles!comments_user_id_fkey(username, display_name, avatar_url)
        `)
        .eq('post_id', postId)
        .eq('status', 'approved')
        .order('created_at', { ascending: true })
        .range(from, to)

      if (error) throw error
      return (data || []) as Comment[]
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === COMMENTS_PER_PAGE ? allPages.length : undefined
    },
    initialPageParam: 0,
  })
  
  // 扁平化所有页面的评论
  const comments = commentsData?.pages.flatMap((page) => page) || []

  // Subscribe to real-time updates
  useEffect(() => {
    const channel = supabase
      .channel(`comments:${postId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments',
          filter: `post_id=eq.${postId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['comments', postId] })
          queryClient.invalidateQueries({ queryKey: ['post', postId] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [postId, supabase, queryClient])
  
  // Add comment mutation with optimistic update
  const addCommentMutation = useMutation({
    mutationFn: async ({ content, parentId, imageUrls }: { content: string; parentId?: string | null; imageUrls?: string[] }) => {
      if (!user) throw new Error('Not authenticated')
      
      // ✅ 修复 P0-2: 检查帖子状态
      if (!post || post.status !== 'approved') {
        throw new Error(t('postNotFoundOrCannotComment'))
      }
      
      // ✅ 修复 P1-1: 检查用户是否被禁言
      if (userProfile?.status !== 'active') {
        throw new Error(t('accountBannedCannotComment'))
      }
      
      // ✅ 修复 P0-2: 检查是否被拉黑
      if (isBlocked) {
        throw new Error(t('blockedByUserCannotComment'))
      }
      
      // Input validation
      const trimmedContent = content.trim()
      if (!trimmedContent && (!imageUrls || imageUrls.length === 0)) {
        throw new Error(t('commentEmptyError'))
      }
      if (trimmedContent.length > 500) {
        throw new Error(t('commentTooLongError'))
      }
      
      // ✅ 修复 P0-3: Sanitize 内容（防止 XSS）
      const sanitizedContent = sanitizeContent(trimmedContent)

      // Upload images if any
      let uploadedImageUrls: string[] = []
      if (parentId) {
        // Reply comment - use reply image upload
        if (replyImageUpload.images.length > 0) {
          uploadedImageUrls = await replyImageUpload.uploadImages()
        } else {
          uploadedImageUrls = replyImageUpload.existingImages
        }
      } else {
        // New comment - use new comment image upload
        if (newCommentImageUpload.images.length > 0) {
          uploadedImageUrls = await newCommentImageUpload.uploadImages()
        } else {
          uploadedImageUrls = newCommentImageUpload.existingImages
        }
      }

      // ✅ 修复 P0-10: 新评论默认 pending（除非是管理员）
      const commentStatus = userProfile?.role === 'admin' || userProfile?.role === 'support' ? 'approved' : 'pending'
      
      const { data, error } = await supabase
        .from('comments')
        .insert({
          post_id: postId,
          user_id: user.id,
          content: sanitizedContent || '',
          parent_id: parentId || null,
          image_urls: uploadedImageUrls,
          status: commentStatus, // ✅ 修复 P0-10: 默认 pending，等待审核
        })
        .select(`
          *,
          user:profiles!comments_user_id_fkey(username, display_name, avatar_url)
        `)
        .single()

      if (error) throw error
      return data
    },
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['comments', postId] })
      
      // Snapshot previous value (InfiniteData structure)
      const previousComments = queryClient.getQueryData<InfiniteData<Comment[]>>(['comments', postId])
      
      // Optimistically add new comment
      const optimisticComment: Comment = {
        id: `temp-${Date.now()}`,
        content: variables.content.trim(),
        user_id: user!.id,
        parent_id: variables.parentId || null,
        like_count: 0,
        image_urls: variables.imageUrls || [],
        created_at: new Date().toISOString(),
        user: {
          username: user!.email?.split('@')[0] || '',
          display_name: user!.email?.split('@')[0] || '',
          avatar_url: null,
        },
      }
      
      // Update InfiniteData structure correctly
      queryClient.setQueryData<InfiniteData<Comment[]>>(['comments', postId], (old) => {
        if (!old) {
          // If no data exists, create initial structure
          return {
            pages: [[optimisticComment]],
            pageParams: [0],
          }
        }
        
        // Add optimistic comment to the first page
        const newPages = [...old.pages]
        if (newPages.length > 0) {
          newPages[0] = [...newPages[0], optimisticComment]
        } else {
          newPages[0] = [optimisticComment]
        }
        
        return {
          ...old,
          pages: newPages,
        }
      })
      
      // Optimistically update post comment count
      queryClient.setQueryData(['post', postId], (old: any) => {
        if (old) {
          return { ...old, comment_count: (old.comment_count || 0) + 1 }
        }
        return old
      })
      
      return { previousComments }
    },
    onSuccess: (_data, variables) => {
      setNewComment('')
      setReplyContent('')
      setReplyingToId(null)
      newCommentImageUpload.clearImages()
      replyImageUpload.clearImages()
      queryClient.invalidateQueries({ queryKey: ['comments', postId] })
      queryClient.invalidateQueries({ queryKey: ['post', postId] })
      // Show success feedback
      showSuccess(variables.parentId ? t('replySuccess') : t('commentSuccess'))
    },
    onError: (err: any, variables, context) => {
      // Rollback optimistic update on error
      if (context?.previousComments !== undefined) {
        queryClient.setQueryData<InfiniteData<Comment[]>>(['comments', postId], context.previousComments)
      }
      
      // Rollback post comment count
      queryClient.setQueryData(['post', postId], (old: any) => {
        if (old) {
          return { ...old, comment_count: Math.max(0, (old.comment_count || 0) - 1) }
        }
        return old
      })
      
      // Handle error display
      const errorMessage = String(err?.message || err?.details || '')
      const errorCode = String(err?.code || '')
      
      // Check for specific error types
      if (errorMessage.includes('Rate limit exceeded') || errorCode.includes('429')) {
        showWarning(t('rateLimitComment'))
      } else if (errorMessage.includes(t('commentEmptyError')) || errorMessage.includes(t('commentTooLongError'))) {
        showWarning(errorMessage)
      } else if (errorMessage.includes('permission') || errorMessage.includes('forbidden') || errorCode.includes('42501')) {
        showWarning(t('noPermissionToOperate'))
      } else if (errorMessage.includes('auth') || errorMessage.includes('unauthorized') || errorCode.includes('401')) {
        showWarning(t('pleaseLoginFirst'))
      } else if (errorCode.includes('23505')) {
        showWarning(t('commentAlreadyExists'))
      } else if (errorCode.includes('PGRST')) {
        // Supabase PostgREST errors
        const userMessage = errorMessage || t('operationFailedRetry')
        handleError(err, userMessage)
      } else {
        // Use a more descriptive error message
        const userMessage = errorMessage || t('commentFailed')
        handleError(err, userMessage)
      }
    },
  })

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', postId] })
      queryClient.invalidateQueries({ queryKey: ['post', postId] })
      showSuccess(t('commentDeleted'))
    },
    onError: (err: any) => {
      handleError(err, t('deleteCommentFailed'))
    },
  })

  // Update comment mutation
  const updateCommentMutation = useMutation({
    mutationFn: async ({ commentId, content }: { commentId: string; content: string }) => {
      if (!user) throw new Error('Not authenticated')
      
      // Input validation
      const trimmedContent = content.trim()
      const existingImages = editingExistingImages[commentId] || []
      const newImageFiles = editingImageFiles[commentId] || []
      
      if (!trimmedContent && existingImages.length === 0 && newImageFiles.length === 0) {
        throw new Error(t('commentEmptyError'))
      }
      if (trimmedContent.length > 500) {
        throw new Error(t('commentTooLongError'))
      }

      // Upload new images if any
      let uploadedImageUrls: string[] = [...existingImages]
      
      if (newImageFiles.length > 0) {
        // ✅ 修复 P1-6: 验证图片大小和类型
        const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
        const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
        
        for (const image of newImageFiles) {
          // 验证文件类型
          if (!ALLOWED_TYPES.includes(image.type)) {
            throw new Error(t('invalidImageFormat', { filename: image.name }))
          }
          
          // 验证文件大小
          if (image.size > MAX_FILE_SIZE) {
            throw new Error(t('imageTooLarge', { filename: image.name }))
          }
          
          const fileExt = image.name.split('.').pop()
          const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
          const filePath = `comments/${fileName}`

          const { error: uploadError } = await supabase.storage
            .from('post-images')
            .upload(filePath, image, {
              cacheControl: '3600',
              upsert: false,
            })

          if (uploadError) {
            throw uploadError
          }

          const { data } = supabase.storage.from('post-images').getPublicUrl(filePath)
          uploadedImageUrls.push(data.publicUrl)
        }
      }

      const { error } = await supabase
        .from('comments')
        .update({ 
          content: trimmedContent || '',
          image_urls: uploadedImageUrls,
        })
        .eq('id', commentId)

      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      setEditingCommentId(null)
      setEditingContent('')
      // Clear editing image state for this comment
      setEditingImageFiles((prev) => {
        const newState = { ...prev }
        delete newState[variables.commentId]
        return newState
      })
      setEditingImagePreviews((prev) => {
        const newState = { ...prev }
        // Cleanup object URLs
        if (newState[variables.commentId]) {
          newState[variables.commentId].forEach((url) => URL.revokeObjectURL(url))
        }
        delete newState[variables.commentId]
        return newState
      })
      setEditingExistingImages((prev) => {
        const newState = { ...prev }
        delete newState[variables.commentId]
        return newState
      })
      queryClient.invalidateQueries({ queryKey: ['comments', postId] })
      showSuccess(t('commentUpdated'))
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

  // ✅ 修复 P0-4: Rate limit 检查
  const checkRateLimit = useCallback(() => {
    const now = Date.now()
    if (now - lastSubmitTime < RATE_LIMIT_MS) {
      const seconds = Math.ceil((RATE_LIMIT_MS - (now - lastSubmitTime)) / 1000)
      showWarning(t('rateLimitExceeded', { seconds }))
      return false
    }
    setLastSubmitTime(now)
    return true
  }, [lastSubmitTime, t])
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (!canComment) {
      if (isBlocked) {
        showWarning(t('blockedByUserCannotComment'))
      } else if (userProfile?.status !== 'active') {
        showWarning(t('accountBannedCannotComment'))
      } else {
        showWarning(t('postNotFoundOrCannotComment'))
      }
      return
    }
    if (!newComment.trim() && newCommentImageUpload.totalImageCount === 0) return
    if (!checkRateLimit()) return
    addCommentMutation.mutate({ 
      content: newComment.trim(),
      imageUrls: newCommentImageUpload.existingImages,
    })
  }

  const handleReplySubmit = async (e: React.FormEvent, parentId: string) => {
    e.preventDefault()
    if (!user) return
    if (!canComment) {
      if (isBlocked) {
        showWarning(t('blockedByUserCannotComment'))
      } else if (userProfile?.status !== 'active') {
        showWarning(t('accountBannedCannotComment'))
      } else {
        showWarning(t('postNotFoundOrCannotComment'))
      }
      return
    }
    if (!replyContent.trim() && replyImageUpload.totalImageCount === 0) return
    if (!checkRateLimit()) return
    addCommentMutation.mutate({ 
      content: replyContent.trim(), 
      parentId,
      imageUrls: replyImageUpload.existingImages,
    })
  }

  const handleEdit = (comment: Comment) => {
    setEditingCommentId(comment.id)
    setEditingContent(comment.content)
    // Initialize image state for this comment
    setEditingExistingImages((prev) => ({
      ...prev,
      [comment.id]: comment.image_urls || [],
    }))
    setEditingImageFiles((prev) => ({
      ...prev,
      [comment.id]: [],
    }))
    setEditingImagePreviews((prev) => ({
      ...prev,
      [comment.id]: [],
    }))
  }
  
  const handleEditImageSelect = (commentId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const existing = editingExistingImages[commentId] || []
    const current = editingImageFiles[commentId] || []
    
    if (existing.length + current.length + files.length > 5) {
      showWarning(t('maxImagesReached'))
      return
    }
    
    // ✅ 修复 P1-6: 验证图片大小和类型
    const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
    const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    
    const validFiles: File[] = []
    const validPreviews: string[] = []
    
    for (const file of files) {
      // 检查文件类型
      if (!ALLOWED_TYPES.includes(file.type)) {
        showWarning(t('invalidImageFormat', { filename: file.name }))
        continue
      }
      
      // 检查文件大小
      if (file.size > MAX_FILE_SIZE) {
        showWarning(t('imageTooLarge', { filename: file.name }))
        continue
      }
      
      validFiles.push(file)
      validPreviews.push(URL.createObjectURL(file))
    }
    
    if (validFiles.length > 0) {
      setEditingImageFiles((prev) => ({
        ...prev,
        [commentId]: [...current, ...validFiles],
      }))
      
      setEditingImagePreviews((prev) => ({
        ...prev,
        [commentId]: [...(prev[commentId] || []), ...validPreviews],
      }))
    }
  }
  
  const handleRemoveEditImage = (commentId: string, index: number, isExisting: boolean) => {
    if (isExisting) {
      setEditingExistingImages((prev) => ({
        ...prev,
        [commentId]: (prev[commentId] || []).filter((_, i) => i !== index),
      }))
    } else {
      const previewIndex = index - (editingExistingImages[commentId]?.length || 0)
      setEditingImageFiles((prev) => ({
        ...prev,
        [commentId]: (prev[commentId] || []).filter((_, i) => i !== previewIndex),
      }))
      setEditingImagePreviews((prev) => {
        const previews = prev[commentId] || []
        const urlToRevoke = previews[previewIndex]
        if (urlToRevoke) {
          URL.revokeObjectURL(urlToRevoke)
        }
        return {
          ...prev,
          [commentId]: previews.filter((_, i) => i !== previewIndex),
        }
      })
    }
  }

  const handleCancelEdit = () => {
    setEditingCommentId(null)
    setEditingContent('')
  }

  const handleSaveEdit = async (commentId: string) => {
    const existingImages = editingExistingImages[commentId] || []
    const newImageFiles = editingImageFiles[commentId] || []
    if (!editingContent.trim() && existingImages.length === 0 && newImageFiles.length === 0) return
    updateCommentMutation.mutate({ commentId, content: editingContent.trim() })
  }

  const handleDelete = (commentId: string) => {
    setCommentToDelete(commentId)
    setShowDeleteDialog(true)
  }

  const confirmDelete = () => {
    if (commentToDelete) {
      deleteCommentMutation.mutate(commentToDelete)
      setShowDeleteDialog(false)
      setCommentToDelete(null)
    }
  }

  const handleReport = (commentId: string) => {
    if (!user) {
      showInfo(t('pleaseLoginToReport'))
      return
    }
    setSelectedCommentId(commentId)
    setShowReportDialog(true)
  }

  // 组织评论为树形结构（根评论按时间倒序）
  const organizeComments = (comments: Comment[]): Comment[] => {
    const rootComments = comments.filter(c => !c.parent_id)
    // 按创建时间倒序排列根评论
    return rootComments.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }

  // 获取被回复评论的用户信息
  const getParentCommentUser = (parentId: string | null): { display_name?: string; username?: string; user_id?: string } | null => {
    if (!parentId) return null
    const parentComment = comments.find(c => c.id === parentId)
    return parentComment?.user ? {
      ...parentComment.user,
      user_id: parentComment.user_id
    } : null
  }

  // 获取某个评论的所有直接回复（按时间排序）
  const getReplies = (parentId: string): Comment[] => {
    return comments
      .filter(c => c.parent_id === parentId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }

  const rootComments = organizeComments(comments)

  return (
    <div className="space-y-4">
      {/* Comment Form */}
      {user && (
        <div className="space-y-2">
          {/* ✅ 修复 P1-1: 显示禁言提示 */}
          {userProfile?.status !== 'active' && (
            <div className="p-3 bg-warning/10 border border-warning/20 rounded-md text-sm text-warning-foreground">
              {userProfile?.status === 'banned' ? t('accountPermanentlyBanned') : t('accountSuspended')}
            </div>
          )}
          {/* ✅ 修复 P0-2: 显示被拉黑提示 */}
          {isBlocked && (
            <div className="p-3 bg-warning/10 border border-warning/20 rounded-md text-sm text-warning-foreground">
              {t('blockedByUserCannotComment')}
            </div>
          )}
          {/* ✅ 修复 P0-2: 显示帖子不允许评论提示 */}
          {post && post.status !== 'approved' && (
            <div className="p-3 bg-muted border border-muted-foreground/20 rounded-md text-sm text-muted-foreground">
              {t('postNotFoundOrCannotComment')}
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex gap-2 min-w-0">
            <div className="flex-1 min-w-0">
              <input
                ref={commentInputRef}
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder={t('writeComment')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-w-0"
                disabled={!canComment}
                maxLength={500}
              />
              {/* ✅ 修复 P2-1: 显示字符计数 */}
              <div className="mt-1 text-xs text-muted-foreground text-right">
                {newComment.length}/500
                {newComment.length > 450 && (
                  <span className="text-destructive ml-1">{t('approachingLimit')}</span>
                )}
              </div>
            </div>
            <EmojiPicker onEmojiSelect={handleNewCommentEmoji} />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={newCommentImageUpload.totalImageCount >= 5}
              title={newCommentImageUpload.totalImageCount >= 5 ? t('maxImagesReached') : t('uploadImagesMax5')}
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
              disabled={newCommentImageUpload.totalImageCount >= 5}
            />
            <Button
              type="submit"
              disabled={!canComment || addCommentMutation.isPending || (!newComment.trim() && newCommentImageUpload.totalImageCount === 0)}
            >
              {addCommentMutation.isPending ? t('sendingComment') : tMessages('send')}
            </Button>
          </form>
          {/* Image previews */}
          {newCommentImageUpload.allPreviews.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {newCommentImageUpload.allPreviews.map((preview, index) => (
                <div key={index} className="relative group">
                  <img
                    src={preview}
                    alt={`Preview ${index + 1}`}
                    className="h-20 w-20 rounded-md object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (index < newCommentImageUpload.existingImages.length) {
                        newCommentImageUpload.removeExistingImage(index)
                      } else {
                        newCommentImageUpload.removeImage(index - newCommentImageUpload.existingImages.length)
                      }
                    }}
                    className="absolute -top-2 -right-2 rounded-full bg-destructive text-destructive-foreground p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!user && (
        <p className="text-sm text-muted-foreground">
          {t.rich('loginToComment', {
            login: (chunks) => (
              <I18nLink 
                href={`/login?redirect=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname + window.location.search : `/post/${postId}`)}`} 
                className="text-primary hover:underline"
              >
                {chunks}
              </I18nLink>
            ),
          })}
        </p>
      )}

      {/* Comments List */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('loadingComments')}</p>
      ) : rootComments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noComments')}</p>
      ) : (
        <div className="space-y-3">
          {rootComments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              user={user}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onReport={handleReport}
              onReply={(id) => {
                if (id === '') {
                  setReplyingToId(null)
                } else {
                  setReplyingToId(id)
                }
              }}
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
              postId={postId}
              depth={0}
              newCommentImageUpload={newCommentImageUpload}
              replyImageUpload={replyImageUpload}
              editingImageFiles={editingImageFiles}
              editingImagePreviews={editingImagePreviews}
              editingExistingImages={editingExistingImages}
              onEditImageSelect={handleEditImageSelect}
              onRemoveEditImage={handleRemoveEditImage}
              replyFileInputRef={replyFileInputRef}
              replyInputRef={replyInputRef}
            />
          ))}
          {/* ✅ 修复 P0-1: 加载更多按钮 */}
          {hasNextPage && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? tCommon('loading') || t('loadingComments') : t('loadMore')}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 举报对话框 */}
      <ReportDialog
        open={showReportDialog}
        onClose={() => {
          setShowReportDialog(false)
          setSelectedCommentId(null)
        }}
        reportedType="comment"
        reportedId={selectedCommentId || ''}
      />

      {/* 删除确认对话框 */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmDeleteComment')}</DialogTitle>
            <DialogDescription>
              {t('confirmDeleteComment')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowDeleteDialog(false)
              setCommentToDelete(null)
            }}>
              {tCommon('cancel')}
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              {tCommon('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// 评论项组件（支持两级结构：顶级评论和回复评论）
interface CommentItemProps {
  comment: Comment
  user: any
  onEdit: (comment: Comment) => void
  onDelete: (id: string) => void
  onReport: (id: string) => void
  onReply: (id: string) => void
  onSaveEdit: (id: string) => void
  onCancelEdit: () => void
  editingCommentId: string | null
  editingContent: string
  setEditingContent: (content: string) => void
  replyingToId: string | null
  replyContent: string
  setReplyContent: (content: string) => void
  onReplySubmit: (e: React.FormEvent, parentId: string) => void
  getReplies: (parentId: string) => Comment[]
  getParentCommentUser: (parentId: string | null) => { display_name?: string; username?: string; user_id?: string } | null
  comments: Comment[]
  postId: string
  depth?: number
  // Image upload props
  newCommentImageUpload?: ReturnType<typeof useImageUpload>
  replyImageUpload?: ReturnType<typeof useImageUpload>
  editingImageFiles?: Record<string, File[]>
  editingImagePreviews?: Record<string, string[]>
  editingExistingImages?: Record<string, string[]>
  onEditImageSelect?: (commentId: string, e: React.ChangeEvent<HTMLInputElement>) => void
  onRemoveEditImage?: (commentId: string, index: number, isExisting: boolean) => void
  replyFileInputRef?: React.RefObject<HTMLInputElement>
  replyInputRef?: React.RefObject<HTMLInputElement>
}

function CommentItem({
  comment,
  user,
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
  comments,
  postId,
  depth = 0,
  newCommentImageUpload,
  replyImageUpload,
  editingImageFiles,
  editingImagePreviews,
  editingExistingImages,
  onEditImageSelect,
  onRemoveEditImage,
  replyFileInputRef,
  replyInputRef,
}: CommentItemProps) {
  const t = useTranslations('posts')
  const tCommon = useTranslations('common')
  const tMessages = useTranslations('messages')
  const isEditing = editingCommentId === comment.id
  const isReplying = replyingToId === comment.id
  const isOwner = user?.id === comment.user_id
  const isReply = depth === 1
  
  // 只支持两级结构：depth 0（顶级评论）可以显示回复，depth >= 1 不再显示回复
  const replies = depth === 0 ? getReplies(comment.id) : []
  
  // 折叠/展开状态（只在顶级评论中有效）
  const [isExpanded, setIsExpanded] = useState(false)
  
  // 计算显示的回复数量：当回复数 > 3 且未展开时，只显示前 3 条
  const displayedReplies = (replies.length > 3 && !isExpanded)
    ? replies.slice(0, 3)
    : replies
  
  // 获取被回复评论的用户信息
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
              <span className="text-xs">
                {comment.user?.display_name?.[0] || '?'}
              </span>
            )}
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <Link href={`/profile/${comment.user_id}`}>
              <p className="text-sm font-semibold hover:underline">
                {comment.user?.display_name || t('anonymousUser')}
              </p>
            </Link>
            {isOwner && (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => onEdit(comment)}
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-destructive"
                  onClick={() => onDelete(comment.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          {isEditing ? (
            <div className="mt-2 space-y-2">
              <textarea
                ref={(el) => {
                  if (el) editingTextareaRefs.current[comment.id] = el
                }}
                value={editingContent}
                onChange={(e) => setEditingContent(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                rows={3}
              />
              {/* Image upload for editing */}
              <div className="flex items-center gap-2">
                <EmojiPicker onEmojiSelect={(emoji) => handleEditEmoji(comment.id, emoji)} />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const input = document.createElement('input')
                    input.type = 'file'
                    input.accept = 'image/*'
                    input.multiple = true
                    input.onchange = (e) => onEditImageSelect?.(comment.id, e as any)
                    input.click()
                  }}
                  disabled={(editingExistingImages?.[comment.id]?.length || 0) + (editingImageFiles?.[comment.id]?.length || 0) >= 5}
                  title={(editingExistingImages?.[comment.id]?.length || 0) + (editingImageFiles?.[comment.id]?.length || 0) >= 5 ? t('maxImagesReached') : t('uploadImagesMax5')}
                >
                  <ImageIcon className="h-4 w-4 mr-1" />
                  {t('addImages')}
                </Button>
              </div>
              {/* Image previews for editing */}
              {((editingExistingImages?.[comment.id]?.length || 0) + (editingImagePreviews?.[comment.id]?.length || 0)) > 0 && (
                <div className="flex flex-wrap gap-2">
                  {editingExistingImages?.[comment.id]?.map((url, index) => (
                    <div key={`existing-${index}`} className="relative group">
                      <img
                        src={url}
                        alt={`Existing ${index + 1}`}
                        className="h-20 w-20 rounded-md object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => onRemoveEditImage?.(comment.id, index, true)}
                        className="absolute -top-2 -right-2 rounded-full bg-destructive text-destructive-foreground p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {editingImagePreviews?.[comment.id]?.map((preview, index) => (
                    <div key={`preview-${index}`} className="relative group">
                      <img
                        src={preview}
                        alt={`Preview ${index + 1}`}
                        className="h-20 w-20 rounded-md object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => onRemoveEditImage?.(comment.id, (editingExistingImages?.[comment.id]?.length || 0) + index, false)}
                        className="absolute -top-2 -right-2 rounded-full bg-destructive text-destructive-foreground p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => onSaveEdit(comment.id)}
                  disabled={!editingContent.trim() && (editingExistingImages?.[comment.id]?.length || 0) + (editingImageFiles?.[comment.id]?.length || 0) === 0}
                >
                  {tCommon('save')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onCancelEdit}
                >
                  {tCommon('cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* 显示"回复 @用户名"标签（所有回复评论都显示） */}
              {isReply && parentCommentUser && (
                <div className="mt-1 mb-1">
                  <span className="text-xs text-muted-foreground">
                    {t('reply')}{' '}
                    <Link
                      href={`/profile/${parentCommentUser.user_id}`}
                      className="text-primary hover:underline font-medium"
                    >
                      @{parentCommentUser.display_name || parentCommentUser.username}
                    </Link>
                  </span>
                </div>
              )}
              {/* ✅ 修复 P0-3: 使用转义后的内容（防止 XSS） */}
              <p className="text-sm text-muted-foreground mt-1 break-words">
                {sanitizeContent(comment.content)}
              </p>
              {/* Display comment images */}
              {comment.image_urls && comment.image_urls.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {comment.image_urls.map((imageUrl, index) => (
                    <img
                      key={index}
                      src={imageUrl}
                      alt={`Comment image ${index + 1}`}
                      className="max-w-full h-auto max-h-48 rounded-md object-cover cursor-pointer"
                      onClick={() => window.open(imageUrl, '_blank')}
                    />
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3 mt-2">
                <p className="text-xs text-muted-foreground">
                  {new Date(comment.created_at).toLocaleString('zh-CN')}
                </p>
                {user && (
                  <>
                    <CommentLikeButton
                      commentId={comment.id}
                      initialLikes={comment.like_count ?? 0}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => onReply(comment.id)}
                    >
                      <Reply className="h-3 w-3 mr-1" />
                      {t('reply')}
                    </Button>
                    {user.id !== comment.user_id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => onReport(comment.id)}
                      >
                        <Flag className="h-3 w-3 mr-1" />
                        {tCommon('report')}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {/* 回复表单 */}
          {isReplying && user && (
            <div className="mt-3 space-y-2">
              <form
                onSubmit={(e) => onReplySubmit(e, comment.id)}
                className="flex gap-2 min-w-0"
              >
                <input
                  ref={replyInputRef}
                  type="text"
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder={t('writeReply')}
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm min-w-0"
                />
                <EmojiPicker onEmojiSelect={handleReplyEmoji} />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => replyFileInputRef?.current?.click()}
                  disabled={replyImageUpload && replyImageUpload.totalImageCount >= 5}
                  title={replyImageUpload && replyImageUpload.totalImageCount >= 5 ? t('maxImagesReached') : t('uploadImagesMax5')}
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
                  {tMessages('send')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setReplyContent('')
                    if (replyImageUpload) {
                      replyImageUpload.clearImages()
                    }
                    onReply('')
                  }}
                >
                  {tCommon('cancel')}
                </Button>
              </form>
              {/* Image previews for reply */}
              {replyImageUpload && replyImageUpload.allPreviews.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {replyImageUpload.allPreviews.map((preview, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={preview}
                        alt={`Preview ${index + 1}`}
                        className="h-20 w-20 rounded-md object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (index < replyImageUpload.existingImages.length) {
                            replyImageUpload.removeExistingImage(index)
                          } else {
                            replyImageUpload.removeImage(index - replyImageUpload.existingImages.length)
                          }
                        }}
                        className="absolute -top-2 -right-2 rounded-full bg-destructive text-destructive-foreground p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 显示回复 */}
          {replies.length > 0 && (
            <div className="mt-3 space-y-2 min-w-0">
              {/* 回复列表 */}
              {depth === 0 && (
                <div className="space-y-2 min-w-0 ml-4 border-l-2 border-muted pl-4">
                  {displayedReplies.map((reply) => (
                    <CommentItem
                      key={reply.id}
                      comment={reply}
                      user={user}
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
                      comments={comments}
                      postId={postId}
                      depth={depth + 1}
                    />
                  ))}
                </div>
              )}
              
              {/* 折叠/展开按钮 */}
              {depth === 0 && replies.length > 3 && (
                <div className="ml-4 pl-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground h-auto py-1"
                    onClick={() => setIsExpanded(!isExpanded)}
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="h-3 w-3 mr-1" />
                        {t('collapseReplies')}
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3 mr-1" />
                        {t('expandReplies', { n: replies.length - 3 })}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
