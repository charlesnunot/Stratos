'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useImageUpload } from '@/lib/hooks/useImageUpload'
import { useAuth } from '@/lib/hooks/useAuth'
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
import { X, Upload, Loader2, Plus, Trash2, RefreshCw } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { type Currency } from '@/lib/currency/detect-currency'
import { getDisplayContent } from '@/lib/ai/display-translated'

const CURRENCIES: Currency[] = ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD']

function adjustColorOptionsAfterRemoveImage(
  colorOptions: Array<{ name: string; image_url: string | null; image_from_index: number | null }>,
  removedCombinedIndex: number
) {
  return colorOptions.map((opt) => {
    if (opt.image_from_index === null) return opt
    if (opt.image_from_index === removedCombinedIndex)
      return { ...opt, image_from_index: null }
    if (opt.image_from_index > removedCombinedIndex)
      return { ...opt, image_from_index: opt.image_from_index - 1 }
    return opt
  })
}

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
  const locale = useLocale() as 'zh' | 'en'

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    stock: '0',
    category: '',
    currency: 'USD' as Currency,
    allow_affiliate: false,
    commission_rate: '',
    details: '',
    faq: [] as Array<{ question: string; answer: string }>,
    color_options: [] as Array<{ name: string; image_url: string | null; image_from_index: number | null }>,
    sizes: [] as string[],
    allow_search: true,
    show_to_guests: true,
    visibility: 'public' as 'public' | 'followers_only' | 'following_only' | 'self_only',
    sales_countries: [] as SalesCountryCode[],
    condition: null as string | null,
    shipping_fee: '0',
  })

  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [imageUrlInput, setImageUrlInput] = useState('')
  
  // AI Category generation
  const { runTask, loading: aiLoading, error: aiError } = useAiTask()
  const [aiCategory, setAiCategory] = useState('')
  const [isGeneratingCategory, setIsGeneratingCategory] = useState(false)
  const categoryGenerationRef = useRef<NodeJS.Timeout | null>(null)
  const didInitForm = useRef(false)

  const {
    images,
    imagePreviews,
    existingImages,
    externalUrls,
    uploading,
    handleImageSelect,
    removeImage,
    removeExistingImage,
    addExternalUrl,
    removeExternalUrl,
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
    if (product && !didInitForm.current) {
      didInitForm.current = true
      
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

      const productImages = Array.isArray(product.images) ? product.images as string[] : []
      let colorOpts: Array<{ name: string; image_url: string | null; image_from_index: number | null }> = []
      if (product.color_options && Array.isArray(product.color_options)) {
        colorOpts = (product.color_options as Array<{ name?: string; image_url?: string | null }>).map((o) => {
          const url = o?.image_url && typeof o.image_url === 'string' ? o.image_url : null
          const idx = url ? productImages.indexOf(url) : -1
          return {
            name: (o?.name && String(o.name)) || '',
            image_url: url,
            image_from_index: idx >= 0 ? idx : null,
          }
        })
      }

      // Display content based on locale and content_lang
      const displayName = getDisplayContent(
        locale,
        product.content_lang ?? null,
        product.name,
        product.name_translated
      )
      const displayDescription = getDisplayContent(
        locale,
        product.content_lang ?? null,
        product.description,
        product.description_translated
      )
      const displayDetails = getDisplayContent(
        locale,
        product.content_lang ?? null,
        product.details,
        product.details_translated
      )

      // FAQ: choose based on locale and content_lang
      let displayFaq = parsedFaq
      if (product.faq_translated && Array.isArray(product.faq_translated)) {
        const wantZh = locale === 'zh'
        const isZh = product.content_lang === 'zh' || (product.content_lang !== 'en' && parsedFaq[0]?.question?.includes('？'))
        if (wantZh !== isZh) {
          displayFaq = product.faq_translated
        }
      }

      setFormData({
        name: displayName,
        description: displayDescription,
        price: product.price?.toString() || '',
        currency: (product.currency as Currency) || 'USD',
        shipping_fee: (product.shipping_fee ?? 0).toString(),
        stock: product.stock?.toString() || '0',
        category: product.category || '',
        allow_affiliate: product.allow_affiliate || false,
        commission_rate: product.commission_rate?.toString() || '',
        details: displayDetails,
        faq: displayFaq,
        color_options: colorOpts,
        sizes: Array.isArray(product.sizes) ? (product.sizes as string[]) : (product.size ? [String(product.size)] : []),
        allow_search: product.allow_search ?? true,
        show_to_guests: product.show_to_guests ?? true,
        visibility: (product.visibility as 'public' | 'followers_only' | 'following_only' | 'self_only') || 'public',
        sales_countries: (product.sales_countries || []) as SalesCountryCode[],
        condition: product.condition ?? null,
      })
      if (product.images) {
        setExistingImages(product.images)
      }
      // Set initial AI category from existing product category
      setAiCategory(product.category || '')
    }
  }, [product])

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

    if (existingImages.length + externalUrls.length + images.length === 0) {
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

  const handleRemoveExistingImage = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      color_options: adjustColorOptionsAfterRemoveImage(prev.color_options, index),
    }))
    removeExistingImage(index)
  }

  const handleAddUrl = () => {
    addExternalUrl(imageUrlInput)
    setImageUrlInput('')
  }

  const handleRemoveExternalUrl = (index: number) => {
    const combinedIndex = existingImages.length + index
    setFormData((prev) => ({
      ...prev,
      color_options: adjustColorOptionsAfterRemoveImage(prev.color_options, combinedIndex),
    }))
    removeExternalUrl(index)
  }

  const handleRemoveNewImage = (previewIndex: number) => {
    const combinedIndex = existingImages.length + externalUrls.length + previewIndex
    setFormData((prev) => ({
      ...prev,
      color_options: adjustColorOptionsAfterRemoveImage(prev.color_options, combinedIndex),
    }))
    removeImage(previewIndex)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setLoading(true)

    try {
      const uploadedUrls = await uploadImages()

      // Import external URLs to Supabase if any
      let importedUrls: string[] = []
      const externalToImportedMap = new Map<string, string>()
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
          // Build mapping from external URL to imported URL
          externalUrls.forEach((externalUrl, index) => {
            if (importedUrls[index]) {
              externalToImportedMap.set(externalUrl, importedUrls[index])
            }
          })
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

      // Build UI order to mapped order mapping
      const uiOrder = [...existingImages, ...externalUrls, ...imagePreviews]
      const mappedOrder = [...existingImages, ...importedUrls, ...uploadedUrls]

      // Create mapping from UI index to mapped index
      const uiToMappedIndex = new Map<number, number>()
      uiOrder.forEach((url, uiIndex) => {
        // Find the corresponding URL in mappedOrder
        const mappedIndex = mappedOrder.findIndex(mappedUrl => {
          // For existing images, match directly
          if (uiIndex < existingImages.length) {
            return existingImages[uiIndex] === mappedUrl
          }
          // For external URLs, match with importedUrls
          else if (uiIndex < existingImages.length + externalUrls.length) {
            const externalIndex = uiIndex - existingImages.length
            return importedUrls[externalIndex] === mappedUrl
          }
          // For uploaded URLs, match directly
          else {
            const uploadedIndex = uiIndex - existingImages.length - externalUrls.length
            return uploadedUrls[uploadedIndex] === mappedUrl
          }
        })
        if (mappedIndex !== -1) {
          uiToMappedIndex.set(uiIndex, mappedIndex)
        }
      })

      // Replace external URLs in existingImages with imported URLs
      const cleanedExistingImages = existingImages.map(url => externalToImportedMap.get(url) ?? url)

      // Combine cleaned existing, uploaded and imported URLs
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
            } else if (o!.image_url?.trim()) {
              imageUrl = externalToImportedMap.get(o!.image_url.trim()) ?? o!.image_url.trim()
            } else {
              imageUrl = null
            }
          } else if (o!.image_url?.trim()) {
            imageUrl = externalToImportedMap.get(o!.image_url.trim()) ?? o!.image_url.trim()
          } else {
            imageUrl = null
          }
          return {
            name: String(o!.name).trim(),
            image_url: imageUrl,
          }
        })
      const sizesPayload = (formData.sizes ?? []).map((s) => s.trim()).filter(Boolean)

      // Determine if editing original or translated content
      const contentLang = (product.content_lang as 'zh' | 'en') ?? 'zh'
      const isEditingOriginal = locale === contentLang

      // Check if critical fields have changed
      const priceChanged = parseFloat(formData.price) !== (product.price ?? 0)
      const stockChanged = parseInt(formData.stock) !== (product.stock ?? 0)
      const categoryChanged = formData.category.trim() !== (product.category ?? '')
      const imagesChanged = JSON.stringify(allImageUrls) !== JSON.stringify(product.images ?? [])
      const allowAffiliateChanged = formData.allow_affiliate !== (product.allow_affiliate ?? false)
      const commissionRateChanged = formData.allow_affiliate
        ? parseFloat(formData.commission_rate) !== (product.commission_rate ?? 0)
        : product.commission_rate !== null
      const colorOptionsChanged = JSON.stringify(colorOptionsPayload) !== JSON.stringify(product.color_options ?? [])
      const sizesChanged = JSON.stringify(sizesPayload) !== JSON.stringify(product.sizes ?? [])
      const allowSearchChanged = formData.allow_search !== (product.allow_search ?? true)
      const showToGuestsChanged = formData.show_to_guests !== (product.show_to_guests ?? true)
      const visibilityChanged = formData.visibility !== (product.visibility ?? 'public')
      const salesCountriesChanged = JSON.stringify(formData.sales_countries) !== JSON.stringify(product.sales_countries ?? [])
      const conditionChanged = formData.condition !== (product.condition ?? null)
      const shippingFeeChanged = parseFloat(formData.shipping_fee) !== (product.shipping_fee ?? 0)

      const changedCriticalFields =
        priceChanged ||
        stockChanged ||
        categoryChanged ||
        imagesChanged ||
        allowAffiliateChanged ||
        commissionRateChanged ||
        colorOptionsChanged ||
        sizesChanged ||
        allowSearchChanged ||
        showToGuestsChanged ||
        visibilityChanged ||
        salesCountriesChanged ||
        conditionChanged ||
        shippingFeeChanged

      // Determine if re-review is needed
      const shouldReReview = isEditingOriginal || changedCriticalFields

      // Debug: Log condition value
      console.log('Condition being sent:', formData.condition)
      
      const processedCondition = (() => {
        const validConditions = new Set(['new', 'like_new', 'ninety_five', 'ninety', 'eighty', 'seventy_or_below'])
        const condition = formData.condition?.trim()
        const result = condition && validConditions.has(condition) ? condition : null
        console.log('Processed condition:', result)
        return result
      })()
      
      const productData: Record<string, unknown> = {
        price: parseFloat(formData.price),
        currency: formData.currency,
        shipping_fee: parseFloat(formData.shipping_fee) || 0,
        stock: parseInt(formData.stock) || 0,
        category: formData.category.trim() || null,
        images: allImageUrls,
        allow_affiliate: formData.allow_affiliate,
        commission_rate: formData.allow_affiliate && formData.commission_rate
          ? parseFloat(formData.commission_rate)
          : null,
        color_options: colorOptionsPayload,
        sizes: sizesPayload,
        size: sizesPayload[0] ?? null,
        allow_search: formData.allow_search,
        show_to_guests: formData.show_to_guests,
        visibility: formData.visibility,
        sales_countries: formData.sales_countries,
        condition: processedCondition,
        ...(shouldReReview
          ? {
              status: product.status === 'sold' ? product.status : 'pending',
              reviewed_by: product.status === 'sold' ? product.reviewed_by : null,
              reviewed_at: product.status === 'sold' ? product.reviewed_at : null,
            }
          : {}),
        ...(isEditingOriginal
          ? {
              name: formData.name.trim(),
              description: formData.description.trim() || null,
              details: formData.details.trim() || null,
              faq: formData.faq.length > 0 ? formData.faq : null,
            }
          : {
              name_translated: formData.name.trim() || null,
              description_translated: formData.description.trim() || null,
              details_translated: formData.details.trim() || null,
              faq_translated: formData.faq.length > 0 ? formData.faq : null,
            }
        ),
      }

      // Update product
      const { error: updateError } = await supabase
        .from('products')
        .update(productData)
        .eq('id', productId)
        .eq('seller_id', user.id)

      if (updateError) throw updateError

      localStorage.setItem('seller_create_sales_countries', JSON.stringify(formData.sales_countries))

      queryClient.invalidateQueries({ queryKey: ['sellerProducts', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['product', productId] })

      // Redirect to products list
      router.push('/seller/products')
    } catch (error: any) {
      console.error('Error updating product:', error)
      toast({
        variant: 'destructive',
        title: tCommon('error'),
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
            placeholder={t('productDetailsPlaceholder')}
            rows={6}
          />
          <p className="mt-1 text-sm text-muted-foreground">
            {t('productDetailsHint')}
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
                  <Label className="text-xs text-muted-foreground">{t('faqQuestion')}</Label>
                  <Input
                    type="text"
                    value={faq.question}
                    onChange={(e) => {
                      const newFaq = [...formData.faq]
                      newFaq[index].question = e.target.value
                      setFormData({ ...formData, faq: newFaq })
                    }}
                    placeholder={t('faqQuestionPlaceholder')}
                    disabled={loading || uploading}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t('faqAnswer')}</Label>
                  <Textarea
                    value={faq.answer}
                    onChange={(e) => {
                      const newFaq = [...formData.faq]
                      newFaq[index].answer = e.target.value
                      setFormData({ ...formData, faq: newFaq })
                    }}
                    placeholder={t('faqAnswerPlaceholder')}
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
              {t('addFAQ')}
            </Button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('faqHint')}
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
              {t('productImages')} <span className="text-destructive">*</span>
            </label>
            
            {/* Existing Images */}
            {existingImages.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{t('existingImages')}</p>
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
                        onClick={() => handleRemoveExistingImage(index)}
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

            {/* Image URL Input */}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{t('externalImageUrls')}</p>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={imageUrlInput}
                  onChange={(e) => setImageUrlInput(e.target.value)}
                  placeholder={t('addImageUrlPlaceholder')}
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
                        onClick={() => handleRemoveExternalUrl(idx)}
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

            {/* New Image Upload */}
            <div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <Upload className="h-4 w-4" />
                <span>{tCommon('maxImages')}</span>
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
                        onClick={() => handleRemoveNewImage(index)}
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

        {/* Color options：从商品图片选择或填写链接 */}
        <Card className="p-4">
          <Label className="mb-2 block text-sm font-medium">{t('productColorOptions')}</Label>
          <p className="mb-3 text-xs text-muted-foreground">
            {t('colorOptionsHint')}
          </p>
          <div className="space-y-3">
            {formData.color_options.map((opt, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2 rounded border p-2">
                <Input
                  placeholder={t('colorOptionName')}
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
                  {[...existingImages, ...externalUrls, ...imagePreviews].map((_, i) => (
                    <option key={i} value={i}>
                      {t('imageN', { n: i + 1 })}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder={t('colorImageOrUrl')}
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
              {t('addColorOption')}
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

        {/* Sizes：可多行添加 */}
        <Card className="p-4">
          <Label className="mb-2 block text-sm font-medium">{t('productSizes')}</Label>
          <div className="space-y-3">
            {formData.sizes.map((val, idx) => (
              <div key={idx} className="flex items-center gap-2 rounded border p-2">
                <Input
                  placeholder={t('sizeValue')}
                  value={val}
                  onChange={(e) => {
                    const next = [...formData.sizes]
                    next[idx] = e.target.value
                    setFormData({ ...formData, sizes: next })
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFormData({ ...formData, sizes: formData.sizes.filter((_, i) => i !== idx) })}
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
              onClick={() => setFormData({ ...formData, sizes: [...formData.sizes, ''] })}
              disabled={loading || uploading}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('addSize')}
            </Button>
          </div>
        </Card>

        {/* Visibility / who can see */}
        <Card className="p-4">
          <Label className="mb-2 block text-sm font-medium">{t('visibility')}</Label>
          <p className="mb-3 text-xs text-muted-foreground">{t('visibilityHint')}</p>
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.allow_search}
                onChange={(e) => setFormData({ ...formData, allow_search: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm">{t('allowSearch')}</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.show_to_guests}
                onChange={(e) => setFormData({ ...formData, show_to_guests: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm">{t('showToGuests')}</span>
            </label>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">{t('visibility')}</Label>
              <select
                value={formData.visibility}
                onChange={(e) => setFormData({ ...formData, visibility: e.target.value as typeof formData.visibility })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="public">{t('visibilityPublic')}</option>
                <option value="followers_only">{t('visibilityFollowersOnly')}</option>
                <option value="following_only">{t('visibilityFollowingOnly')}</option>
                <option value="self_only">{t('visibilitySelfOnly')}</option>
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
                  ? tCommon('sold')
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
