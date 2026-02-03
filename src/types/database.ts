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
          location_translated: string | null
          language: string
          follower_count: number
          following_count: number
          role: string
          subscription_type: string | null
          subscription_expires_at: string | null
          status: string
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
          location_translated?: string | null
          language?: string
          follower_count?: number
          following_count?: number
          role?: string
          subscription_type?: string | null
          subscription_expires_at?: string | null
          status?: string
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
          location_translated?: string | null
          language?: string
          follower_count?: number
          following_count?: number
          role?: string
          subscription_type?: string | null
          subscription_expires_at?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
      }
      user_settings: {
        Row: {
          user_id: string
          profile_visibility: string
          who_can_message: string
          who_can_comment: string
          email_messages: boolean
          email_likes: boolean
          email_comments: boolean
          email_follows: boolean
          email_orders: boolean
          email_marketing: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          profile_visibility?: string
          who_can_message?: string
          who_can_comment?: string
          email_messages?: boolean
          email_likes?: boolean
          email_comments?: boolean
          email_follows?: boolean
          email_orders?: boolean
          email_marketing?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          profile_visibility?: string
          who_can_message?: string
          who_can_comment?: string
          email_messages?: boolean
          email_likes?: boolean
          email_comments?: boolean
          email_follows?: boolean
          email_orders?: boolean
          email_marketing?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      identity_verifications: {
        Row: {
          user_id: string
          real_name: string
          id_number: string
          id_card_front_path: string | null
          id_card_back_path: string | null
          status: string
          rejected_reason: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          real_name: string
          id_number: string
          id_card_front_path?: string | null
          id_card_back_path?: string | null
          status?: string
          rejected_reason?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          real_name?: string
          id_number?: string
          id_card_front_path?: string | null
          id_card_back_path?: string | null
          status?: string
          rejected_reason?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
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
          group_id: string | null
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
          chapter_number: number | null
          content_length: number | null
          music_url: string | null
          duration_seconds: number | null
          video_url: string | null
          cover_url: string | null
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
          group_id?: string | null
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
          chapter_number?: number | null
          content_length?: number | null
          music_url?: string | null
          duration_seconds?: number | null
          video_url?: string | null
          cover_url?: string | null
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
          group_id?: string | null
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
          chapter_number?: number | null
          content_length?: number | null
          music_url?: string | null
          duration_seconds?: number | null
          video_url?: string | null
          cover_url?: string | null
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
          content_key: string | null
          content_params: Json | null
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
          content_key?: string | null
          content_params?: Json | null
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
          content_key?: string | null
          content_params?: Json | null
          related_id?: string | null
          related_type?: string | null
          link?: string | null
          is_read?: boolean
          created_at?: string
          actor_id?: string | null
        }
      }
      trust_judgment_feedback: {
        Row: {
          id: string
          product_id: string
          seller_id: string
          user_id: string
          agreed: boolean
          reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          product_id: string
          seller_id: string
          user_id: string
          agreed: boolean
          reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          seller_id?: string
          user_id?: string
          agreed?: boolean
          reason?: string | null
          created_at?: string
        }
      }
      feed_recommendation_feedback: {
        Row: {
          id: string
          user_id: string
          post_id: string
          reason_type: string | null
          agreed: boolean | null
          dismissed: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          post_id: string
          reason_type?: string | null
          agreed?: boolean | null
          dismissed?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          post_id?: string
          reason_type?: string | null
          agreed?: boolean | null
          dismissed?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      post_products: {
        Row: {
          id: string
          post_id: string
          product_id: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          post_id: string
          product_id: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          post_id?: string
          product_id?: string
          sort_order?: number
          created_at?: string
        }
      }
      community_groups: {
        Row: {
          id: string
          name: string
          slug: string
          description: string | null
          cover_url: string | null
          created_by: string
          member_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          description?: string | null
          cover_url?: string | null
          created_by: string
          member_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          description?: string | null
          cover_url?: string | null
          created_by?: string
          member_count?: number
          created_at?: string
          updated_at?: string
        }
      }
      group_members: {
        Row: {
          id: string
          group_id: string
          user_id: string
          role: string
          created_at: string
        }
        Insert: {
          id?: string
          group_id: string
          user_id: string
          role?: string
          created_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          user_id?: string
          role?: string
          created_at?: string
        }
      }
      user_points: {
        Row: {
          user_id: string
          points: number
          updated_at: string
        }
        Insert: {
          user_id: string
          points?: number
          updated_at?: string
        }
        Update: {
          user_id?: string
          points?: number
          updated_at?: string
        }
      }
      badges: {
        Row: {
          id: string
          key: string
          name: string
          description: string | null
          icon_url: string | null
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          key: string
          name: string
          description?: string | null
          icon_url?: string | null
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          key?: string
          name?: string
          description?: string | null
          icon_url?: string | null
          sort_order?: number
          created_at?: string
        }
      }
      user_badges: {
        Row: {
          id: string
          user_id: string
          badge_id: string
          earned_at: string
        }
        Insert: {
          id?: string
          user_id: string
          badge_id: string
          earned_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          badge_id?: string
          earned_at?: string
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
