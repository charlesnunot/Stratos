'use client'

import { useState, useEffect, Suspense, useRef, useMemo } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthGuard } from '@/lib/hooks/useAuthGuard'
import { useAffiliateGuard } from '@/lib/hooks/useAffiliateGuard'
import { useTipGuard } from '@/lib/hooks/useTipGuard'
import { useImageUpload } from '@/lib/hooks/useImageUpload'
import { useToast } from '@/lib/hooks/useToast'
import { useSubscription } from '@/lib/subscription/SubscriptionContext'
import { createClient } from '@/lib/supabase/client'
import { sanitizeContent } from '@/lib/utils/sanitize-content'
import { resolveContentLang } from '@/lib/ai/detect-language'
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
import { X, Upload, Loader2, MapPin, Package } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { formatPriceWithConversion } from '@/lib/currency/format-currency'
import { detectCurrency, type Currency } from '@/lib/currency/detect-currency'
import { PaymentAccountBanner } from '@/components/payment/PaymentAccountBanner'
import { Gift } from 'lucide-react'

function CreatePostContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { user, loading: authLoading } = useAuthGuard()
  const { allowed: canUseAffiliate, isInternalUser: isAffiliateInternalUser, hasPaymentAccount: hasAffiliatePaymentAccount } = useAffiliateGuard()
  const { allowed: canUseTip, isInternalUser: isTipInternalUser, hasPaymentAccount: hasTipPaymentAccount } = useTipGuard()
  const { isAffiliate, isTipEnabled } = useSubscription()
  const supabase = createClient()
  const { toast } = useToast()
  type CreatePostType = 'image' | 'text' | 'story' | 'music' | 'short_video'
  const [postType, setPostType] = useState<CreatePostType>('image')
  const [content, setContent] = useState('')
  const [location, setLocation] = useState('')
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [chapterNumber, setChapterNumber] = useState<number | ''>('')
  const [contentLength, setContentLength] = useState<number | ''>('')
  const [musicUrl, setMusicUrl] = useState('')
  const [durationSeconds, setDurationSeconds] = useState<number | ''>('')
  const [videoUrl, setVideoUrl] = useState('')
  const [musicFile, setMusicFile] = useState<File | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [postTipEnabled, setPostTipEnabled] = useState(true)
  const t = useTranslations('posts')
  const tGroups = useTranslations('groups')
  const tCommon = useTranslations('common')
  const tAffiliate = useTranslations('affiliate')
  const locale = useLocale()

  const canPromoteProducts = canUseAffiliate

  // 从 URL 参数获取预填的商品 ID（只执行一次）
  const prefillProductId = searchParams.get('product_id')
  const prefillApplied = useRef(false)

  useEffect(() => {
    if (prefillProductId && !prefillApplied.current && !selectedProductIds.includes(prefillProductId) && canPromoteProducts) {
      prefillApplied.current = true
      setSelectedProductIds(prev => [...prev, prefillProductId])
    }
  }, [prefillProductId, selectedProductIds, canPromoteProducts])
  const toPascalCase = (str: string): string => {
    return str.replace(/(^|_)([a-z])/g, (_, __, letter) => letter.toUpperCase())
  }

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

  const { data: affiliateProducts = [] } = useQuery({
    queryKey: ['affiliateProducts', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('products')
        .select('id, name, name_translated, price, currency, images, commission_rate, seller_id')
        .eq('status', 'active')
        .eq('allow_affiliate', true)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data ?? []
    },
    enabled: !!user && isAffiliate,
  })

  const userCurrency = useMemo(() => detectCurrency({ browserLocale: locale }), [locale])

  const getLocalizedName = (product: { name: string; name_translated?: string | null }) => {
    return locale === 'zh' ? product.name : (product.name_translated || product.name)
  }

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
    if (selectedProductIds.length > 0 && !canPromoteProducts) {
      toast({
        variant: 'warning',
        title: tCommon('error'),
        description: tAffiliate('paymentAccountNotBoundDesc'),
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
    if (postType === 'short_video' && imagePreviews.length === 0 && !videoFile) {
      toast({
        variant: 'warning',
        title: tCommon('error'),
        description: t('shortVideoCoverRequired'),
      })
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

      const imageUrls = postType === 'image' ? await uploadImages() : (imagePreviews.length ? await uploadImages() : [])

      let shortVideoCoverUrl: string | null = null
      if (postType === 'short_video') {
        if (imageUrls.length > 0) {
          shortVideoCoverUrl = imageUrls[Math.floor(Math.random() * imageUrls.length)]
        } else if (videoFile && user) {
          try {
            const frameBlob = await extractVideoFirstFrame(videoFile)
            shortVideoCoverUrl = await uploadCoverImage(supabase, user.id, frameBlob)
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
        }
      }

      // Sanitize 防 XSS，再写入
      const safeContent = sanitizeContent(trimmed) || null
      // 根据实际内容检测语言，而不是界面语言
      const detectedContentLang = resolveContentLang(safeContent)

      const insertPayload: Record<string, unknown> = {
        user_id: user.id,
        content: safeContent,
        content_lang: detectedContentLang,
        image_urls: imageUrls,
        location: location.trim() || null,
        group_id: selectedGroupId || null,
        status: 'pending',
        post_type: postType,
        tip_enabled: isTipEnabled ? postTipEnabled : false,
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
        insertPayload.cover_url = shortVideoCoverUrl
      }
      const { data: post, error: postError } = await supabase
        .from('posts')
        .insert(insertPayload)
        .select()
        .single()

      if (postError) {
        console.error('[CreatePost] posts insert error:', postError)
        throw postError
      }

      console.log('[CreatePost] post created:', post.id)

      // Link products（带货商品：同时写入 post_products 和 affiliate_posts）
      // 使用 Set 去重
      const uniqueProductIds = [...new Set(selectedProductIds)]
      if (uniqueProductIds.length > 0) {
        console.log('[CreatePost] linking products:', uniqueProductIds)
        
        // 1. 写入 post_products 表
        const postProductsData = uniqueProductIds.map((productId, index) => ({
          post_id: post.id,
          product_id: productId,
          sort_order: index,
        }))
        console.log('[CreatePost] inserting post_products:', postProductsData)
        
        const { error: productsError } = await supabase.from('post_products').insert(postProductsData)
        if (productsError) {
          console.error('[CreatePost] post_products insert error:', productsError)
          await supabase.from('posts').delete().eq('id', post.id).eq('user_id', user.id)
          throw productsError
        }
        console.log('[CreatePost] post_products inserted successfully')

        // 2. 写入 affiliate_posts 表（开启佣金追踪）
        const affiliatePostsData = uniqueProductIds.map((productId) => ({
          post_id: post.id,
          product_id: productId,
          affiliate_id: user.id,
        }))
        console.log('[CreatePost] inserting affiliate_posts:', affiliatePostsData)
        
        const { error: affiliateError } = await supabase.from('affiliate_posts').insert(affiliatePostsData)
        if (affiliateError) {
          console.error('[CreatePost] affiliate_posts insert error:', affiliateError)
          // 不回滚，因为 affiliate_posts 失败不影响帖子创建
        } else {
          console.log('[CreatePost] affiliate_posts inserted successfully')
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
                {t(`postType${toPascalCase(type)}` as const)}
              </button>
            ))}
          </div>
        </Card>

        {/* Content */}
        <Card className="p-4">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={postType === 'music' ? t('contentPlaceholderMusic') : t('shareYourThoughts')}
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
            {postType === 'music' && (
              <p className="text-xs text-muted-foreground">{t('uploadImagesHintMusic')}</p>
            )}
            {postType === 'short_video' && (
              <p className="text-xs text-muted-foreground">{t('uploadImagesHintShortVideo')}</p>
            )}

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

        {/* 关联商品（带货）：仅对有带货订阅的用户显示 */}
        {isAffiliate && affiliateProducts.length > 0 && (
          <Card className="p-4">
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Package className="h-4 w-4" />
                {t('linkProducts')}
                <span className="text-muted-foreground font-normal">({t('affiliateProductsHint') || '选择要推广的商品，开启佣金追踪'})</span>
              </label>
              
              {!canPromoteProducts && !isAffiliateInternalUser && !hasAffiliatePaymentAccount && (
                <p className="text-sm text-muted-foreground">
                  {tAffiliate('paymentAccountNotBoundDesc')}
                </p>
              )}
              
              {canPromoteProducts && (
                <div className="flex flex-wrap gap-2">
                  {affiliateProducts.map((product) => (
                    <label
                      key={product.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5 min-w-0 max-w-[320px]"
                    >
                      <input
                        type="checkbox"
                        checked={selectedProductIds.includes(product.id)}
                        onChange={() => toggleProduct(product.id)}
                        className="rounded shrink-0"
                      />
                      {product.images?.[0] && (
                        <img src={product.images[0]} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                      )}
                      <span className="truncate min-w-0 flex-1">{getLocalizedName(product)}</span>
                      <span className="text-muted-foreground shrink-0">{formatPriceWithConversion(product.price, (product.currency || 'CNY') as Currency, userCurrency).main}</span>
                      {product.commission_rate && (
                        <span className="text-xs text-green-600 shrink-0">+{product.commission_rate}%</span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* 打赏状态提示 */}
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{t('tipStatus')}</span>
            </div>
            {isTipEnabled ? (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={postTipEnabled}
                  onChange={(e) => setPostTipEnabled(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">{postTipEnabled ? t('tipEnabled') : t('tipDisabled')}</span>
              </label>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.push('/subscription/tip')}
              >
                {t('enableTip')}
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {isTipEnabled 
              ? (postTipEnabled ? t('tipEnabledHint') : t('tipDisabledForPostHint'))
              : t('tipDisabledHint')}
          </p>
        </Card>

        {/* Location：仅通过 IP 解析，不提供手动输入 */}
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
          {location ? (
            <p className="mt-2 text-sm text-muted-foreground">{location}</p>
          ) : null}
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

export default function CreatePostPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <CreatePostContent />
    </Suspense>
  )
}
