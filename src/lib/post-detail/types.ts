import type { Post } from '@/lib/hooks/usePosts'
import type { Profile } from '@/lib/hooks/useProfile'
import type { User } from '@supabase/supabase-js'

export type PostPageStatus = 'loading' | 'unavailable' | 'ready'

export type UnavailableReason = 'network' | 'deleted' | 'permission'

export interface PageCapabilities {
  canComment: boolean
  canLike: boolean
  canTip: boolean
  canRepost: boolean
  canReport: boolean
  canFollowAuthor: boolean
  /** 能否与作者私聊（未登录/本人/被拉黑/封禁则 false） */
  canChat: boolean
  canViewAuthorPrivateInfo: boolean
  canRecordView: boolean
}

export interface AuthorizationToken {
  hasValidToken: boolean
  token: string | null
  resolutionId: string | null
  expiresAt: string | null
}

export type PostPageState =
  | { status: 'loading' }
  | { status: 'unavailable'; reason: UnavailableReason }
  | {
      status: 'ready'
      capabilities: PageCapabilities
      post: Post
      user: User | null
      author: Profile | null
      isBlockedByAuthor?: boolean
      isAuthorBannedOrSuspended?: boolean
      /** 当 canTip 为 false 时的原因，用于 Tip 按钮的 tooltip */
      tipDisabledReason?: string
      /** MCRE: 授权证明 Token（不暴露能力值） */
      authorizationToken?: AuthorizationToken
    }

