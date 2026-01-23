'use client'

import { ShoppingCart } from '@/components/ecommerce/ShoppingCart'
import { useTranslations } from 'next-intl'

export default function CartPage() {
  const t = useTranslations('cart')
  
  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-4">
      <h1 className="mb-4 md:mb-6 text-xl md:text-2xl font-bold">{t('pageTitle')}</h1>
      <ShoppingCart />
    </div>
  )
}
