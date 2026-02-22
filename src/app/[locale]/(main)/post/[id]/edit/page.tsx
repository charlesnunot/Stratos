'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { usePost } from '@/lib/hooks/usePosts'
import { useAuth } from '@/lib/hooks/useAuth'
import { useRouter } from '@/i18n/navigation'
import { Link } from '@/i18n/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useImageUpload } from '@/lib/hooks/useImageUpload'
import { useToast } from '@/lib/hooks/useToast'
import { createClient } from '@/lib/supabase/client'
import { sanitizeContent } from '@/lib/utils/sanitize-content'
import { logAudit } from '@/lib/api/audit'
import {
  uploadMediaFile,
  MAX_MUSIC_SIZE_MB,
  MAX_VIDEO_SIZE_MB,
  ALLOWED_AUDIO_TYPES,
  ALLOWED_VIDEO_TYPES,
} from '@/lib/storage/upload-media-file'
import { uploadCoverImage } from '@/lib/storage/upload-cover-image'
import { extractVideoFirstFrame } from '@/lib/video/extract-first-frame'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { X, Upload, Loader2, Sparkles, MapPin, ArrowLeft, Package, Gift } from 'lucide-react'
import { formatCurrency } from '@/lib/currency/format-currency'
import { useTranslations, useLocale } from 'next-intl'
import { useAiTask } from '@/lib/ai/useAiTask'
import { LoadingState } from '@/components/ui/LoadingState'
import { EmptyState } from '@/components/ui/EmptyState'

const POST_CONTENT_MAX_LENGTH = 2000
const MAX_TOPICS = 5
const MAX_TOPIC_LENGTH = 30

export default function EditPostPage() {
  const params = useParams()
  const postId = params.id as string
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: post, isLoading, error } = usePost(postId)
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()
  const { toast } = useToast()
  const t = useTranslations('posts')
  const tCommon = useTranslations('common')
  const tAi = useTranslations('ai')
  const locale = useLocale()
  const contentLang = locale === 'zh' ? 'zh' : 'en'
  const { runTask, loading: aiLoading } = useAiTask()

  type EditPostType = 'image' | 'text' | 'story' | 'music' | 'short_video'
  const [postType, setPostType] = useState<EditPostType>('image')
  const [content, setContent] = useState('')
  const [topics, setTopics] = useState<string[]>([])
  const [newTopic, setNewTopic] = useState('')
  const [location, setLocation] = useState('')
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [locationDetecting, setLocationDetecting] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [chapterNumber, setChapterNumber] = useState<number | ''>('')
  const [contentLength, setContentLength] = useState<number | ''>('')
  const [musicUrl, setMusicUrl] = useState('')
  const [durationSeconds, setDurationSeconds] = useState<number | ''>('')
  const [videoUrl, setVideoUrl] = useState('')
  const [musicFile, setMusicFile] = useState<File | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [postTipEnabled, setPostTipEnabled] = useState(true)
  const extractTopicsDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const tGroups = useTranslations('groups')

  // Helper to convert snake_case to PascalCase for translation keys
  const toPascalCase = (str: string): string => {
    return str.replace(/(^|_)([a-z])/g, (_, __, letter) => letter.toUpperCase())
  }

  const {
    images,
    imagePreviews,
    existingImages,
    allPreviews,
    uploading,
    handleImageSelect,
    removeImage,
    removeExistingImage,
    uploadImages,
    setExistingImages,
    totalImageCount,
  } = useImageUpload({
    bucket: 'posts',
    maxImages: 9,
    existingImages: post?.image_urls ?? [],
  })

  const { data: myProducts = [] } = useQuery({
    queryKey: ['myProducts', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('products')
        .select('id, name, price, images')
        .eq('seller_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data ?? []
    },
    enabled: !!user,
  })

  const toggleProduct = (productId: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    )
  }

  const { data: myGroups = [] } = useQuery({
    queryKey: ['myCommunityGroups', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data: members, error: me } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', user.id)
      if (me || !members?.length) return []
      const ids = members.map((m) => m.group_id)
      const { data: groups, error } = await supabase
        .from('community_groups')
        .select('id, name, slug')
        .in('id', ids)
        .order('name')
      if (error) throw error
      return groups ?? []
    },
    enabled: !!user,
  })

  useEffect(() => {
    if (post && !initialized) {
      const p = post as any
      const pt = p.post_type ?? 'normal'
      setPostType(pt === 'normal' ? 'image' : pt === 'series' || pt === 'affiliate' ? 'image' : pt)
      setContent(post.content ?? '')
      setTopics(post.topics?.map((t) => t.name) ?? [])
      setLocation(p.location ?? '')
      setSelectedProductIds(post.linkedProducts?.map((lp) => lp.product_id) ?? [])
      setSelectedGroupId(p.group_id ?? null)
      setChapterNumber(p.chapter_number ?? '')
      setContentLength(p.content_length ?? '')
      setMusicUrl(p.music_url ?? '')
      setDurationSeconds(p.duration_seconds ?? '')
      setVideoUrl(p.video_url ?? '')
      setPostTipEnabled(p.tip_enabled !== false)
      setInitialized(true)
    }
  }, [post, initialized])

  const fetchLocationFromIp = async () => {
    setLocationDetecting(true)
    try {
      const res = await fetch('/api/geo/location')
      const data = await res.json().catch(() => ({}))
      if (data?.location) setLocation(data.location)
      else toast({ variant: 'default', title: tCommon('notice'), description: t('locationFetchFailed') })
    } catch {
      toast({ variant: 'warning', title: tCommon('error'), description: t('locationFetchFailed') })
    } finally {
      setLocationDetecting(false)
    }
  }

  const addTopic = () => {
    const trimmed = newTopic.trim()
    if (!trimmed) return
    if (topics.length >= MAX_TOPICS) {
      toast({ variant: 'warning', title: tCommon('error'), description: t('topicsMaxReached', { max: MAX_TOPICS }) })
      return
    }
    if (trimmed.length > MAX_TOPIC_LENGTH) {
      toast({ variant: 'warning', title: tCommon('error'), description: t('topicTooLong', { max: MAX_TOPIC_LENGTH }) })
      return
    }
    if (!topics.includes(trimmed)) {
      setTopics([...topics, trimmed])
      setNewTopic('')
    }
  }

  const removeTopic = (topic: string) => {
    setTopics(topics.filter((t) => t !== topic))
  }

  const handleExtractTopics = async () => {
    if (!content.trim()) {
      toast({ variant: 'warning', title: tCommon('error'), description: t('fillContentOrImages') })
      return
    }
    if (extractTopicsDebounceRef.current) return
    extractTopicsDebounceRef.current = setTimeout(() => {
      extractTopicsDebounceRef.current = null
    }, 2000)
    try {
      const { topics: suggested } = await runTask({ task: 'extract_topics', input: content })
      if (suggested?.length) {
        const valid = suggested.filter((s) => s.length <= MAX_TOPIC_LENGTH).slice(0, MAX_TOPICS - topics.length)
        const merged = [...new Set([...topics, ...valid])].slice(0, MAX_TOPICS)
        setTopics(merged)
        toast({ variant: 'success', title: tCommon('success'), description: t('topic') + ' ' + valid.join(', ') })
      }
    } catch (e) {
      toast({ variant: 'destructive', title: tCommon('error'), description: tAi('failed') })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!post || !user || user.id !== post.user_id) return
    const trimmed = content.trim()
    if (trimmed.length > POST_CONTENT_MAX_LENGTH) {
      toast({ variant: 'warning', title: tCommon('error'), description: t('contentTooLong', { max: POST_CONTENT_MAX_LENGTH }) })
      return
    }
    if (postType === 'image' && allPreviews.length === 0) {
      toast({ variant: 'warning', title: tCommon('error'), description: t('atLeastOneImage') })
      return
    }
    if (postType === 'music' && !musicUrl.trim() && !musicFile) {
      toast({ variant: 'warning', title: tCommon('error'), description: t('postTypeMusicUrlRequired') })
      return
    }
    if (postType === 'short_video' && !videoUrl.trim() && !videoFile) {
      toast({ variant: 'warning', title: tCommon('error'), description: t('postTypeVideoUrlRequired') })
      return
    }
    const hasExistingCover =
      (post.image_urls && post.image_urls.length > 0) || (post as { cover_url?: string | null }).cover_url
    if (
      postType === 'short_video' &&
      allPreviews.length === 0 &&
      !videoFile &&
      !hasExistingCover
    ) {
      toast({ variant: 'warning', title: tCommon('error'), description: t('shortVideoCoverRequired') })
      return
    }
    setLoading(true)

    try {
      let finalMusicUrl = musicUrl.trim()
      let finalVideoUrl = videoUrl.trim()
      if (postType === 'music' && musicFile && user) {
        finalMusicUrl = await uploadMediaFile(supabase, user.id, 'music', musicFile, {
          maxSizeMb: MAX_MUSIC_SIZE_MB,
          allowedTypes: ALLOWED_AUDIO_TYPES,
        })
      }
      if (postType === 'short_video' && videoFile && user) {
        finalVideoUrl = await uploadMediaFile(supabase, user.id, 'videos', videoFile, {
          maxSizeMb: MAX_VIDEO_SIZE_MB,
          allowedTypes: ALLOWED_VIDEO_TYPES,
        })
      }

      const imageUrls = allPreviews.length > 0 ? await uploadImages() : (post.image_urls ?? [])

      let shortVideoCoverUrl: string | null = null
      if (postType === 'short_video') {
        const existingCover = (post as { cover_url?: string | null }).cover_url ?? null
        if (imageUrls.length > 0) {
          shortVideoCoverUrl = imageUrls[Math.floor(Math.random() * imageUrls.length)]
        } else if (videoFile && user) {
          try {
            const blob = await extractVideoFirstFrame(videoFile)
            shortVideoCoverUrl = await uploadCoverImage(supabase, user.id, blob)
          } catch (e) {
            console.error('Extract video cover failed:', e)
            toast({
              variant: 'destructive',
              title: tCommon('error'),
              description: t('shortVideoCoverExtractFailed'),
            })
            setLoading(false)
            return
          }
        } else {
          shortVideoCoverUrl = existingCover
        }
      }

      const topicIds: string[] = []
      for (const topicName of topics) {
        const { data: existingTopic } = await supabase
          .from('topics')
          .select('id')
          .eq('name', topicName)
          .single()

        let topicId: string
        if (existingTopic) {
          topicId = existingTopic.id
        } else {
          const slug = topicName.toLowerCase().replace(/\s+/g, '-')
          const { data: newT, error: topicErr } = await supabase
            .from('topics')
            .insert({ name: topicName, slug })
            .select()
            .single()
          if (topicErr) throw topicErr
          topicId = newT.id
        }
        topicIds.push(topicId)
      }

      const safeContent = sanitizeContent(trimmed) || null

      const updatePayload: Record<string, unknown> = {
        content: safeContent,
        content_lang: safeContent ? contentLang : null,
        image_urls: imageUrls,
        location: location.trim() || null,
        group_id: selectedGroupId || null,
        updated_at: new Date().toISOString(),
        post_type: postType,
        tip_enabled: postTipEnabled,
      }
      if (postType === 'story') {
        updatePayload.chapter_number = chapterNumber === '' ? null : chapterNumber
        updatePayload.content_length = contentLength === '' ? null : contentLength
        updatePayload.music_url = null
        updatePayload.duration_seconds = null
        updatePayload.video_url = null
        updatePayload.cover_url = null
      } else if (postType === 'music') {
        updatePayload.music_url = finalMusicUrl || null
        updatePayload.duration_seconds = durationSeconds === '' ? null : durationSeconds
        updatePayload.chapter_number = null
        updatePayload.content_length = null
        updatePayload.video_url = null
        updatePayload.cover_url = null
      } else if (postType === 'short_video') {
        updatePayload.video_url = finalVideoUrl || null
        updatePayload.duration_seconds = durationSeconds === '' ? null : durationSeconds
        updatePayload.cover_url = shortVideoCoverUrl
        updatePayload.chapter_number = null
        updatePayload.content_length = null
        updatePayload.music_url = null
      } else {
        updatePayload.chapter_number = null
        updatePayload.content_length = null
        updatePayload.music_url = null
        updatePayload.duration_seconds = null
        updatePayload.video_url = null
        updatePayload.cover_url = null
      }

      const { error: updateError } = await supabase
        .from('posts')
        .update(updatePayload)
        .eq('id', postId)
        .eq('user_id', user.id)

      if (updateError) throw updateError

      await supabase.from('post_topics').delete().eq('post_id', postId)

      if (topicIds.length > 0) {
        const { error: topicError } = await supabase
          .from('post_topics')
          .insert(topicIds.map((topicId) => ({ post_id: postId, topic_id: topicId })))
        if (topicError) throw topicError
      }

      await supabase.from('post_products').delete().eq('post_id', postId)
      if (selectedProductIds.length > 0) {
        const { error: productsError } = await supabase.from('post_products').insert(
          selectedProductIds.map((productId, index) => ({
            post_id: postId,
            product_id: productId,
            sort_order: index,
          }))
        )
        if (productsError) throw productsError
      }

      logAudit({
        action: 'update_post',
        userId: user.id,
        resourceId: postId,
        resourceType: 'post',
        result: 'success',
        timestamp: new Date().toISOString(),
      })

      queryClient.invalidateQueries({ queryKey: ['posts'] })
      queryClient.invalidateQueries({ queryKey: ['post', postId] })
      queryClient.invalidateQueries({ queryKey: ['userPosts'] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: ['favorites', user.id] })
      }
      router.push(`/post/${postId}`)
    } catch (err) {
      console.error('Error updating post:', err)
      toast({ variant: 'destructive', title: tCommon('error'), description: t('updateFailedRetry') })
    } finally {
      setLoading(false)
    }
  }

  if (isLoading || authLoading) {
    return <LoadingState />
  }

  if (error || !post) {
    return <EmptyState title={t('postNotFoundOrLoadFailed')} />
  }

  if (!user || user.id !== post.user_id) {
    return (
      <div className="mx-auto max-w-md py-12 px-4">
        <EmptyState title={t('noPermissionToOperate')} />
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/post/${postId}`}>{t('openPost')}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">{tCommon('cancel')}</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">{t('editPost')}</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="p-4">
          <label className="text-sm font-medium block mb-2">{t('postType')}</label>
          <div className="flex flex-wrap gap-2">
            {(['image', 'story', 'music', 'short_video'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setPostType(type)}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  postType === type ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
                }`}
              >
                {t(`postType${toPascalCase(type)}` as const)}
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('shareYourThoughts')}
            className="w-full resize-none border-none bg-transparent text-sm focus:outline-none"
            rows={6}
            maxLength={POST_CONTENT_MAX_LENGTH}
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">
            {content.length}/{POST_CONTENT_MAX_LENGTH}
          </p>
          {postType === 'story' && (
            <>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">{t('postType_chapterNumber')}</label>
                  <input
                    type="number"
                    min={1}
                    value={chapterNumber === '' ? '' : chapterNumber}
                    onChange={(e) => setChapterNumber(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    placeholder={t('postType_chapterOptional')}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('postType_contentLength')}</label>
                  <input
                    type="number"
                    min={0}
                    value={contentLength === '' ? '' : contentLength}
                    onChange={(e) => setContentLength(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    placeholder={t('postType_wordCount')}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </>
          )}
          {postType === 'music' && (
            <div className="mt-3 space-y-2">
              <label className="text-xs text-muted-foreground">{t('postType_musicUrl')} *</label>
              <input
                type="url"
                value={musicUrl}
                onChange={(e) => {
                  setMusicUrl(e.target.value)
                  if (e.target.value.trim()) setMusicFile(null)
                }}
                placeholder="https://..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={!!musicFile}
              />
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">{t('postType_orUploadFile')}</span>
                <label className="cursor-pointer inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-muted/50">
                  <Upload className="h-4 w-4" />
                  <span>{t('postType_uploadMusic')}</span>
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) {
                        setMusicFile(f)
                        setMusicUrl('')
                      }
                      e.target.value = ''
                    }}
                  />
                </label>
                {musicFile && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    {musicFile.name}
                    <button type="button" onClick={() => setMusicFile(null)} className="text-destructive hover:underline">
                      {t('postType_removeFile')}
                    </button>
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t('postType_musicSizeHint', { max: MAX_MUSIC_SIZE_MB })}</p>
              <div>
                <label className="text-xs text-muted-foreground">{t('postType_durationSeconds')}</label>
                <input
                  type="number"
                  min={0}
                  value={durationSeconds === '' ? '' : durationSeconds}
                  onChange={(e) => setDurationSeconds(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                  placeholder={t('postType_durationOptional')}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}
          {postType === 'short_video' && (
            <div className="mt-3 space-y-2">
              <div>
                <label className="text-xs text-muted-foreground">{t('postType_videoUrl')} *</label>
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(e) => {
                    setVideoUrl(e.target.value)
                    if (e.target.value.trim()) setVideoFile(null)
                  }}
                  placeholder="https://..."
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  disabled={!!videoFile}
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">{t('postType_orUploadFile')}</span>
                <label className="cursor-pointer inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-muted/50">
                  <Upload className="h-4 w-4" />
                  <span>{t('postType_uploadVideo')}</span>
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) {
                        setVideoFile(f)
                        setVideoUrl('')
                      }
                      e.target.value = ''
                    }}
                  />
                </label>
                {videoFile && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    {videoFile.name}
                    <button type="button" onClick={() => setVideoFile(null)} className="text-destructive hover:underline">
                      {t('postType_removeFile')}
                    </button>
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t('postType_videoSizeHint', { max: MAX_VIDEO_SIZE_MB })}</p>
              <div>
                <label className="text-xs text-muted-foreground">{t('postType_durationSeconds')}</label>
                <input
                  type="number"
                  min={0}
                  value={durationSeconds === '' ? '' : durationSeconds}
                  onChange={(e) => setDurationSeconds(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                  placeholder={t('postType_durationOptional')}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="space-y-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Upload className="h-4 w-4" />
              <span>{t('uploadImagesMax')}</span>
              {postType === 'image' && <span className="text-destructive">*</span>}
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageSelect}
                className="hidden"
                disabled={totalImageCount >= 9}
              />
            </label>
            {postType === 'music' && (
              <p className="text-xs text-muted-foreground">{t('uploadImagesHintMusic')}</p>
            )}
            {postType === 'short_video' && (
              <p className="text-xs text-muted-foreground">{t('uploadImagesHintShortVideo')}</p>
            )}
            {allPreviews.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {allPreviews.map((preview, index) => (
                  <div key={index} className="relative aspect-square">
                    <img
                      src={preview}
                      alt={`Preview ${index + 1}`}
                      className="h-full w-full rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        index < existingImages.length ? removeExistingImage(index) : removeImage(index - existingImages.length)
                      }
                      className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium">{t('topic')}</label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExtractTopics}
                disabled={!content.trim() || aiLoading}
              >
                {aiLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-3 w-3" />
                )}
                {tAi('extractTopics')}
              </Button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTopic()
                  }
                }}
                placeholder={`${tCommon('create')} ${t('topic')}...`}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <Button type="button" onClick={addTopic} variant="outline">
                {tCommon('create')}
              </Button>
            </div>
            {topics.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {topics.map((topic) => (
                  <span
                    key={topic}
                    className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm"
                  >
                    #{topic}
                    <button type="button" onClick={() => removeTopic(topic)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>

        {myGroups.length > 0 && (
          <Card className="p-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{tGroups('title')}</label>
              <select
                value={selectedGroupId ?? ''}
                onChange={(e) => setSelectedGroupId(e.target.value || null)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">{t('noGroup')}</option>
                {myGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          </Card>
        )}

        {myProducts.length > 0 && (
          <Card className="p-4">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Package className="h-4 w-4" />
                {t('linkProducts')}
                <span className="text-muted-foreground font-normal">({t('linkProductsOptional')})</span>
              </label>
              <p className="text-xs text-muted-foreground">{t('selectProducts')}</p>
              <div className="flex flex-wrap gap-2">
                {myProducts.map((product) => (
                  <label
                    key={product.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <input
                      type="checkbox"
                      checked={selectedProductIds.includes(product.id)}
                      onChange={() => toggleProduct(product.id)}
                      className="rounded"
                    />
                    {product.images?.[0] && (
                      <img src={product.images[0]} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                    )}
                    <span className="truncate">{product.name}</span>
                    <span className="text-muted-foreground shrink-0">{formatCurrency(product.price, 'CNY')}</span>
                  </label>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* 打赏开关 */}
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{t('tipStatus')}</span>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={postTipEnabled}
                onChange={(e) => setPostTipEnabled(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">{postTipEnabled ? t('tipEnabled') : t('tipDisabled')}</span>
            </label>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {postTipEnabled ? t('tipEnabledHint') : t('tipDisabledForPostHint')}
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <label className="text-sm font-medium">{t('selectLocation')}</label>
            <Button type="button" variant="ghost" size="sm" onClick={fetchLocationFromIp} disabled={locationDetecting}>
              {locationDetecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MapPin className="mr-1 h-4 w-4" />
              )}
              {t('detectLocation')}
            </Button>
          </div>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t('enterLocation')}
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">{t('detectLocationHint')}</p>
        </Card>

        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading || uploading}>
            {tCommon('cancel')}
          </Button>
          <Button asChild variant="outline">
            <Link href={`/post/${postId}`} className="inline-flex gap-2">
              <ArrowLeft className="h-4 w-4" />
              {t('openPost')}
            </Link>
          </Button>
          <Button type="submit" disabled={loading || uploading} className="flex-1">
            {loading || uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {tCommon('loading')}
              </>
            ) : (
              tCommon('save')
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
