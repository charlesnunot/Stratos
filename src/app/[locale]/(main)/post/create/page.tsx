'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthGuard } from '@/lib/hooks/useAuthGuard'
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
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { X, Upload, Loader2, Sparkles, MapPin, Package } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { useAiTask } from '@/lib/ai/useAiTask'
import { formatCurrency } from '@/lib/currency/format-currency'

export default function CreatePostPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user, loading: authLoading } = useAuthGuard()
  const supabase = createClient()
  const { toast } = useToast()
  type CreatePostType = 'image' | 'text' | 'story' | 'music' | 'short_video'
  const [postType, setPostType] = useState<CreatePostType>('image')
  const [content, setContent] = useState('')
  const [topics, setTopics] = useState<string[]>([])
  const [newTopic, setNewTopic] = useState('')
  const [location, setLocation] = useState('')
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [chapterNumber, setChapterNumber] = useState<number | ''>('')
  const [contentLength, setContentLength] = useState<number | ''>('')
  const [musicUrl, setMusicUrl] = useState('')
  const [durationSeconds, setDurationSeconds] = useState<number | ''>('')
  const [videoUrl, setVideoUrl] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [musicFile, setMusicFile] = useState<File | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const t = useTranslations('posts')
  const tGroups = useTranslations('groups')
  const tCommon = useTranslations('common')
  const tAi = useTranslations('ai')
  const locale = useLocale()
  const contentLang = locale === 'zh' ? 'zh' : 'en'
  const { runTask, loading: aiLoading } = useAiTask()

  const [locationDetecting, setLocationDetecting] = useState(false)

  const fetchLocationFromIp = async () => {
    setLocationDetecting(true)
    try {
      const res = await fetch('/api/geo/location')
      const data = await res.json().catch(() => ({}))
      if (data?.location) {
        setLocation(data.location)
      } else {
        toast({ variant: 'default', title: tCommon('notice'), description: t('locationFetchFailed') })
      }
    } catch {
      toast({ variant: 'warning', title: tCommon('error'), description: t('locationFetchFailed') })
    } finally {
      setLocationDetecting(false)
    }
  }

  useEffect(() => {
    fetchLocationFromIp()
  }, [])

  const {
    images,
    imagePreviews,
    uploading,
    handleImageSelect,
    removeImage,
    uploadImages,
  } = useImageUpload({
    bucket: 'posts',
    maxImages: 9,
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

  const extractTopicsDebounceRef = useRef<NodeJS.Timeout | null>(null)

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  const MAX_TOPICS = 5
  const MAX_TOPIC_LENGTH = 30

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

  const POST_CONTENT_MAX_LENGTH = 2000

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    const trimmed = content.trim()
    if (trimmed.length > POST_CONTENT_MAX_LENGTH) {
      toast({
        variant: 'warning',
        title: tCommon('error'),
        description: t('contentTooLong', { max: POST_CONTENT_MAX_LENGTH }),
      })
      return
    }
    if (postType === 'image' && imagePreviews.length === 0) {
      toast({
        variant: 'warning',
        title: tCommon('error'),
        description: t('atLeastOneImage'),
      })
      return
    }
    if (postType === 'story' && !trimmed) {
      toast({
        variant: 'warning',
        title: tCommon('error'),
        description: t('fillContentOrImages'),
      })
      return
    }
    if (postType === 'music' && !musicUrl.trim() && !musicFile) {
      toast({
        variant: 'warning',
        title: tCommon('error'),
        description: t('postTypeMusicUrlRequired'),
      })
      return
    }
    if (postType === 'short_video' && !videoUrl.trim() && !videoFile) {
      toast({
        variant: 'warning',
        title: tCommon('error'),
        description: t('postTypeVideoUrlRequired'),
      })
      return
    }
    setLoading(true)

    try {
      let finalMusicUrl = musicUrl.trim()
      let finalVideoUrl = videoUrl.trim()
      let finalCoverUrl = coverUrl.trim()

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

      const imageUrls = postType === 'image' ? await uploadImages() : (imagePreviews.length ? await uploadImages() : [])

      // Create or get topics
      const topicIds: string[] = []
      for (const topicName of topics) {
        // Check if topic exists
        const { data: existingTopic } = await supabase
          .from('topics')
          .select('id')
          .eq('name', topicName)
          .single()

        let topicId: string
        if (existingTopic) {
          topicId = existingTopic.id
        } else {
          // Create new topic
          const slug = topicName.toLowerCase().replace(/\s+/g, '-')
          const { data: newTopic, error } = await supabase
            .from('topics')
            .insert({
              name: topicName,
              slug,
            })
            .select()
            .single()

          if (error) throw error
          topicId = newTopic.id
        }
        topicIds.push(topicId)
      }

      // Sanitize 防 XSS，再写入
      const safeContent = sanitizeContent(trimmed) || null

      const insertPayload: Record<string, unknown> = {
        user_id: user.id,
        content: safeContent,
        content_lang: safeContent ? contentLang : null,
        image_urls: imageUrls,
        location: location.trim() || null,
        group_id: selectedGroupId || null,
        status: 'pending',
        post_type: postType,
      }
      if (postType === 'story') {
        if (chapterNumber !== '') insertPayload.chapter_number = chapterNumber
        if (contentLength !== '') insertPayload.content_length = contentLength
      }
      if (postType === 'music') {
        insertPayload.music_url = finalMusicUrl || null
        if (durationSeconds !== '') insertPayload.duration_seconds = durationSeconds
      }
      if (postType === 'short_video') {
        insertPayload.video_url = finalVideoUrl || null
        if (durationSeconds !== '') insertPayload.duration_seconds = durationSeconds
        insertPayload.cover_url = finalCoverUrl || (imageUrls[0] ?? null)
      }
      const { data: post, error: postError } = await supabase
        .from('posts')
        .insert(insertPayload)
        .select()
        .single()

      if (postError) throw postError

      // Link topics（失败时回滚：删除刚创建的 post）
      if (topicIds.length > 0) {
        const { error: topicError } = await supabase
          .from('post_topics')
          .insert(
            topicIds.map((topicId) => ({
              post_id: post.id,
              topic_id: topicId,
            }))
          )

        if (topicError) {
          await supabase.from('posts').delete().eq('id', post.id).eq('user_id', user.id)
          throw topicError
        }
      }

      // Link products（可选；失败时回滚）
      if (selectedProductIds.length > 0) {
        const { error: productsError } = await supabase.from('post_products').insert(
          selectedProductIds.map((productId, index) => ({
            post_id: post.id,
            product_id: productId,
            sort_order: index,
          }))
        )
        if (productsError) {
          await supabase.from('posts').delete().eq('id', post.id).eq('user_id', user.id)
          throw productsError
        }
      }

      logAudit({
        action: 'create_post',
        userId: user.id,
        resourceId: post.id,
        resourceType: 'post',
        result: 'success',
        timestamp: new Date().toISOString(),
      })

      // 使相关查询失效以刷新数据（含 Feed、收藏，确保审核通过后各入口同步）
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      queryClient.invalidateQueries({ queryKey: ['post', post.id] })
      queryClient.invalidateQueries({ queryKey: ['posts', 'pending'] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: ['favorites', user.id] })
      }

      router.push(`/post/${post.id}`)
    } catch (error) {
      console.error('Error creating post:', error)
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: t('publishFailed'),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">{t('createPost')}</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 内容类型 */}
        <Card className="p-4">
          <label className="text-sm font-medium block mb-2">{t('postType')}</label>
          <div className="flex flex-wrap gap-2">
            {(['image', 'story', 'music', 'short_video'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setPostType(type)}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  postType === type
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80'
                }`}
              >
                {t(`postType_${type}`)}
              </button>
            ))}
          </div>
        </Card>

        {/* Content */}
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
                    <button
                      type="button"
                      onClick={() => setMusicFile(null)}
                      className="text-destructive hover:underline"
                    >
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
                    <button
                      type="button"
                      onClick={() => setVideoFile(null)}
                      className="text-destructive hover:underline"
                    >
                      {t('postType_removeFile')}
                    </button>
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t('postType_videoSizeHint', { max: MAX_VIDEO_SIZE_MB })}</p>
              <div>
                <label className="text-xs text-muted-foreground">{t('postType_coverUrl')}</label>
                <input
                  type="url"
                  value={coverUrl}
                  onChange={(e) => setCoverUrl(e.target.value)}
                  placeholder="https://..."
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <p className="mt-0.5 text-xs text-muted-foreground">{t('postType_coverHint')}</p>
              </div>
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

        {/* Image Upload（图文必填；故事/音乐/短视频可选） */}
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
              />
            </label>

            {imagePreviews.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {imagePreviews.map((preview, index) => (
                  <div key={index} className="relative aspect-square">
                    <img
                      src={preview}
                      alt={`Preview ${index + 1}`}
                      className="h-full w-full rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
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

        {/* Topics */}
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
                    <button
                      type="button"
                      onClick={() => removeTopic(topic)}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* 发布到小组（可选）：仅展示当前用户已加入的小组 */}
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

        {/* 关联商品（可选）：仅展示当前用户已上架商品 */}
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

        {/* Location：根据 IP 自动填充，可修改或重新检测 */}
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <label className="text-sm font-medium">{t('selectLocation')}</label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={fetchLocationFromIp}
              disabled={locationDetecting}
            >
              {locationDetecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MapPin className="h-4 w-4 mr-1" />
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

        {/* Submit */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={loading || uploading}
          >
            {tCommon('cancel')}
          </Button>
          <Button type="submit" disabled={loading || uploading} className="flex-1">
            {loading || uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {uploading ? tCommon('loading') : tCommon('loading')}
              </>
            ) : (
              t('createPost')
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
