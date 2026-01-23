'use client'

import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { useCartStore } from '@/store/cartStore'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { X, Plus, Minus } from 'lucide-react'

export function ShoppingCart() {
  const router = useRouter()
  const { items, removeItem, updateQuantity, getTotal, clearCart } =
    useCartStore()
  const t = useTranslations('cart')

  const handleCheckout = () => {
    if (items.length > 0) {
      router.push('/checkout')
    }
  }

  return (
    <div className="space-y-4">
      {items.length > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={clearCart} className="flex-shrink-0">
            <span className="hidden sm:inline">{t('clearCart')}</span>
            <span className="sm:hidden">{t('clear')}</span>
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-center text-muted-foreground">{t('emptyCart')}</p>
      ) : (
        <>
          <div className="space-y-2">
            {items.map((item) => (
              <Card key={item.product_id} className="p-3 md:p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="h-16 w-16 rounded object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm sm:text-base truncate">{item.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      ¥{item.price.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-8 text-center text-sm">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => removeItem(item.product_id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">{t('total')}</span>
              <span className="text-xl font-bold">
                ¥{getTotal().toFixed(2)}
              </span>
            </div>
            <Button className="mt-4 w-full" onClick={handleCheckout}>
              {t('checkout')}
            </Button>
          </Card>
        </>
      )}
    </div>
  )
}
