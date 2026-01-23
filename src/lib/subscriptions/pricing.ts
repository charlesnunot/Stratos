/**
 * 订阅价格配置 - 新生平台定价体系
 * 基准货币 USD，多币种按汇率转换显示；支付时传目标货币，由 Stripe/PayPal 处理。
 */

import type { Currency } from '@/lib/currency/detect-currency'
import { convertCurrency } from '@/lib/currency/convert-currency'
import { formatCurrency } from '@/lib/currency/format-currency'

/** 卖家订阅档位（USD），档位值 = 月费 = 免费保证金额度 */
export const SELLER_TIERS_USD = [5, 15, 40, 80, 200] as const

/** 带货订阅月费（USD） */
export const AFFILIATE_PRICE_USD = 4.99

/** 打赏功能订阅月费（USD） */
export const TIP_PRICE_USD = 4.99

export type SubscriptionType = 'seller' | 'affiliate' | 'tip'

export interface SubscriptionPriceResult {
  amount: number
  currency: Currency
  /** 基准 USD 金额，用于存储与 downstream 逻辑 */
  amountUsd: number
}

/**
 * 获取订阅价格（含多币种转换）
 * @param type - 订阅类型
 * @param tier - 卖家档位（仅 type === 'seller' 时必填）
 * @param currency - 目标显示/支付货币，默认 USD
 */
export function getSubscriptionPrice(
  type: SubscriptionType,
  tier?: number,
  currency: Currency = 'USD'
): SubscriptionPriceResult {
  let amountUsd: number
  if (type === 'seller') {
    if (tier == null || !SELLER_TIERS_USD.includes(tier as (typeof SELLER_TIERS_USD)[number])) {
      throw new Error(`Invalid seller tier: ${tier}. Must be one of ${SELLER_TIERS_USD.join(', ')}`)
    }
    amountUsd = tier
  } else if (type === 'affiliate') {
    amountUsd = AFFILIATE_PRICE_USD
  } else if (type === 'tip') {
    amountUsd = TIP_PRICE_USD
  } else {
    throw new Error(`Invalid subscription type: ${type}`)
  }

  const amount = currency === 'USD' ? amountUsd : convertCurrency(amountUsd, 'USD', currency)
  return { amount, currency, amountUsd }
}

export interface SellerTierConfig {
  tier: number
  price: number
  depositCredit: number
  features: string[]
  recommended?: boolean
}

/**
 * 获取卖家订阅档位配置（含当前货币下的价格与文案）
 */
export function getSellerTiers(currency: Currency): SellerTierConfig[] {
  const base = [
    {
      tier: 5,
      features: [
        '免费保证金额度',
        '支持未履行订单总额上限',
        '发布和管理商品',
        '设置带货佣金',
        '管理订单',
      ],
      recommended: false,
    },
    {
      tier: 15,
      features: [
        '免费保证金额度',
        '支持未履行订单总额上限',
        '发布和管理商品',
        '设置带货佣金',
        '管理订单',
        '优先客服支持',
      ],
      recommended: true,
    },
    {
      tier: 40,
      features: [
        '免费保证金额度',
        '支持未履行订单总额上限',
        '发布和管理商品',
        '设置带货佣金',
        '管理订单',
        '优先客服支持',
        '数据分析工具',
      ],
      recommended: false,
    },
    {
      tier: 80,
      features: [
        '免费保证金额度',
        '支持未履行订单总额上限',
        '发布和管理商品',
        '设置带货佣金',
        '管理订单',
        '优先客服支持',
        '数据分析工具',
        '营销推广支持',
      ],
      recommended: false,
    },
    {
      tier: 200,
      features: [
        '免费保证金额度',
        '支持未履行订单总额上限',
        '发布和管理商品',
        '设置带货佣金',
        '管理订单',
        '优先客服支持',
        '数据分析工具',
        '营销推广支持',
        '专属客户经理',
      ],
      recommended: false,
    },
  ] as const

  return base.map((b) => {
    const { amount } = getSubscriptionPrice('seller', b.tier, currency)
    const depositStr = formatCurrency(amount, currency)
    const upperStr = formatCurrency(amount, currency)
    const features = b.features.map((f) => {
      if (f === '免费保证金额度') return `免费保证金额度: ${depositStr}`
      if (f === '支持未履行订单总额上限') return `支持未履行订单总额 ≤ ${upperStr}`
      return f
    })
    return {
      tier: b.tier,
      price: amount,
      depositCredit: amount,
      features,
      recommended: b.recommended,
    }
  })
}
