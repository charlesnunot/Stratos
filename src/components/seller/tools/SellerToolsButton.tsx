'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Currency } from '@/lib/currency/detect-currency'
import { SellerToolsPanel } from './SellerToolsPanel'
import { Wallet, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface SellerToolsButtonProps {
  defaultPrice?: number
  defaultCurrency?: Currency
  onPriceChange?: (price: number) => void
}

export function SellerToolsButton({
  defaultPrice = 100,
  defaultCurrency = 'USD',
  onPriceChange,
}: SellerToolsButtonProps) {
  const t = useTranslations('sellerTools')
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      {/* Floating Button - Mobile Only */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-full shadow-lg hover:bg-primary/90 transition-colors lg:hidden"
      >
        {isOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <>
            <Wallet className="h-5 w-5" />
            <span className="font-medium">{t('title')}</span>
          </>
        )}
      </button>

      {/* Mobile Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            />

            {/* Panel */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl shadow-xl lg:hidden max-h-[80vh] overflow-y-auto"
            >
              {/* Handle bar */}
              <div className="sticky top-0 bg-background pt-3 pb-2 px-4 border-b z-10">
                <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-3" />
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-lg">{t('title')}</h2>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-2 rounded-full hover:bg-muted transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="p-4">
                <SellerToolsPanel
                  defaultPrice={defaultPrice}
                  defaultCurrency={defaultCurrency}
                  onPriceChange={onPriceChange}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
