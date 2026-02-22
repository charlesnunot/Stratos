/**
 * Payment method ↔ currency support.
 * Used to filter payment methods by display currency and to validate before creating payment.
 */

import type { Currency } from '@/lib/currency/detect-currency'

export type PaymentMethodId = 'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank'

/** Currencies supported by each payment method (gateway docs). PayPal does not support CNY as payment currency. */
const PAYMENT_METHOD_CURRENCIES: Record<PaymentMethodId, readonly Currency[]> = {
  stripe: ['USD', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD', 'CNY'],
  paypal: ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'],
  alipay: ['CNY'],
  wechat: ['CNY'],
  bank: ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD'],
}

/** Default settlement currency when display currency is not supported by the method. */
const DEFAULT_SETTLEMENT_CURRENCY: Record<PaymentMethodId, Currency> = {
  stripe: 'USD',
  paypal: 'USD',
  alipay: 'CNY',
  wechat: 'CNY',
  bank: 'USD',
}

/**
 * Returns payment methods that support the given currency.
 * Use for frontend filtering and default selection.
 */
export function getPaymentMethodsForCurrency(currency: Currency): PaymentMethodId[] {
  const all: PaymentMethodId[] = ['stripe', 'paypal', 'alipay', 'wechat', 'bank']
  return all.filter((method) => PAYMENT_METHOD_CURRENCIES[method].includes(currency))
}

/**
 * Returns whether the given payment method supports the given currency.
 * Use for backend validation before creating payment.
 */
export function isCurrencySupportedByPaymentMethod(
  currency: Currency,
  method: PaymentMethodId
): boolean {
  return (PAYMENT_METHOD_CURRENCIES[method] as readonly string[]).includes(currency)
}

/**
 * Returns the settlement currency for a payment method and optional display currency.
 * If displayCurrency is supported by the method, returns it; otherwise returns the method's default (e.g. USD for PayPal).
 * Reserved for strategy B (display → settlement conversion).
 */
export function getSettlementCurrency(
  method: PaymentMethodId,
  displayCurrency?: Currency
): Currency {
  if (displayCurrency && isCurrencySupportedByPaymentMethod(displayCurrency, method)) {
    return displayCurrency
  }
  return DEFAULT_SETTLEMENT_CURRENCY[method]
}
