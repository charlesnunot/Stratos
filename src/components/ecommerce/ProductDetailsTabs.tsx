'use client'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

interface ProductDetailsTabsProps {
  productId: string
  productDetails?: string | null
  productFaq?: Array<{ question: string; answer: string }> | null
  sellerId: string
}

export function ProductDetailsTabs({
  productId,
  productDetails,
  productFaq,
  sellerId,
}: ProductDetailsTabsProps) {
  const supabase = createClient()
  const t = useTranslations('products')

  // 获取卖家政策
  const { data: sellerProfile, isLoading: sellerLoading } = useQuery({
    queryKey: ['sellerProfile', sellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('return_policy, exchange_policy, shipping_policy, contact_info')
        .eq('id', sellerId)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!sellerId,
  })

  const hasDetails = productDetails && productDetails.trim().length > 0
  const hasFaq = productFaq && Array.isArray(productFaq) && productFaq.length > 0
  const hasPolicies =
    sellerProfile &&
    (sellerProfile.return_policy ||
      sellerProfile.exchange_policy ||
      sellerProfile.shipping_policy ||
      sellerProfile.contact_info)

  // 如果没有内容，不显示标签页
  if (!hasDetails && !hasFaq && !hasPolicies) {
    return null
  }

  return (
    <Card className="p-6 mt-8">
      <Tabs defaultValue="details" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="details">{t('details') || 'Details'}</TabsTrigger>
          <TabsTrigger value="faqs-policies">
            {t('faqsAndPolicies') || 'FAQs & Policies'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-4">
          {hasDetails ? (
            <div className="prose prose-sm max-w-none">
              <pre className="whitespace-pre-wrap font-sans text-sm text-foreground">
                {productDetails}
              </pre>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('noDetails') || 'No details available for this product.'}
            </p>
          )}
        </TabsContent>

        <TabsContent value="faqs-policies" className="mt-4 space-y-6">
          {/* FAQ 部分 */}
          {hasFaq && (
            <div>
              <h3 className="text-lg font-semibold mb-4">
                {t('frequentlyAskedQuestions') || 'Frequently Asked Questions'}
              </h3>
              <div className="space-y-4">
                {productFaq.map((faq, index) => (
                  <div key={index} className="border-b pb-4 last:border-b-0">
                    <h4 className="font-medium mb-2">{faq.question}</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {faq.answer}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 卖家政策部分 */}
          {sellerLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : hasPolicies ? (
            <div>
              <h3 className="text-lg font-semibold mb-4">
                {t('storePolicies') || 'Store Policies'}
              </h3>
              <div className="space-y-4">
                {sellerProfile?.return_policy && (
                  <div>
                    <h4 className="font-medium mb-2">
                      {t('returnPolicy') || 'Return Policy'}
                    </h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {sellerProfile.return_policy}
                    </p>
                  </div>
                )}

                {sellerProfile?.exchange_policy && (
                  <div>
                    <h4 className="font-medium mb-2">
                      {t('exchangePolicy') || 'Exchange Policy'}
                    </h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {sellerProfile.exchange_policy}
                    </p>
                  </div>
                )}

                {sellerProfile?.shipping_policy && (
                  <div>
                    <h4 className="font-medium mb-2">
                      {t('shippingPolicy') || 'Shipping Policy'}
                    </h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {sellerProfile.shipping_policy}
                    </p>
                  </div>
                )}

                {sellerProfile?.contact_info && (
                  <div>
                    <h4 className="font-medium mb-2">
                      {t('contactInfo') || 'Contact Information'}
                    </h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {sellerProfile.contact_info}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {!hasFaq && !hasPolicies && (
            <p className="text-sm text-muted-foreground">
              {t('noFaqsOrPolicies') || 'No FAQs or policies available.'}
            </p>
          )}
        </TabsContent>
      </Tabs>
    </Card>
  )
}
