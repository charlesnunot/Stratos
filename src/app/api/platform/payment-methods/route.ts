/**
 * Get available platform payment methods
 * Returns payment methods that are enabled and verified for the platform
 * Used by subscription pages to show only available payment options
 * 
 * 多币种支持更新:
 * - 返回所有已配置的平台支付方式，即使不直接支持用户货币
 * - 前端会根据汇率自动转换货币
 * - 例如：平台只配置了PayPal(USD)，但用户可以用CNY支付，系统自动转换
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Currency } from '@/lib/currency/detect-currency'

export type PaymentMethodId = 'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank'

/** Currencies supported by each payment method natively */
const PAYMENT_METHOD_CURRENCIES: Record<PaymentMethodId, readonly Currency[]> = {
  stripe: ['USD', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD', 'CNY'],
  paypal: ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'],
  alipay: ['CNY'],
  wechat: ['CNY'],
  bank: ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD'],
}

/** 
 * 获取支付方法的平台货币
 * 用于多币种转换：用户支付货币 -> 平台收款货币
 */
function getPlatformCurrencyForMethod(method: PaymentMethodId): Currency {
  const methodCurrencies: Record<PaymentMethodId, Currency> = {
    stripe: 'USD',
    paypal: 'USD',
    alipay: 'CNY',
    wechat: 'CNY',
    bank: 'USD',
  }
  return methodCurrencies[method] || 'USD'
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const userCurrency = (searchParams.get('currency') || 'USD') as Currency

    // Get all active and verified platform payment accounts
    const { data: platformAccounts, error: accountsError } = await supabase
      .from('payment_accounts')
      .select('account_type, currency, supported_currencies')
      .eq('is_platform_account', true)
      .eq('status', 'active')
      .eq('is_verified', true)

    if (accountsError) {
      console.error('Failed to fetch platform payment accounts:', accountsError)
      return NextResponse.json(
        { error: 'Failed to fetch payment methods' },
        { status: 500 }
      )
    }

    // Get unique payment method types from platform accounts
    // 多币种支持：返回所有已配置的平台支付方式
    const enabledMethodTypes = new Set<PaymentMethodId>()
    platformAccounts?.forEach((account) => {
      const methodType = account.account_type as PaymentMethodId
      if (methodType && PAYMENT_METHOD_CURRENCIES[methodType]) {
        enabledMethodTypes.add(methodType)
      }
    })

    // 如果没有配置任何平台账户，返回默认支付方式
    if (enabledMethodTypes.size === 0) {
      // 默认返回 Stripe 和 PayPal
      return NextResponse.json({
        methods: ['stripe', 'paypal'] as PaymentMethodId[],
        currency: userCurrency,
        platformCurrency: 'USD',
        needsConversion: false,
      })
    }

    // 返回所有已配置的平台支付方式
    const availableMethods: PaymentMethodId[] = Array.from(enabledMethodTypes)

    // 确定平台收款货币（取第一个方法的货币作为默认）
    const firstMethod = availableMethods[0]
    const platformCurrency = getPlatformCurrencyForMethod(firstMethod)
    
    // 判断是否需要货币转换
    const needsConversion = userCurrency !== platformCurrency

    return NextResponse.json({
      methods: availableMethods,
      currency: userCurrency,
      platformCurrency,
      needsConversion,
    })
  } catch (error: any) {
    console.error('Get platform payment methods error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get payment methods' },
      { status: 500 }
    )
  }
}
