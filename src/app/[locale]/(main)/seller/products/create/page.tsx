'use client'

import { useState, useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { useImageUpload } from '@/lib/hooks/useImageUpload'
import { useToast } from '@/lib/hooks/useToast'
import { createClient } from '@/lib/supabase/client'
import { logAudit } from '@/lib/api/audit'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { X, Upload, Loader2, Plus, Trash2, AlertCircle, Sparkles } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { detectCurrency, type Currency } from '@/lib/currency/detect-currency'
import { useAiTask } from '@/lib/ai/useAiTask'
import { Alert, AlertDescription } from '@/components/ui/alert'

const CURRENCIES: Currency[] = ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD']

export default function CreateProductPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()
  const { toast } = useToast()
  const t = useTranslations('seller')
  const tCommon = useTranslations('common')
  const tAi = useTranslations('ai')
  const locale = useLocale()
  const contentLang = locale === 'zh' ? 'zh' : 'en'
  const { runTask, loading: aiLoading } = useAiTask()
  const defaultCurrency = detectCurrency({ browserLocale: locale })

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    stock: '0',
    category: '',
    currency: defaultCurrency as Currency,
    allow_affiliate: false,
    commission_rate: '',
    details: '',
    faq: [] as Array<{ question: string; answer: string }>,
  })
  
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [hasSellerSubscription, setHasSellerSubscription] = useState<boolean | null>(null)
  const [checkingSubscription, setCheckingSubscription] = useState(true)

  const {
    images,
    imagePreviews,
    uploading,
    handleImageSelect,
    removeImage,
    uploadImages,
    totalImageCount,
  } = useImageUpload({
    bucket: 'products',
    folder: 'products',
    maxImages: 9,
  })

  // Check seller subscription status
  useEffect(() => {
    const checkSellerSubscription = async () => {
      if (!user) {
        setCheckingSubscription(false)
        return
      }

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('subscription_type, subscription_expires_at')
          .eq('id', user.id)
          .single()

        if (profile) {
          const hasActiveSubscription = 
            profile.subscription_type === 'seller' &&
            profile.subscription_expires_at &&
            new Date(profile.subscription_expires_at) > new Date()
          
          setHasSellerSubscription(hasActiveSubscription)
          
          if (!hasActiveSubscription) {
            toast({
              variant: 'destructive',
              title: '需要卖家订阅',
              description: '您需要订阅卖家功能才能创建商品。',
            })
            router.push('/subscription/seller')
          }
        } else {
          setHasSellerSubscription(false)
        }
      } catch (error) {
        console.error('Error checking subscription:', error)
        setHasSellerSubscription(false)
      } finally {
        setCheckingSubscription(false)
      }
    }

    if (!authLoading && user) {
      checkSellerSubscription()
    }
  }, [authLoading, user, router, supabase, toast])

  // Wait for auth to load before checking user
  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?redirect=${encodeURIComponent('/seller/products/create')}`)
    }
  }, [authLoading, user, router])

  if (authLoading || checkingSubscription) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  if (hasSellerSubscription === false) {
    return (
      <div className="mx-auto max-w-3xl">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            您需要订阅卖家功能才能创建商品。请先订阅卖家功能。
          </AlertDescription>
        </Alert>
        <div className="mt-4">
          <Button onClick={() => router.push('/subscription/seller')}>
            前往订阅页面
          </Button>
        </div>
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

    if (totalImageCount === 0) {
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
      // Upload images
      const imageUrls = await uploadImages()

      // Prepare product data（content_lang 先用页面语言，审核通过时翻译接口会检测并修正）
      const productData: any = {
        seller_id: user.id,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        content_lang: (formData.name.trim() || formData.description.trim()) ? contentLang : null,
        price: parseFloat(formData.price),
        stock: parseInt(formData.stock) || 0,
        category: formData.category.trim() || null,
        currency: formData.currency,
        images: imageUrls,
        allow_affiliate: formData.allow_affiliate,
        commission_rate: formData.allow_affiliate && formData.commission_rate
          ? parseFloat(formData.commission_rate)
          : null,
        details: formData.details.trim() || null,
        faq: formData.faq.length > 0 ? formData.faq : null,
        status: 'pending', // 待审核
      }

      // Create product
      const { data: product, error: productError } = await supabase
        .from('products')
        .insert(productData)
        .select()
        .single()

      if (productError) throw productError

      logAudit({
        action: 'create_product',
        userId: user.id,
        resourceId: product.id,
        resourceType: 'product',
        result: 'success',
        timestamp: new Date().toISOString(),
      })

      // 自动翻译改为审核通过后触发，避免未通过审核时浪费 AI 资源

      // Show success message
      toast({
        variant: 'success',
        title: '创建成功',
        description: '商品已创建，正在等待审核。',
      })

      // Redirect to products list after a short delay
      setTimeout(() => {
        router.push('/seller/products')
      }, 1500)
    } catch (error: any) {
      console.error('Error creating product:', error)
      toast({
        variant: 'destructive',
        title: '错误',
        description: t('updateFailed') || '创建失败：' + (error.message || '请稍后重试'),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold">{t('createProduct')}</h1>

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

        <Alert className="text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          <AlertDescription>{t('autoTranslateHint')}</AlertDescription>
        </Alert>

        {/* Product Details */}
        <Card className="p-4">
          <Label className="mb-2 block text-sm font-medium">
            {t('productDetails') || '商品详情'}
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
            {t('productFAQ') || '常见问题 (FAQ)'}
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

        {/* Price, Currency and Stock */}
        <div className="grid gap-4 md:grid-cols-3">
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
            <p className="mt-1 text-xs text-muted-foreground">{t('priceUnitHint')}</p>
            {errors.price && <p className="mt-1 text-sm text-destructive">{errors.price}</p>}
          </Card>

          <Card className="p-4">
            <label className="mb-2 block text-sm font-medium">
              {t('currency')} <span className="text-destructive">*</span>
            </label>
            <select
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value as Currency })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {CURRENCIES.map((curr) => (
                <option key={curr} value={curr}>
                  {curr}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">{t('currencyHint')}</p>
          </Card>

          <Card className="p-4">
            <label className="mb-2 block text-sm font-medium">{t('productStock')}</label>
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
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="text-sm font-medium">{t('category')}</label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!(formData.name.trim() || formData.description.trim()) || aiLoading}
              onClick={async () => {
                const input = [formData.name, formData.description].filter(Boolean).join('\n')
                if (!input.trim()) return
                try {
                  const { result } = await runTask({ task: 'suggest_category', input })
                  if (result?.trim()) {
                    setFormData((prev) => ({ ...prev, category: result.trim() }))
                    toast({ variant: 'success', title: tCommon('success') })
                  }
                } catch {
                  toast({ variant: 'destructive', title: tCommon('error'), description: tAi('failed') })
                }
              }}
            >
              {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
              {tAi('suggestCategory')}
            </Button>
          </div>
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
              {tCommon('image')} <span className="text-destructive">*</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Upload className="h-4 w-4" />
              <span>{t('maxImages') || '上传图片（最多 9 张）'}</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageSelect}
                className="hidden"
                disabled={uploading || loading}
              />
            </label>

            {errors.images && <p className="text-sm text-destructive">{errors.images}</p>}

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
              t('createProduct')
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
