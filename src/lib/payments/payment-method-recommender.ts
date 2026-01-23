/**
 * Payment method recommender
 * Recommends appropriate payment methods based on user currency and seller capabilities
 */

import type { Currency } from '../currency/detect-currency'

export type PaymentMethod = 'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank'

export interface PaymentMethodRecommendation {
  method: PaymentMethod
  priority: number
  reason: string
  available: boolean
}

export interface SellerPaymentAccount {
  accountType: PaymentMethod
  currency: Currency
  supportedCurrencies: Currency[]
  isVerified: boolean
  hasStripeConnect?: boolean
}

/**
 * Recommend payment methods based on currency
 */
export function recommendPaymentMethods(
  userCurrency: Currency,
  sellerAccounts: SellerPaymentAccount[]
): PaymentMethodRecommendation[] {
  const recommendations: PaymentMethodRecommendation[] = []

  // Filter available accounts
  const availableAccounts = sellerAccounts.filter((acc) => acc.isVerified)

  // Recommendation logic based on currency
  if (userCurrency === 'CNY') {
    // Chinese users: prefer Alipay/WeChat
    const alipay = availableAccounts.find((acc) => acc.accountType === 'alipay' && acc.currency === 'CNY')
    const wechat = availableAccounts.find((acc) => acc.accountType === 'wechat' && acc.currency === 'CNY')
    const stripe = availableAccounts.find((acc) => acc.accountType === 'stripe' && acc.hasStripeConnect)

    if (alipay) {
      recommendations.push({
        method: 'alipay',
        priority: 1,
        reason: 'Recommended for Chinese users',
        available: true,
      })
    }
    if (wechat) {
      recommendations.push({
        method: 'wechat',
        priority: 2,
        reason: 'Recommended for Chinese users',
        available: true,
      })
    }
    if (stripe) {
      recommendations.push({
        method: 'stripe',
        priority: 3,
        reason: 'Supports multi-currency conversion',
        available: true,
      })
    }
  } else if (['USD', 'EUR', 'GBP'].includes(userCurrency)) {
    // International users: prefer Stripe/PayPal
    const stripe = availableAccounts.find(
      (acc) => acc.accountType === 'stripe' && (acc.currency === userCurrency || acc.hasStripeConnect)
    )
    const paypal = availableAccounts.find(
      (acc) => acc.accountType === 'paypal' && (acc.currency === userCurrency || acc.supportedCurrencies.includes(userCurrency))
    )

    if (stripe) {
      recommendations.push({
        method: 'stripe',
        priority: 1,
        reason: 'Recommended for international payments',
        available: true,
      })
    }
    if (paypal) {
      recommendations.push({
        method: 'paypal',
        priority: 2,
        reason: 'Widely accepted payment method',
        available: true,
      })
    }
  } else {
    // Other currencies: prefer Stripe (supports most currencies)
    const stripe = availableAccounts.find(
      (acc) => acc.accountType === 'stripe' && (acc.currency === userCurrency || acc.hasStripeConnect)
    )
    const paypal = availableAccounts.find(
      (acc) => acc.accountType === 'paypal' && (acc.supportedCurrencies.includes(userCurrency))
    )

    if (stripe) {
      recommendations.push({
        method: 'stripe',
        priority: 1,
        reason: 'Supports most currencies',
        available: true,
      })
    }
    if (paypal) {
      recommendations.push({
        method: 'paypal',
        priority: 2,
        reason: 'Alternative payment option',
        available: true,
      })
    }
  }

  // Sort by priority
  recommendations.sort((a, b) => a.priority - b.priority)

  return recommendations
}

/**
 * Get available payment methods for a seller
 */
export function getAvailablePaymentMethods(
  sellerAccounts: SellerPaymentAccount[],
  userCurrency: Currency
): PaymentMethod[] {
  const available = sellerAccounts
    .filter((acc) => {
      if (!acc.isVerified) return false
      // Check if account supports the currency
      return (
        acc.currency === userCurrency ||
        acc.supportedCurrencies.includes(userCurrency) ||
        (acc.accountType === 'stripe' && acc.hasStripeConnect) // Stripe Connect supports multi-currency
      )
    })
    .map((acc) => acc.accountType)

  // Remove duplicates
  return Array.from(new Set(available)) as PaymentMethod[]
}
