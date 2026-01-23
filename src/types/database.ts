export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

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
          created_at: string
          updated_at: string
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
          created_at?: string
          updated_at?: string
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
          created_at?: string
          updated_at?: string
        }
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          subscription_type: string
          payment_method: string
          payment_account_id: string | null
          amount: number
          status: string
          starts_at: string
          expires_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          subscription_type: string
          payment_method: string
          payment_account_id?: string | null
          amount: number
          status?: string
          starts_at: string
          expires_at: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          subscription_type?: string
          payment_method?: string
          payment_account_id?: string | null
          amount?: number
          status?: string
          starts_at?: string
          expires_at?: string
          created_at?: string
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
          images: string[]
          stock: number
          category: string | null
          allow_affiliate: boolean
          commission_rate: number | null
          status: string
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          seller_id: string
          name: string
          description?: string | null
          price: number
          images?: string[]
          stock?: number
          category?: string | null
          allow_affiliate?: boolean
          commission_rate?: number | null
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          seller_id?: string
          name?: string
          description?: string | null
          price?: number
          images?: string[]
          stock?: number
          category?: string | null
          allow_affiliate?: boolean
          commission_rate?: number | null
          status?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
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
