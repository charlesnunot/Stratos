/**
 * 订阅价格配置 - 3档纯净模式
 * 基准货币 USD，多币种按汇率转换显示；支付时传目标货币，由 Stripe/PayPal 处理。
 * 
 * 档位说明：
 * - Starter ($15): 适合个人/兼职卖家，50个商品
 * - Growth ($49): 性价比最优，200个商品，推荐档位
 * - Scale ($99): 适合品牌商/企业，500个商品
 */

import type { Currency } from '@/lib/currency/detect-currency'
import { convertCurrency } from '@/lib/currency/convert-currency'
import { formatCurrency } from '@/lib/currency/format-currency'

/** 卖家订阅档位（USD）- 3档纯净模式 */
export const SELLER_TIERS_USD = [15, 50, 100] as const

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
 * 卖家档位详细配置
 */
export interface SellerTierDetail {
  /** 内部 tier 值（与保证金额度相同） */
  tier: number
  /** 显示价格（可能不同于 tier 值，如 Growth 显示 $49 但 tier 是 50） */
  displayPrice: number
  /** 商品数量限制 */
  productLimit: number
  /** 档位名称 */
  name: string
  /** 副标题 */
  subtitle: string
  /** 是否推荐档位 */
  recommended: boolean
  /** 功能分组 */
  featureGroups: FeatureGroup[]
}

export interface FeatureGroup {
  title: string
  features: string[]
}

/**
 * 3档详细配置
 */
export const SELLER_TIER_DETAILS: Record<number, SellerTierDetail> = {
  15: {
    tier: 15,
    displayPrice: 15,
    productLimit: 50,
    name: 'Starter',
    subtitle: '适合个人/兼职卖家',
    recommended: false,
    featureGroups: [
      {
        title: '基础功能',
        features: [
          '零佣金，货款直达',
          '即时聊天工具',
          '基础订单管理',
          '标准客服支持',
        ],
      },
      {
        title: '商品管理',
        features: ['最多发布 50 个商品'],
      },
    ],
  },
  50: {
    tier: 50,
    displayPrice: 49,
    productLimit: 200,
    name: 'Growth',
    subtitle: '性价比最优选择',
    recommended: true,
    featureGroups: [
      {
        title: '基础功能',
        features: [
          '零佣金，货款直达',
          '即时聊天工具',
          '高级订单管理',
          '优先客服支持（6小时内响应）',
        ],
      },
      {
        title: '商品管理',
        features: [
          '最多发布 200 个商品',
          '批量导入/导出',
          '商品数据分析',
        ],
      },
      {
        title: '营销工具',
        features: ['带货佣金设置', '基础推广工具'],
      },
    ],
  },
  100: {
    tier: 100,
    displayPrice: 99,
    productLimit: 500,
    name: 'Scale',
    subtitle: '适合品牌商/企业',
    recommended: false,
    featureGroups: [
      {
        title: '基础功能',
        features: [
          '零佣金，货款直达',
          '即时聊天工具',
          '高级订单管理',
          '专属客户经理（2小时内响应）',
        ],
      },
      {
        title: '商品管理',
        features: [
          '最多发布 500 个商品',
          '批量导入/导出',
          '深度数据分析报表',
          '库存预警',
        ],
      },
      {
        title: '营销工具',
        features: [
          '高级带货佣金设置',
          '首页商品推荐位',
          '品牌专属展示页面',
          '全渠道复购分析',
        ],
      },
    ],
  },
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

/**
 * 获取显示价格（用于前端展示，可能包含折扣）
 * @param tier - 内部 tier 值
 * @param currency - 货币
 * @param isFirstMonth - 是否首月（应用折扣）
 */
export function getDisplayPrice(
  tier: number,
  currency: Currency = 'USD',
  isFirstMonth: boolean = false
): { original: number; discounted: number | null } {
  const detail = SELLER_TIER_DETAILS[tier]
  if (!detail) {
    throw new Error(`Invalid tier: ${tier}`)
  }

  const original = currency === 'USD' 
    ? detail.displayPrice 
    : convertCurrency(detail.displayPrice, 'USD', currency)

  // 首月 50% 折扣
  if (isFirstMonth) {
    return {
      original,
      discounted: Math.round(original * 0.5 * 100) / 100,
    }
  }

  return { original, discounted: null }
}

export interface SellerTierConfig {
  tier: number
  price: number
  depositCredit: number
  features: string[]
  recommended?: boolean
  name?: string
  subtitle?: string
  productLimit?: number
  displayPrice: number
  featureGroups?: FeatureGroup[]
}

/**
 * 获取卖家订阅档位配置（含当前货币下的价格与文案）
 * 兼容旧接口，用于 TieredSubscriptionCard 组件
 */
export function getSellerTiers(currency: Currency): SellerTierConfig[] {
  return SELLER_TIERS_USD.map((tier) => {
    const detail = SELLER_TIER_DETAILS[tier]
    const { amount } = getSubscriptionPrice('seller', tier, currency)
    const displayAmount = currency === 'USD'
      ? detail.displayPrice
      : convertCurrency(detail.displayPrice, 'USD', currency)

    // 扁平化功能列表（用于旧组件兼容）
    const flatFeatures: string[] = []
    detail.featureGroups.forEach((group) => {
      flatFeatures.push(`${group.title}:`)
      group.features.forEach((f) => {
        if (f.includes('商品') || f.includes('products')) {
          flatFeatures.push(`  • ${f.replace(/\d+/, detail.productLimit.toString())}`)
        } else {
          flatFeatures.push(`  • ${f}`)
        }
      })
    })

    return {
      tier,
      price: amount,
      depositCredit: amount,
      features: flatFeatures,
      featureGroups: detail.featureGroups,
      recommended: detail.recommended,
      name: detail.name,
      subtitle: detail.subtitle,
      productLimit: detail.productLimit,
      displayPrice: displayAmount,
    }
  })
}

/**
 * 根据 tier 获取商品数量限制
 */
export function getProductLimit(tier: number): number {
  return SELLER_TIER_DETAILS[tier]?.productLimit || 0
}

/**
 * 检查 tier 是否有效
 */
export function isValidSellerTier(tier: number): boolean {
  return SELLER_TIERS_USD.includes(tier as (typeof SELLER_TIERS_USD)[number])
}
