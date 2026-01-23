'use client'

import { useParams, useRouter, usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ImageUpload } from '@/components/ui/ImageUpload'
import { Loader2, ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'

export default function PromoteProductPage() {
  const params = useParams()
  const router = useRouter()
  const pathname = usePathname()
  const productId = params.id as string
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()
  const { toast } = useToast()
  const t = useTranslations('affiliate')
  const tPosts = useTranslations('posts')
  const tCommon = useTranslations('common')
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    content: '',
    images: [] as string[],
    location: '',
  })

  // Handle redirect to login when not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
    }
  }, [authLoading, user, router, pathname])

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          seller:profiles!products_seller_id_fkey(username, display_name)
        `)
        .eq('id', productId)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!productId,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !product) return

    setLoading(true)
    try {
      // Create post with affiliate link
      const { data: post, error: postError } = await supabase
        .from('posts')
        .insert({
          user_id: user.id,
          content: formData.content,
          image_urls: formData.images,
          location: formData.location || null,
          status: 'pending', // Needs approval
        })
        .select()
        .single()

      if (postError) throw postError

      // Link post to product as affiliate post
      const { error: affiliateError } = await supabase
        .from('affiliate_posts')
        .insert({
          post_id: post.id,
          product_id: productId,
          affiliate_id: user.id,
        })

      if (affiliateError) throw affiliateError

      toast({
        variant: 'success',
        title: '成功',
        description: t('affiliatePostCreated'),
      })
      router.push(`/post/${post.id}`)
    } catch (error: any) {
      console.error('Create affiliate post error:', error)
      toast({
        variant: 'destructive',
        title: '错误',
        description: t('createFailed') + ': ' + error.message,
      })
    } finally {
      setLoading(false)
    }
  }

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Show nothing if not authenticated (redirect is handled in useEffect)
  if (!user) {
    return null
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="py-12 text-center">
        <p className="text-destructive">商品不存在</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.back()}
        >
          返回
        </Button>
      </div>
    )
  }

  const commissionRate =
    product.commission_rate || product.affiliate_products?.[0]?.commission_rate || 0

  return (
    <div className="mx-auto max-w-2xl space-y-4 md:space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl md:text-2xl font-bold">{t('createAffiliatePost')}</h1>
      </div>

      {/* Product Info */}
      <Card className="p-4 md:p-6">
        <div className="mb-4 flex flex-col sm:flex-row gap-4">
          {product.images?.[0] && (
            <img
              src={product.images[0]}
              alt={product.name}
              className="h-24 w-24 rounded object-cover flex-shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm sm:text-base break-words">{product.name}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2 break-words">
              {product.description}
            </p>
            <div className="mt-2 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
              <span className="text-lg font-bold">¥{product.price.toFixed(2)}</span>
              <span className="text-sm text-primary">
                {t('commission')}: {commissionRate}%
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Post Form */}
      <Card className="p-4 md:p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium">{tPosts('content')}</label>
            <textarea
              required
              value={formData.content}
              onChange={(e) =>
                setFormData({ ...formData, content: e.target.value })
              }
              placeholder={t('shareExperience')}
              className="flex min-h-[150px] w-full max-w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 break-words"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">{tPosts('uploadImages')}</label>
            <ImageUpload
              bucket="posts"
              folder="affiliate"
              maxImages={9}
              existingImages={formData.images}
              onUploadComplete={(urls) => setFormData({ ...formData, images: urls })}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">{tPosts('selectLocation')}</label>
            <Input
              value={formData.location}
              onChange={(e) =>
                setFormData({ ...formData, location: e.target.value })
              }
              placeholder={tPosts('enterLocation')}
            />
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={loading}
            >
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tCommon('loading')}
                </>
              ) : (
                t('createAffiliatePost')
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
