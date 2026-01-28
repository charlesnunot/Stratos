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
  canViewAuthorPrivateInfo: boolean
  canRecordView: boolean
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
    }

