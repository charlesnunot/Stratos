export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserOrigin = 'external' | 'internal'
export type PayoutEligibility = 'eligible' | 'blocked' | 'pending_review'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string | null
          display_name: string | null
          avatar_url: string | null
          bio: string | null
          location: string | null
          language: string
          follower_count: number
          following_count: number
          role: string
          subscription_type: string | null
          subscription_expires_at: string | null
          status: string
          created_at: string
          updated_at: string
          seller_type: string | null
          product_limit: number | null
          subscription_tier: number | null
          user_origin: UserOrigin | null
          internal_tip_enabled: boolean | null
          internal_affiliate_enabled: boolean | null
          seller_subscription_active: boolean | null
          seller_subscription_expires_at: string | null
          seller_subscription_tier: number | null
          affiliate_subscription_active: boolean | null
          affiliate_subscription_expires_at: string | null
          tip_enabled: boolean | null
          tip_subscription_active: boolean | null
          tip_subscription_expires_at: string | null
          payment_provider: string | null
          payment_account_id: string | null
          seller_payout_eligibility: PayoutEligibility | null
        }
        Insert: {
          id: string
          username?: string | null
          display_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          location?: string | null
          language?: string
          follower_count?: number
          following_count?: number
          role?: string
          subscription_type?: string | null
          subscription_expires_at?: string | null
          status?: string
          created_at?: string
          updated_at?: string
          seller_type?: string | null
          product_limit?: number | null
          subscription_tier?: number | null
          user_origin?: UserOrigin | null
          internal_tip_enabled?: boolean | null
          internal_affiliate_enabled?: boolean | null
          seller_subscription_active?: boolean | null
          seller_subscription_expires_at?: string | null
          seller_subscription_tier?: number | null
          affiliate_subscription_active?: boolean | null
          affiliate_subscription_expires_at?: string | null
          tip_enabled?: boolean | null
          tip_subscription_active?: boolean | null
          tip_subscription_expires_at?: string | null
          payment_provider?: string | null
          payment_account_id?: string | null
          seller_payout_eligibility?: PayoutEligibility | null
        }
        Update: {
          id?: string
          username?: string | null
          display_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          location?: string | null
          language?: string
          follower_count?: number
          following_count?: number
          role?: string
          subscription_type?: string | null
          subscription_expires_at?: string | null
          status?: string
          created_at?: string
          updated_at?: string
          seller_type?: string | null
          product_limit?: number | null
          subscription_tier?: number | null
          user_origin?: UserOrigin | null
          internal_tip_enabled?: boolean | null
          internal_affiliate_enabled?: boolean | null
          seller_subscription_active?: boolean | null
          seller_subscription_expires_at?: string | null
          seller_subscription_tier?: number | null
          affiliate_subscription_active?: boolean | null
          affiliate_subscription_expires_at?: string | null
          tip_enabled?: boolean | null
          tip_subscription_active?: boolean | null
          tip_subscription_expires_at?: string | null
          payment_provider?: string | null
          payment_account_id?: string | null
          seller_payout_eligibility?: PayoutEligibility | null
        }
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          subscription_type: string
          subscription_tier: number | null
          payment_method: string
          payment_account_id: string | null
          amount: number
          currency: string | null
          status: string
          starts_at: string
          expires_at: string
          created_at: string
          // 3档纯净模式新增字段
          display_price: number | null
          product_limit: number | null
          is_discounted: boolean | null
          discount_expiry_date: string | null
          deposit_credit: number | null
        }
        Insert: {
          id?: string
          user_id: string
          subscription_type: string
          subscription_tier?: number | null
          payment_method: string
          payment_account_id?: string | null
          amount: number
          currency?: string | null
          status?: string
          starts_at: string
          expires_at: string
          created_at?: string
          // 3档纯净模式新增字段
          display_price?: number | null
          product_limit?: number | null
          is_discounted?: boolean | null
          discount_expiry_date?: string | null
          deposit_credit?: number | null
        }
        Update: {
          id?: string
          user_id?: string
          subscription_type?: string
          subscription_tier?: number | null
          payment_method?: string
          payment_account_id?: string | null
          amount?: number
          currency?: string | null
          status?: string
          starts_at?: string
          expires_at?: string
          created_at?: string
          // 3档纯净模式新增字段
          display_price?: number | null
          product_limit?: number | null
          is_discounted?: boolean | null
          discount_expiry_date?: string | null
          deposit_credit?: number | null
        }
      }
      posts: {
        Row: {
          id: string
          user_id: string
          content: string | null
          image_urls: string[]
          post_type: string
          series_id: string | null
          series_order: number | null
          topic_ids: string[]
          location: string | null
          like_count: number
          comment_count: number
          share_count: number
          tip_amount: number
          status: string
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          content?: string | null
          image_urls?: string[]
          post_type?: string
          series_id?: string | null
          series_order?: number | null
          topic_ids?: string[]
          location?: string | null
          like_count?: number
          comment_count?: number
          share_count?: number
          tip_amount?: number
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          content?: string | null
          image_urls?: string[]
          post_type?: string
          series_id?: string | null
          series_order?: number | null
          topic_ids?: string[]
          location?: string | null
          like_count?: number
          comment_count?: number
          share_count?: number
          tip_amount?: number
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      products: {
        Row: {
          id: string
          seller_id: string
          name: string
          description: string | null
          price: number
          currency: string | null
          shipping_fee: number
          images: string[]
          stock: number
          category: string | null
          allow_affiliate: boolean
          commission_rate: number | null
          color_options: Json | null
          sizes: Json | null
          allow_search: boolean
          show_to_guests: boolean
          visibility: 'public' | 'followers_only' | 'following_only' | 'self_only'
          status: string
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
          updated_at: string
          condition: 'new' | 'like_new' | 'ninety_five' | 'ninety' | 'eighty' | 'seventy_or_below' | null
          sales_countries: string[]
        }
        Insert: {
          id?: string
          seller_id: string
          name: string
          description?: string | null
          price: number
          currency?: string | null
          shipping_fee?: number
          images?: string[]
          stock?: number
          category?: string | null
          allow_affiliate?: boolean
          commission_rate?: number | null
          color_options?: Json | null
          sizes?: Json | null
          allow_search?: boolean
          show_to_guests?: boolean
          visibility?: 'public' | 'followers_only' | 'following_only' | 'self_only'
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
          condition?: 'new' | 'like_new' | 'ninety_five' | 'ninety' | 'eighty' | 'seventy_or_below' | null
          sales_countries?: string[]
        }
        Update: {
          id?: string
          seller_id?: string
          name?: string
          description?: string | null
          price?: number
          currency?: string | null
          shipping_fee?: number
          images?: string[]
          stock?: number
          category?: string | null
          allow_affiliate?: boolean
          commission_rate?: number | null
          color_options?: Json | null
          sizes?: Json | null
          allow_search?: boolean
          show_to_guests?: boolean
          visibility?: 'public' | 'followers_only' | 'following_only' | 'self_only'
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
          condition?: 'new' | 'like_new' | 'ninety_five' | 'ninety' | 'eighty' | 'seventy_or_below' | null
          sales_countries?: string[]
        }
      }
      orders: {
        Row: {
          id: string
          order_number: string
          buyer_id: string
          seller_id: string
          affiliate_id: string | null
          product_id: string
          quantity: number
          unit_price: number
          total_amount: number
          commission_amount: number
          shipping_fee: number
          payment_method: string | null
          payment_status: string
          order_status: string
          shipping_address: Json | null
          tracking_number: string | null
          logistics_provider: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_number: string
          buyer_id: string
          seller_id: string
          affiliate_id?: string | null
          product_id: string
          quantity: number
          unit_price: number
          total_amount: number
          commission_amount: number
          shipping_fee?: number
          payment_method?: string | null
          payment_status?: string
          order_status?: string
          shipping_address?: Json | null
          tracking_number?: string | null
          logistics_provider?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          order_number?: string
          buyer_id?: string
          seller_id?: string
          affiliate_id?: string | null
          product_id?: string
          quantity?: number
          unit_price?: number
          total_amount?: number
          commission_amount?: number
          shipping_fee?: number
          payment_method?: string | null
          payment_status?: string
          order_status?: string
          shipping_address?: Json | null
          tracking_number?: string | null
          logistics_provider?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string
          quantity: number
          unit_price: number
          total_amount: number
          color: string | null
          size: string | null
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          product_id: string
          quantity: number
          unit_price: number
          total_amount: number
          color?: string | null
          size?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
          total_amount?: number
          color?: string | null
          size?: string | null
          created_at?: string
        }
      }
      user_addresses: {
        Row: {
          id: string
          user_id: string
          label: string | null
          recipient_name: string
          phone: string
          country: string
          state: string | null
          city: string | null
          street_address: string
          postal_code: string | null
          is_default: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          label?: string | null
          recipient_name: string
          phone: string
          country: string
          state?: string | null
          city?: string | null
          street_address: string
          postal_code?: string | null
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          label?: string | null
          recipient_name?: string
          phone?: string
          country?: string
          state?: string | null
          city?: string | null
          street_address?: string
          postal_code?: string | null
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          title: string
          content: string | null
          related_id: string | null
          related_type: string | null
          link: string | null
          is_read: boolean
          created_at: string
          actor_id: string | null
        }
        Insert: {
          id?: string
          user_id: string
          type: string
          title: string
          content?: string | null
          related_id?: string | null
          related_type?: string | null
          link?: string | null
          is_read?: boolean
          created_at?: string
          actor_id?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          type?: string
          title?: string
          content?: string | null
          related_id?: string | null
          related_type?: string | null
          link?: string | null
          is_read?: boolean
          created_at?: string
          actor_id?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
