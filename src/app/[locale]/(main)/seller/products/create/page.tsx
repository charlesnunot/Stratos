'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useSellerGuard } from '@/lib/hooks/useSellerGuard'
import { useSubscription } from '@/lib/subscription/SubscriptionContext'
import { useImageUpload } from '@/lib/hooks/useImageUpload'
import { useToast } from '@/lib/hooks/useToast'
import { useAiTask } from '@/lib/ai/useAiTask'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { SalesCountriesSelector } from '@/components/ecommerce/SalesCountriesSelector'
import { type SalesCountryCode } from '@/lib/constants/sales-countries'
import { X, Upload, Loader2, Plus, Trash2, AlertCircle, RefreshCw } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { type Currency } from '@/lib/currency/detect-currency'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SellerToolsPanel, SellerToolsButton } from '@/components/seller/tools'
import { PaymentAccountBanner, PaymentAccountStatus } from '@/components/payment/PaymentAccountBanner'
import { useQuery } from '@tanstack/react-query'

const CURRENCIES: Currency[] = ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD']

export default function CreateProductPage() {
  const router = useRouter()
  const { user, loading: authLoading, allowed } = useSellerGuard()
  const { isDirectSeller } = useSubscription()
  const supabase = createClient()
  const { toast } = useToast()
  const t = useTranslations('seller')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  
  // Set default currency based on page locale
  const defaultCurrency: Currency = locale === 'zh' ? 'CNY' : 'USD'
  
  interface FormData {
    name: string;
    description: string;
    price: string;
    stock: string;
    category: string;
    currency: Currency;
    allow_affiliate: boolean;
    commission_rate: string;
    details: string;
    faq: Array<{ question: string; answer: string }>;
    color_options: Array<{ name: string; image_url: string | null; image_from_index: number | null }>;
    sizes: string[];
    allow_search: boolean;
    show_to_guests: boolean;
    visibility: 'public' | 'followers_only' | 'following_only' | 'self_only';
    condition: string | null;
    shipping_fee: string;
    sales_countries: SalesCountryCode[];
  }
  
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    price: '',
    stock: '0',
    category: '',
    currency: defaultCurrency,
    allow_affiliate: false,
    commission_rate: '',
    details: '',
    faq: [] as Array<{ question: string; answer: string }>,
    color_options: [] as Array<{ name: string; image_url: string | null; image_from_index: number | null }>,
    sizes: [],
    allow_search: true,
    show_to_guests: true,
    visibility: 'public',
    condition: null,
    shipping_fee: '0',
    sales_countries: (() => {
      if (typeof window === 'undefined') return []
      try {
        const saved = localStorage.getItem('seller_create_sales_countries')
        if (saved) {
          const parsed = JSON.parse(saved)
          return Array.isArray(parsed) ? parsed : []
        }
      } catch {}
      return []
    })(),
  })
  
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [imageUrlInput, setImageUrlInput] = useState('')
  
  // 3档纯净模式: 商品数量限制检查 (使用 useQuery + 缓存)
  const { data: productLimitInfo, isLoading: isLoadingProductLimit } = useQuery({
    queryKey: ['productLimit', user?.id],
    queryFn: async () => {
      const response = await fetch('/api/seller/product-limit')
      if (!response.ok) throw new Error('Failed to fetch product limit')
      return response.json()
    },
    enabled: !!user && allowed,
    staleTime: 5 * 60 * 1000, // 5分钟缓存
  })
  
  // Payment account status (使用 Context 数据)
  const { data: sellerProfile } = useQuery({
    queryKey: ['sellerProfile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null
      const { data } = await supabase
        .from('profiles')
        .select('payment_provider, payment_account_id, seller_payout_eligibility')
        .eq('id', user.id)
        .single()
      return data
    },
    enabled: !!user && allowed,
  })
  
  const paymentAccountStatus: PaymentAccountStatus | null = sellerProfile ? {
    hasPaymentAccount: !!(sellerProfile.payment_provider && sellerProfile.payment_account_id),
    paymentProvider: sellerProfile.payment_provider,
    eligibility: sellerProfile.seller_payout_eligibility as PaymentAccountStatus['eligibility'],
    shouldShowBanner: true,
  } : null
  
  // AI Category generation
  const { runTask, loading: aiLoading, error: aiError } = useAiTask()
  const [aiCategory, setAiCategory] = useState('')
  const [isGeneratingCategory, setIsGeneratingCategory] = useState(false)
  const categoryGenerationRef = useRef<NodeJS.Timeout | null>(null)
  const hasUserSelectedCurrency = useRef(false)

  const {
    images,
    imagePreviews,
    externalUrls,
    uploading,
    handleImageSelect,
    removeImage,
    addExternalUrl,
    removeExternalUrl,
    uploadImages,
    totalImageCount,
  } = useImageUpload({
    bucket: 'products',
    folder: 'products',
    maxImages: 9,
  })

  // 设置默认货币
  useEffect(() => {
    if (!authLoading && user && !hasUserSelectedCurrency.current) {
      const defaultCurrency: Currency = locale === 'zh' ? 'CNY' : 'USD'
      setFormData(prev => ({ ...prev, currency: defaultCurrency }))
    }
  }, [authLoading, user, locale])

  // Auto-generate category using AI when name and description change
  useEffect(() => {
    const generateCategory = async () => {
      if (!formData.name.trim() || !formData.description.trim()) {
        return
      }

      setIsGeneratingCategory(true)
      try {
        const input = `商品名称: ${formData.name}\n商品描述: ${formData.description}`
        const result = await runTask({
          task: 'suggest_category',
          input,
        })
        if (result.result) {
          setAiCategory(result.result)
          setFormData(prev => ({ ...prev, category: result.result || '' }))
        }
      } catch (error) {
        console.error('Error generating category:', error)
      } finally {
        setIsGeneratingCategory(false)
      }
    }

    // Clear previous timeout
    if (categoryGenerationRef.current) {
      clearTimeout(categoryGenerationRef.current)
    }

    // Debounce for 500ms
    categoryGenerationRef.current = setTimeout(() => {
      generateCategory()
    }, 500)

    return () => {
      if (categoryGenerationRef.current) {
        clearTimeout(categoryGenerationRef.current)
      }
    }
  }, [formData.name, formData.description, runTask])

  const handleRegenerateCategory = async () => {
    if (!formData.name.trim() || !formData.description.trim()) {
      return
    }

    setIsGeneratingCategory(true)
    try {
      const input = `商品名称: ${formData.name}\n商品描述: ${formData.description}`
      const result = await runTask({
        task: 'suggest_category',
        input,
      })
      if (result.result) {
        setAiCategory(result.result)
        setFormData(prev => ({ ...prev, category: result.result || '' }))
      }
    } catch (error) {
      console.error('Error regenerating category:', error)
    } finally {
      setIsGeneratingCategory(false)
    }
  }

  // Hard Render Gate: 加载中
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Hard Render Gate: 未授权
  if (!allowed) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="p-6 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">{t('needSellerPermission') || '需要卖家权限'}</h2>
          <p className="text-muted-foreground mb-4">{t('needSellerPermissionDesc') || '您需要成为卖家才能创建商品'}</p>
          <Button onClick={() => router.push('/subscription/seller')}>
            {t('applyToBeSeller') || '申请成为卖家'}
          </Button>
        </Card>
      </div>
    )
  }

  // 3档纯净模式: 商品数量限制检查
  if (productLimitInfo && !productLimitInfo.canCreate && !isDirectSeller) {
    return (
      <div className="mx-auto max-w-3xl">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t('productLimitReached')}
            <br />
            {t('productLimitReachedDescription', { 
              current: productLimitInfo.currentCount, 
              limit: productLimitInfo.productLimit 
            })}
          </AlertDescription>
        </Alert>
        {productLimitInfo.nextTier && (
          <div className="mt-4 rounded-lg border p-4">
            <p className="text-sm text-muted-foreground mb-2">
              {t('upgradeSuggestion')}
            </p>
            <p className="font-medium">
              {t('upgradeToTier')} ${productLimitInfo.nextTier.displayPrice}/月
            </p>
            <p className="text-sm text-muted-foreground">
              {t('additionalProducts', { count: productLimitInfo.nextTier.additionalProducts })}
            </p>
            <Button 
              className="mt-3" 
              onClick={() => router.push('/subscription/seller')}
            >
              {t('upgradeNow')}
            </Button>
          </div>
        )}
      </div>
    )
  }

  // 检查支付账户状态 (使用 PaymentAccountBanner 组件)
  // 注意：支付账户检查现在由 PaymentAccountBanner 组件处理


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

    if (!formData.category || !formData.category.trim()) {
      newErrors.category = t('categoryRequired') || '商品分类不能为空，请确保填写商品名称和描述以生成分类'
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

  const handleAddUrl = () => {
    addExternalUrl(imageUrlInput)
    setImageUrlInput('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    // Guard: user must be authenticated
    if (!user) {
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: t('pleaseLogin') || '请先登录',
      })
      return
    }

    setLoading(true)

    try {
      // Import external URLs to Supabase if any
      let importedUrls: string[] = []
      if (externalUrls.length > 0) {
        try {
          const response = await fetch('/api/seller/upload-images-from-urls', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: externalUrls }),
          })
          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || 'Failed to import external images')
          }
          const data = await response.json()
          importedUrls = data.urls || []
        } catch (error: any) {
          console.error('Failed to import external images:', error)
          toast({
            variant: 'destructive',
            title: tCommon('error'),
            description: t('importImagesFailed') || 'Failed to import external images: ' + (error.message || tCommon('retry')),
          })
          throw error
        }
      }

      // Upload new images
      const uploadedUrls = await uploadImages()

      // Build UI order to mapped order mapping
      const uiOrder = [...externalUrls, ...imagePreviews]
      const mappedOrder = [...importedUrls, ...uploadedUrls]

      // Create mapping from UI index to mapped index
      const uiToMappedIndex = new Map<number, number>()
      uiOrder.forEach((url, uiIndex) => {
        // Find the corresponding URL in mappedOrder
        const mappedIndex = mappedOrder.findIndex(mappedUrl => {
          // For external URLs, match with importedUrls
          if (externalUrls.includes(url)) {
            const externalIndex = externalUrls.indexOf(url)
            return importedUrls[externalIndex] === mappedUrl
          }
          // For uploaded URLs, match directly
          return imagePreviews[uiIndex - externalUrls.length] === url
        })
        if (mappedIndex !== -1) {
          uiToMappedIndex.set(uiIndex, mappedIndex)
        }
      })

      // Combine uploaded and imported URLs (no external URLs remain)
      const allImageUrls = mappedOrder

      // Prepare color options data
      const colorOptionsPayload = formData.color_options
        .filter((o) => o?.name && String(o.name).trim())
        .map((o) => {
          let imageUrl: string | null
          if (o!.image_from_index != null) {
            // Get the mapped index from UI index
            const mappedIndex = uiToMappedIndex.get(o.image_from_index)
            if (mappedIndex != null && allImageUrls[mappedIndex] != null) {
              imageUrl = allImageUrls[mappedIndex]!
            } else {
              // Fallback to direct image_url if mapping fails
              imageUrl = o!.image_url?.trim() || null
            }
          } else {
            imageUrl = o!.image_url?.trim() || null
          }
          return {
            name: String(o!.name).trim(),
            image_url: imageUrl,
          }
        })

      // Prepare sizes data
      const sizesPayload = formData.sizes.map(s => s.trim()).filter(Boolean)

      // Prepare product data
      // Debug: Log condition value
      console.log('Condition being sent:', formData.condition)
      
      const processedCondition = (() => {
        const validConditions = new Set(['new', 'like_new', 'ninety_five', 'ninety', 'eighty', 'seventy_or_below'])
        const condition = formData.condition?.trim()
        const result = condition && validConditions.has(condition) ? condition : null
        console.log('Processed condition:', result)
        return result
      })()
      
      const productData: any = {
        seller_id: user.id,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        price: parseFloat(formData.price),
        shipping_fee: parseFloat(formData.shipping_fee) || 0,
        stock: parseInt(formData.stock) || 0,
        category: formData.category.trim() || null,
        currency: formData.currency,
        images: allImageUrls,
        allow_affiliate: formData.allow_affiliate,
        commission_rate: formData.allow_affiliate && formData.commission_rate
          ? parseFloat(formData.commission_rate)
          : null,
        details: formData.details.trim() || null,
        faq: formData.faq.length > 0 ? formData.faq : null,
        color_options: colorOptionsPayload,
        sizes: sizesPayload,
        allow_search: formData.allow_search,
        show_to_guests: formData.show_to_guests,
        visibility: formData.visibility,
        condition: processedCondition,
        sales_countries: formData.sales_countries,
        status: 'pending', // 待审核
      }

      // Create product
      const { data: product, error: productError } = await supabase
        .from('products')
        .insert(productData)
        .select()
        .single()

      if (productError) throw productError

      localStorage.setItem('seller_create_sales_countries', JSON.stringify(formData.sales_countries))

      toast({
        variant: 'success',
        title: t('createSuccess'),
        description: t('productCreatedPendingReview'),
      })

      // Redirect to products list after a short delay
      setTimeout(() => {
        router.push('/seller/products')
      }, 1500)
    } catch (error: any) {
      console.error('Error creating product:', error)
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: t('updateFailed') || '创建失败：' + (error.message || tCommon('retry')),
      })
    } finally {
      setLoading(false)
    }
  }

  const handlePriceChange = (price: number) => {
    setFormData(prev => ({ ...prev, price: price.toString() }))
  }

  const currentPrice = parseFloat(formData.price) || 0

  return (
    <div className="mx-auto max-w-7xl">
      {/* 支付账户状态横幅 */}
      <PaymentAccountBanner
        status={paymentAccountStatus}
        isLoading={!sellerProfile && !!user}
        namespace="seller"
      />

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main Form */}
        <div className="flex-1 lg:max-w-3xl">
          <h1 className="mb-6 text-2xl font-bold">{t('createProduct')}</h1>

          {/* 3档纯净模式: 商品数量进度条 */}
          {productLimitInfo && !isDirectSeller && (
            <Card className="p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              {t('productLimitProgress')}
            </span>
            <span className="text-sm text-muted-foreground">
              {productLimitInfo.currentCount} / {productLimitInfo.productLimit}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5">
            <div 
              className={`h-2.5 rounded-full ${
                productLimitInfo.currentCount >= productLimitInfo.productLimit 
                  ? 'bg-destructive' 
                  : productLimitInfo.currentCount >= productLimitInfo.productLimit * 0.8 
                    ? 'bg-yellow-500' 
                    : 'bg-primary'
              }`}
              style={{ 
                width: `${Math.min((productLimitInfo.currentCount / productLimitInfo.productLimit) * 100, 100)}%` 
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {t('remainingProducts', { count: productLimitInfo.remaining })}
          </p>
        </Card>
      )}

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
                  <Label className="text-xs text-muted-foreground">{t('question')}</Label>
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
                  <Label className="text-xs text-muted-foreground">{t('answer')}</Label>
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
            {errors.price && <p className="mt-1 text-sm text-destructive">{errors.price}</p>}
          </Card>

          <Card className="p-4">
            <label className="mb-2 block text-sm font-medium">
              {t('currency')} <span className="text-destructive">*</span>
            </label>
            <select
              value={formData.currency}
              onChange={(e) => {
                hasUserSelectedCurrency.current = true
                setFormData({ ...formData, currency: e.target.value as Currency })
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {CURRENCIES.map((curr) => (
                <option key={curr} value={curr}>
                  {curr}
                </option>
              ))}
            </select>
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

          <Card className="p-4">
            <label className="mb-2 block text-sm font-medium">{t('shippingFee')}</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={formData.shipping_fee}
              onChange={(e) => setFormData({ ...formData, shipping_fee: e.target.value })}
              placeholder={t('shippingFeePlaceholder')}
              className={errors.shipping_fee ? 'border-destructive' : ''}
              disabled={loading || uploading}
            />
            {errors.shipping_fee && <p className="mt-1 text-sm text-destructive">{errors.shipping_fee}</p>}
          </Card>
        </div>

        {/* AI Category */}
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-sm font-medium">{t('aiCategory')}</label>
            <button
              type="button"
              onClick={handleRegenerateCategory}
              disabled={isGeneratingCategory || !formData.name.trim() || !formData.description.trim()}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {isGeneratingCategory ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {t('aiCategoryRegenerate')}
            </button>
          </div>
          {isGeneratingCategory && !aiCategory ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('aiCategoryGenerating')}
            </div>
          ) : aiCategory ? (
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-muted px-3 py-1.5 text-sm font-medium">
                {aiCategory}
              </span>
              <span className="text-xs text-muted-foreground">{t('aiCategoryHint')}</span>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {formData.name.trim() && formData.description.trim()
                ? t('aiCategoryGenerating')
                : t('aiCategoryHint')}
            </div>
          )}
          {aiError && (
            <p className="mt-1 text-sm text-destructive">{t('aiCategoryError')}</p>
          )}
          {errors.category && (
            <p className="mt-1 text-sm text-destructive">{errors.category}</p>
          )}
        </Card>

        {/* Image Upload */}
        <Card className="p-4">
          <div className="space-y-4">
            <label className="mb-2 block text-sm font-medium">
              {tCommon('image')} <span className="text-destructive">*</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Upload className="h-4 w-4" />
              <span>{tCommon('maxImages') || '上传图片（最多 9 张）'}</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageSelect}
                className="hidden"
                disabled={uploading || loading}
              />
            </label>

            {/* Image URL Input */}
            <div className="flex gap-2">
              <Input
                type="text"
                value={imageUrlInput}
                onChange={(e) => setImageUrlInput(e.target.value)}
                placeholder={t('addImageUrlPlaceholder') || "输入图片 URL"}
                className="flex-1"
                disabled={uploading || loading}
              />
              <Button
                type="button"
                onClick={handleAddUrl}
                disabled={uploading || loading}
              >
                {t('addImageUrl')}
              </Button>
            </div>

            {/* External URLs List */}
            {externalUrls.length > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {externalUrls.map((url, idx) => (
                  <div key={idx} className="relative aspect-square">
                    <img
                      src={url}
                      alt={`External ${idx + 1}`}
                      className="h-full w-full rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeExternalUrl(idx)}
                      disabled={uploading || loading}
                      className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white hover:bg-black/70 disabled:opacity-50"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

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

        {/* Color options */}
        <Card className="p-4">
          <Label className="mb-2 block text-sm font-medium">{t('productColorOptions') || '颜色选项'}</Label>
          <p className="mb-3 text-xs text-muted-foreground">
            {t('colorOptionsHint')}
          </p>
          <div className="space-y-3">
            {formData.color_options.map((opt, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2 rounded border p-2">
                <Input
                  placeholder={t('colorOptionName') || '颜色名称'}
                  value={opt.name}
                  onChange={(e) => {
                    const next = [...formData.color_options]
                    next[idx] = { ...next[idx]!, name: e.target.value }
                    setFormData({ ...formData, color_options: next })
                  }}
                  className="w-28"
                />
                <select
                  value={opt.image_from_index != null ? String(opt.image_from_index) : ''}
                  onChange={(e) => {
                    const next = [...formData.color_options]
                    const v = e.target.value
                    next[idx] = {
                      ...next[idx]!,
                      image_from_index: v === '' ? null : parseInt(v, 10),
                      image_url: v === '' ? next[idx]!.image_url : null,
                    }
                    setFormData({ ...formData, color_options: next })
                  }}
                  className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">—</option>
                  {[...externalUrls, ...imagePreviews].map((_, i) => (
                    <option key={i} value={i}>
                      图片 {i + 1}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder={t('colorImageOrUrl') || '图片 URL'}
                  value={opt.image_url ?? ''}
                  onChange={(e) => {
                    const next = [...formData.color_options]
                    next[idx] = {
                      ...next[idx]!,
                      image_url: e.target.value || null,
                      image_from_index: e.target.value ? null : next[idx]!.image_from_index,
                    }
                    setFormData({ ...formData, color_options: next })
                  }}
                  className="min-w-[180px] flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFormData({
                      ...formData,
                      color_options: formData.color_options.filter((_, i) => i !== idx),
                    })
                  }}
                  disabled={loading || uploading}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setFormData({
                  ...formData,
                  color_options: [
                    ...formData.color_options,
                    { name: '', image_url: null, image_from_index: null },
                  ],
                })
              }
              disabled={loading || uploading}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('addColorOption') || '添加颜色选项'}
            </Button>
          </div>
        </Card>

        {/* Condition */}
        <Card className="p-4">
          <Label className="mb-2 block text-sm font-medium">{t('condition') || '成色'}</Label>
          <select
            value={formData.condition || ''}
            onChange={(e) => setFormData({ ...formData, condition: e.target.value || null })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={loading || uploading}
          >
            <option value="">—</option>
            <option value="new">{t('conditionNew') || '全新'}</option>
            <option value="like_new">{t('conditionLikeNew') || '99新'}</option>
            <option value="ninety_five">{t('conditionNinetyFive') || '95新'}</option>
            <option value="ninety">{t('conditionNinety') || '9成新'}</option>
            <option value="eighty">{t('conditionEighty') || '8成新'}</option>
            <option value="seventy_or_below">{t('conditionSeventyOrBelow') || '7成新及以下'}</option>
          </select>
        </Card>

        {/* Size options */}
        <Card className="p-4">
          <Label className="mb-2 block text-sm font-medium">{t('productSizes') || '尺寸选项'}</Label>
          <div className="space-y-3">
            {formData.sizes.map((size, idx) => (
              <div key={idx} className="flex items-center gap-2 rounded border p-2">
                <Input
                  placeholder={t('sizeValue') || '尺寸值'}
                  value={size}
                  onChange={(e) => {
                    const next = [...formData.sizes]
                    next[idx] = e.target.value
                    setFormData({ ...formData, sizes: next })
                  }}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFormData({
                      ...formData,
                      sizes: formData.sizes.filter((_, i) => i !== idx),
                    })
                  }}
                  disabled={loading || uploading}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setFormData({
                  ...formData,
                  sizes: [...formData.sizes, ''],
                })
              }
              disabled={loading || uploading}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('addSize') || '添加尺寸'}
            </Button>
          </div>
        </Card>

        {/* Visibility Settings */}
        <Card className="p-4">
          <Label className="mb-4 block text-sm font-medium">{t('visibility') || '商品可见性'}</Label>
          <div className="space-y-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.allow_search}
                onChange={(e) => setFormData({ ...formData, allow_search: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm">{t('allowSearch') || '在搜索中展示'}</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.show_to_guests}
                onChange={(e) => setFormData({ ...formData, show_to_guests: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm">{t('showToGuests') || '未登录用户可见'}</span>
            </label>

            <div>
              <label className="mb-2 block text-sm font-medium">
                {t('visibility') || '可见范围'}
              </label>
              <select
                value={formData.visibility}
                onChange={(e) => setFormData({ ...formData, visibility: e.target.value as any })}
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="public">{t('visibilityPublic') || '所有人可见'}</option>
                <option value="followers_only">{t('visibilityFollowersOnly') || '仅粉丝可见'}</option>
                <option value="following_only">{t('visibilityFollowingOnly') || '仅关注的人可见'}</option>
                <option value="self_only">{t('visibilitySelfOnly') || '仅自己可见'}</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Sales Countries */}
        <div>
          <Label className="mb-2 block text-sm font-medium">{t('salesCountries')}</Label>
          <p className="mb-3 text-xs text-muted-foreground">{t('salesCountriesHint')}</p>
          <SalesCountriesSelector
            value={formData.sales_countries}
            onChange={(countries) => setFormData({ ...formData, sales_countries: countries })}
            disabled={loading || uploading}
          />
        </div>

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

        {/* Desktop Sidebar - Seller Tools */}
        <div className="hidden lg:block w-80 shrink-0">
          <div className="sticky top-6">
            <SellerToolsPanel
              defaultPrice={currentPrice}
              defaultCurrency={formData.currency}
              onPriceChange={handlePriceChange}
            />
          </div>
        </div>
      </div>

      {/* Mobile Floating Button - Seller Tools */}
      <SellerToolsButton
        defaultPrice={currentPrice}
        defaultCurrency={formData.currency}
        onPriceChange={handlePriceChange}
      />
    </div>
  )
}
