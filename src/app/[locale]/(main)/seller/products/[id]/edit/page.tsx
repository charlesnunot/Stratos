'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useImageUpload } from '@/lib/hooks/useImageUpload'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { X, Upload, Loader2, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

export default function EditProductPage() {
  const router = useRouter()
  const params = useParams()
  const productId = params.id as string
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const t = useTranslations('seller')
  const tCommon = useTranslations('common')
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    stock: '0',
    category: '',
    allow_affiliate: false,
    commission_rate: '',
    details: '',
    faq: [] as Array<{ question: string; answer: string }>,
  })
  
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const {
    images,
    imagePreviews,
    existingImages,
    uploading,
    handleImageSelect,
    removeImage,
    removeExistingImage,
    uploadImages,
    setExistingImages,
    totalImageCount,
  } = useImageUpload({
    bucket: 'products',
    folder: 'products',
    maxImages: 9,
  })

  // Load product data
  const { data: product, isLoading: productLoading, error: productError } = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      if (!user) return null
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .eq('seller_id', user.id)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!user && !!productId,
  })

  // Populate form when product data loads
  useEffect(() => {
    if (product) {
      // Parse FAQ if it's a string
      let parsedFaq: Array<{ question: string; answer: string }> = []
      if (product.faq) {
        try {
          parsedFaq = typeof product.faq === 'string' ? JSON.parse(product.faq) : product.faq
          if (!Array.isArray(parsedFaq)) {
            parsedFaq = []
          }
        } catch (e) {
          parsedFaq = []
        }
      }

      setFormData({
        name: product.name || '',
        description: product.description || '',
        price: product.price?.toString() || '',
        stock: product.stock?.toString() || '0',
        category: product.category || '',
        allow_affiliate: product.allow_affiliate || false,
        commission_rate: product.commission_rate?.toString() || '',
        details: product.details || '',
        faq: parsedFaq,
      })
      if (product.images) {
        setExistingImages(product.images)
      }
    }
  }, [product])

  // Wait for auth to load before checking user
  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?redirect=${encodeURIComponent(`/seller/products/${productId}/edit`)}`)
    }
  }, [authLoading, user, router, productId])

  // Redirect if user doesn't own the product
  useEffect(() => {
    if (product && user && product.seller_id !== user.id) {
      router.push('/seller/products')
    }
  }, [product, user, router])

  if (authLoading || productLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  if (productError || !product) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="p-12 text-center">
          <p className="mb-4 text-muted-foreground">{tCommon('error')}</p>
          <Button onClick={() => router.push('/seller/products')}>{tCommon('back')}</Button>
        </Card>
      </div>
    )
  }


  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = t('enterProductName')
    }

    const price = parseFloat(formData.price)
    if (!formData.price || isNaN(price) || price <= 0) {
      newErrors.price = tCommon('error')
    }

    if (existingImages.length + images.length === 0) {
      newErrors.images = tCommon('error')
    }

    if (formData.allow_affiliate) {
      const commissionRate = parseFloat(formData.commission_rate)
      if (!formData.commission_rate || isNaN(commissionRate) || commissionRate < 0 || commissionRate > 100) {
        newErrors.commission_rate = tCommon('error')
      }
    }

    const stock = parseInt(formData.stock)
    if (formData.stock && (isNaN(stock) || stock < 0)) {
      newErrors.stock = tCommon('error')
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setLoading(true)

    try {
      // Upload new images (uploadImages already includes existing images)
      const allImageUrls = await uploadImages()

      // Prepare product data
      const productData: any = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        price: parseFloat(formData.price),
        stock: parseInt(formData.stock) || 0,
        category: formData.category.trim() || null,
        images: allImageUrls,
        allow_affiliate: formData.allow_affiliate,
        commission_rate: formData.allow_affiliate && formData.commission_rate
          ? parseFloat(formData.commission_rate)
          : null,
        details: formData.details.trim() || null,
        faq: formData.faq.length > 0 ? formData.faq : null,
        // If editing an active product, set to pending for re-review to ensure content compliance
        // Only keep 'sold' status as it indicates the product is no longer available
        status: product.status === 'sold' 
          ? product.status 
          : 'pending',
        // Clear review fields when status changes to pending (for re-review)
        reviewed_by: product.status === 'sold' ? product.reviewed_by : null,
        reviewed_at: product.status === 'sold' ? product.reviewed_at : null,
      }

      // Update product
      const { error: updateError } = await supabase
        .from('products')
        .update(productData)
        .eq('id', productId)

      if (updateError) throw updateError

      // Invalidate related queries to refresh cache
      queryClient.invalidateQueries({ queryKey: ['sellerProducts', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['product', productId] })

      // Redirect to products list
      router.push('/seller/products')
    } catch (error: any) {
      console.error('Error updating product:', error)
      toast({
        variant: 'destructive',
        title: '错误',
        description: t('updateFailed') + ': ' + (error.message || tCommon('retry')),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold">{t('editProduct')}</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Product Name */}
        <Card className="p-4">
          <label className="mb-2 block text-sm font-medium">
            {t('productName')} <span className="text-destructive">*</span>
          </label>
          <Input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder={t('enterProductName')}
            className={errors.name ? 'border-destructive' : ''}
          />
          {errors.name && <p className="mt-1 text-sm text-destructive">{errors.name}</p>}
        </Card>

        {/* Product Description */}
        <Card className="p-4">
          <label className="mb-2 block text-sm font-medium">{t('productDescription')}</label>
          <Textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder={t('enterProductDescription')}
            rows={4}
          />
        </Card>

        {/* Product Details */}
        <Card className="p-4">
          <Label className="mb-2 block text-sm font-medium">
            {t('productDetails') || 'Product Details'}
          </Label>
          <Textarea
            value={formData.details}
            onChange={(e) => setFormData({ ...formData, details: e.target.value })}
            placeholder={t('productDetailsPlaceholder') || '例如：颜色、尺寸、材质等详细信息...'}
            rows={6}
          />
          <p className="mt-1 text-sm text-muted-foreground">
            {t('productDetailsHint') || '商品的详细信息，如颜色、尺寸、材质等，将显示在商品详情页面的 Details 标签页中'}
          </p>
        </Card>

        {/* FAQ */}
        <Card className="p-4">
          <Label className="mb-2 block text-sm font-medium">
            {t('productFAQ') || 'Frequently Asked Questions'}
          </Label>
          <div className="space-y-4">
            {formData.faq.map((faq, index) => (
              <div key={index} className="space-y-2 border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">FAQ {index + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const newFaq = formData.faq.filter((_, i) => i !== index)
                      setFormData({ ...formData, faq: newFaq })
                    }}
                    disabled={loading || uploading}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">问题</Label>
                  <Input
                    type="text"
                    value={faq.question}
                    onChange={(e) => {
                      const newFaq = [...formData.faq]
                      newFaq[index].question = e.target.value
                      setFormData({ ...formData, faq: newFaq })
                    }}
                    placeholder={t('faqQuestionPlaceholder') || '输入问题...'}
                    disabled={loading || uploading}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">答案</Label>
                  <Textarea
                    value={faq.answer}
                    onChange={(e) => {
                      const newFaq = [...formData.faq]
                      newFaq[index].answer = e.target.value
                      setFormData({ ...formData, faq: newFaq })
                    }}
                    placeholder={t('faqAnswerPlaceholder') || '输入答案...'}
                    rows={3}
                    disabled={loading || uploading}
                  />
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFormData({
                  ...formData,
                  faq: [...formData.faq, { question: '', answer: '' }],
                })
              }}
              disabled={loading || uploading}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('addFAQ') || '添加 FAQ'}
            </Button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('faqHint') || '添加常见问题，将显示在商品详情页面的 FAQs & Policies 标签页中'}
          </p>
        </Card>

        {/* Price and Stock */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-4">
            <label className="mb-2 block text-sm font-medium">
              {t('productPrice')} <span className="text-destructive">*</span>
            </label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              placeholder="0.00"
              className={errors.price ? 'border-destructive' : ''}
            />
            {errors.price && <p className="mt-1 text-sm text-destructive">{errors.price}</p>}
          </Card>

          <Card className="p-4">
            <label className="mb-2 block text-sm font-medium">{t('stock')}</label>
            <Input
              type="number"
              min="0"
              value={formData.stock}
              onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
              placeholder="0"
              className={errors.stock ? 'border-destructive' : ''}
            />
            {errors.stock && <p className="mt-1 text-sm text-destructive">{errors.stock}</p>}
          </Card>
        </div>

        {/* Category */}
        <Card className="p-4">
          <label className="mb-2 block text-sm font-medium">{t('category')}</label>
          <Input
            type="text"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            placeholder={t('categoryExample')}
          />
        </Card>

        {/* Image Upload */}
        <Card className="p-4">
          <div className="space-y-4">
            <label className="mb-2 block text-sm font-medium">
              商品图片 <span className="text-destructive">*</span>
            </label>
            
            {/* Existing Images */}
            {existingImages.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">现有图片</p>
                <div className="grid grid-cols-3 gap-2">
                  {existingImages.map((imageUrl, index) => (
                    <div key={index} className="relative aspect-square">
                      <img
                        src={imageUrl}
                        alt={`Existing ${index + 1}`}
                        className="h-full w-full rounded-lg object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeExistingImage(index)}
                        disabled={uploading || loading}
                        className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white hover:bg-black/70 disabled:opacity-50"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* New Image Upload */}
            <div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <Upload className="h-4 w-4" />
                <span>{t('maxImages') || '上传新图片（最多 9 张）'}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageSelect}
                  className="hidden"
                  disabled={uploading || loading}
                />
              </label>

              {errors.images && <p className="mt-1 text-sm text-destructive">{errors.images}</p>}

              {imagePreviews.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2">
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
                        disabled={uploading || loading}
                        className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white hover:bg-black/70 disabled:opacity-50"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Affiliate Settings */}
        <Card className="p-4">
          <div className="space-y-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.allow_affiliate}
                onChange={(e) => setFormData({ ...formData, allow_affiliate: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm font-medium">{t('allowAffiliate')}</span>
            </label>

            {formData.allow_affiliate && (
              <div>
                <label className="mb-2 block text-sm font-medium">
                  {t('commissionRate')} <span className="text-destructive">*</span>
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.commission_rate}
                  onChange={(e) => setFormData({ ...formData, commission_rate: e.target.value })}
                  placeholder={t('commissionRateExample')}
                  className={errors.commission_rate ? 'border-destructive' : ''}
                />
                {errors.commission_rate && (
                  <p className="mt-1 text-sm text-destructive">{errors.commission_rate}</p>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Status Info */}
        {product.status && (
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{tCommon('status')}: </span>
              <span
                className={`rounded-full px-2 py-1 text-xs ${
                  product.status === 'active'
                    ? 'bg-green-100 text-green-800'
                    : product.status === 'pending'
                    ? 'bg-yellow-100 text-yellow-800'
                    : product.status === 'sold'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {product.status === 'active'
                  ? tCommon('active')
                  : product.status === 'pending'
                  ? tCommon('pending')
                  : product.status === 'sold'
                  ? '已售罄'
                  : tCommon('inactive')}
              </span>
            </div>
          </Card>
        )}

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
