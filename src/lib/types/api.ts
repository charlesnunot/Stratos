/**
 * API-related type definitions
 * Replaces 'any' types with specific types
 */

// Order types
export interface Order {
  id: string
  order_number: string
  buyer_id: string
  seller_id: string
  product_id?: string
  quantity: number
  unit_price: number
  total_amount: number
  payment_method: 'stripe' | 'paypal' | 'alipay' | 'wechat' | 'bank' | null
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded'
  order_status: 'pending' | 'paid' | 'shipped' | 'completed' | 'cancelled'
  currency: string
  /** Snapshot at order creation: external (third-party) or direct (platform). Used for payment/refund. */
  seller_type_snapshot?: 'external' | 'direct'
  /** Where funds go: platform (direct) or seller (external). For reconciliation. */
  funds_recipient?: 'platform' | 'seller'
  shipping_address?: {
    recipientName: string
    phone: string
    country: string
    state?: string
    city: string
    address: string
    postalCode?: string
  }
  created_at: string
  updated_at: string
  expires_at?: string
  product?: {
    id: string
    name: string
    images: string[]
  }
  seller?: {
    id: string
    display_name: string
    username: string
  }
  items?: Array<{
    product_id: string
    quantity: number
    price: number
    color?: string | null
    size?: string | null
  }>
}

// Product types
export interface Product {
  id: string
  name: string
  description?: string
  details?: string
  category?: string
  price: number
  currency: string
  stock: number | null
  images: string[]
  color_options?: Array<{ name: string; image_url: string | null; image_from_index: number | null }> | null
  sizes?: string[] | null
  seller_id: string
  status: 'active' | 'inactive' | 'sold_out'
  condition?: 'new' | 'like_new' | 'ninety_five' | 'ninety' | 'eighty' | 'seventy_or_below'
  shipping_fee?: number
  sales_countries?: string[] | null
  content_lang?: string | null
  name_translated?: string | null
  description_translated?: string | null
  details_translated?: string | null
  category_translated?: string | null
  faq?: Array<{ question: string; answer: string }> | null
  faq_translated?: Array<{ question: string; answer: string }> | null
  like_count: number
  want_count: number
  share_count: number
  repost_count: number
  favorite_count: number
  seller?: {
    id: string
    username: string
    display_name: string
  }
  created_at: string
  updated_at: string
}

// Subscription types
export interface Subscription {
  id: string
  user_id: string
  subscription_type: 'seller' | 'affiliate' | 'tip'
  status: 'active' | 'expired' | 'cancelled'
  expires_at: string
  created_at: string
  updated_at: string
}

// Payment account types
export interface PaymentAccount {
  id: string
  seller_id: string | null
  account_type: 'stripe' | 'paypal' | 'alipay' | 'wechat'
  account_name: string
  account_info: Record<string, unknown>
  currency: string
  supported_currencies: string[]
  is_platform_account: boolean
  is_verified: boolean
  verification_status: 'pending' | 'verified' | 'rejected'
  status: 'active' | 'disabled'
  is_default: boolean
  created_at: string
  updated_at: string
}

// Order group types
export interface OrderGroup {
  id: string
  order_group_number: string
  buyer_id: string
  total_amount: number
  currency: string
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded'
  order_status: 'pending' | 'paid' | 'shipped' | 'completed' | 'cancelled'
  shipping_address?: Record<string, unknown>
  created_at: string
  updated_at: string
}

// Dispute types
export interface OrderDispute {
  id: string
  order_id: string
  dispute_type: 'refund' | 'quality' | 'delivery' | 'other'
  status: 'pending' | 'resolved' | 'escalated'
  resolution?: string
  resolved_by?: string
  resolved_at?: string
  created_at: string
  updated_at: string
}

// Refund types
export interface OrderRefund {
  id: string
  order_id: string
  dispute_id?: string
  refund_amount: number
  currency: string
  refund_reason: string
  refund_method: 'platform_refund' | 'stripe' | 'paypal' | 'alipay' | 'wechat'
  status: 'pending' | 'processing' | 'completed' | 'failed'
  failure_reason?: string
  created_at: string
  updated_at: string
}

// Seller debt types
export interface SellerDebt {
  id: string
  seller_id: string
  order_id?: string
  dispute_id?: string
  refund_id?: string
  debt_amount: number
  currency: string
  reason: string
  status: 'pending' | 'collected' | 'paid'
  collected_at?: string
  paid_at?: string
  created_at: string
  updated_at: string
}

// Platform payment account types
export interface PlatformPaymentAccount extends PaymentAccount {
  is_platform_account: true
  seller_id: null
}

// Profile (server/admin only for user_origin; never expose user_origin to public)
export interface ProfileOrigin {
  user_origin?: 'external' | 'internal'
  /** Admin-set; enables tip for internal users without tip subscription. Ignored for external. */
  internal_tip_enabled?: boolean
  /** Admin-set; enables affiliate for internal users without affiliate subscription. Ignored for external. */
  internal_affiliate_enabled?: boolean
}
