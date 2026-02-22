## 方案 1：分离架构实施计划

### 核心思路

保持 `posts` 表和 `content_events` 表分离，修改 Feed 系统同时查询两个表，合并展示。

***

## 第一阶段：数据库层改造

### 1.1 创建新的 Feed RPC 函数

**文件**: `supabase/migrations/272_unified_feed_rpc.sql`

创建新的 RPC 函数 `get_unified_feed_with_reasons`，同时查询 `posts` 和 `content_events`：

```sql
-- 统一的 Feed RPC，同时查询 posts 和 content_events
CREATE OR REPLACE FUNCTION public.get_unified_feed_with_reasons(
  p_user_id UUID,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0,
  p_followed_only BOOLEAN DEFAULT FALSE,
  p_exclude_viewed_days INT DEFAULT 7,
  p_tier1_base NUMERIC DEFAULT 100,
  p_tier2_base NUMERIC DEFAULT 50,
  p_diversity_n INT DEFAULT 20,
  p_diversity_k INT DEFAULT 2
)
RETURNS TABLE(item_id UUID, item_type TEXT, reason_type TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- 原有逻辑保持不变
  -- 但查询范围扩展到两个表
BEGIN
  -- 1) 构建候选列表（从 posts 和 content_events）
  -- 2) 应用相同的推荐算法
  -- 3) 返回合并后的结果（带 item_type 区分来源）
END;
$$;
```

### 1.2 关键修改点

* `posts` 表查询：`status = 'approved'`

* `content_events` 表查询：`status = 'published'`

* 返回结果增加 `item_type` 字段：`'post'` 或 `'content_event'`

***

## 第二阶段：前端数据层改造

### 2.1 修改 usePosts.ts

**文件**: `src/lib/hooks/usePosts.ts`

#### 2.1.1 修改 fetchPersonalizedFeedWithReasons 函数

```typescript
async function fetchPersonalizedFeedWithReasons(
  userId: string,
  page: number,
  options?: { followedOnly?: boolean }
): Promise<Post[]> {
  const supabase = createClient()
  const offset = page * POSTS_PER_PAGE

  // 调用新的 RPC 函数
  const { data: rows, error: rpcError } = await supabase.rpc('get_unified_feed_with_reasons', {
    p_user_id: userId,
    p_limit: POSTS_PER_PAGE,
    p_offset: offset,
    p_followed_only: options?.followedOnly ?? false,
    // ... 其他参数
  })

  if (rpcError) throw rpcError
  
  const items = (rows || []) as { item_id: string; item_type: string; reason_type: string | null }[]
  
  // 分离 posts 和 content_events 的 ID
  const postIds = items.filter(i => i.item_type === 'post').map(i => i.item_id)
  const eventIds = items.filter(i => i.item_type === 'content_event').map(i => i.item_id)
  
  // 并行查询两个表
  const [postsResult, eventsResult] = await Promise.all([
    postIds.length > 0 ? supabase.from('posts').select(POST_SELECT).in('id', postIds) : Promise.resolve({ data: [] }),
    eventIds.length > 0 ? supabase.from('content_events').select(EVENT_SELECT).in('id', eventIds) : Promise.resolve({ data: [] })
  ])
  
  // 合并数据并统一格式
  const unifiedPosts = unifyFeedData(postsResult.data || [], eventsResult.data || [], items)
  
  return unifiedPosts
}
```

#### 2.1.2 创建 EVENT\_SELECT 查询字段

```typescript
const EVENT_SELECT = `
  id,
  creator_id,
  event_type,
  content,
  image_urls,
  video_url,
  video_cover_url,
  duration_seconds,
  location,
  status,
  created_at,
  reviewed_at,
  creator:profiles!content_events_creator_id_fkey (
    username,
    display_name,
    avatar_url
  ),
  event_affiliate_binding (
    product_id,
    commission_rate_snapshot,
    product:products (
      id,
      name,
      price,
      images,
      seller_id
    )
  )
`
```

#### 2.1.3 创建数据统一函数

```typescript
function unifyFeedData(
  posts: any[],
  events: any[],
  orderItems: { item_id: string; item_type: string; reason_type: string | null }[]
): Post[] {
  // 将 content_events 转换为 Post 格式
  const eventAsPosts = events.map(mapContentEventToPost)
  
  // 将 posts 转换为标准格式
  const standardPosts = posts.map(mapRowToPost)
  
  // 合并并按原始顺序排序
  const combined = [...standardPosts, ...eventAsPosts]
  const byId = new Map(combined.map(p => [p.id, p]))
  
  return orderItems.map(item => {
    const post = byId.get(item.item_id)
    if (!post) return null
    return {
      ...post,
      recommendationReason: { reasonType: (item.reason_type ?? 'trending') as FeedRecommendationReasonType }
    }
  }).filter(Boolean) as Post[]
}
```

### 2.2 创建 content\_events 到 Post 的映射函数

```typescript
function mapContentEventToPost(event: any): Post {
  return {
    id: event.id,
    user_id: event.creator_id,
    content: event.content,
    content_lang: null,
    content_translated: null,
    image_urls: event.image_urls || [],
    post_type: event.event_type === 'affiliate' ? 'affiliate' : 'normal',
    like_count: 0, // content_events 需要单独的计数逻辑
    comment_count: 0,
    share_count: 0,
    repost_count: 0,
    favorite_count: 0,
    tip_amount: 0,
    created_at: event.created_at,
    status: event.status === 'published' ? 'approved' : event.status,
    // 视频信息
    video_info: event.video_url ? {
      video_url: event.video_url,
      duration_seconds: event.duration_seconds,
      cover_url: event.video_cover_url
    } : undefined,
    // 关联商品（带货帖子）
    linkedProducts: event.event_affiliate_binding?.map((binding: any) => ({
      productId: binding.product_id,
      product: binding.product
    })),
    // 作者信息
    user: event.creator,
    // 话题（content_events 可能暂时不支持）
    topics: []
  }
}
```

***

## 第三阶段：UI 层适配

### 3.1 修改 PostCardView 支持 content\_events

**文件**: `src/components/social/post-card/PostCardView.tsx`

* 确保 `post_type = 'affiliate'` 能正确渲染

* 显示带货商品信息（如果有 linkedProducts）

* 显示视频内容（如果有 video\_info）

### 3.2 修改 mapFeedPostToListPostDTO

**文件**: `src/lib/post-card/mappers.ts`

确保映射函数能正确处理 content\_events 的数据格式。

***

## 第四阶段：计数与互动支持

### 4.1 content\_events 互动计数

由于 `content_events` 是新表，需要：

1. **创建计数字段**（可选）：

   ```sql
   ALTER TABLE content_events
   ADD COLUMN IF NOT EXISTS like_count INT DEFAULT 0,
   ADD COLUMN IF NOT EXISTS comment_count INT DEFAULT 0,
   ADD COLUMN IF NOT EXISTS share_count INT DEFAULT 0;
   ```

2. **或者** 修改点赞/评论/分享逻辑，同时支持 `posts` 和 `content_events`

### 4.2 修改互动 API

* `likes` 表可能需要添加 `content_event_id` 字段

* 或者创建通用的 `content_likes` 表

***

## 第五阶段：测试与验证

### 5.1 测试场景

1. **普通帖子** - 正常显示、点赞、评论
2. **带货帖子** - 审核通过后显示在 Feed
3. **混合 Feed** - 普通帖子和带货帖子正确排序
4. **推荐理由** - 正确显示 followed\_user / trending 等

### 5.2 性能测试

* Feed 加载速度

* 大量数据时的分页性能

***

## 实施顺序建议

```
第1步: 创建 272_unified_feed_rpc.sql（数据库层）
第2步: 修改 usePosts.ts（前端数据层）
第3步: 测试 Feed 是否正常显示两种帖子
第4步: 修复发现的问题
第5步: 完善互动功能（点赞/评论）
```

***

## 风险与注意事项

1. **数据一致性** - 确保 posts 和 content\_events 的字段映射正确
2. **性能影响** - 同时查询两个表可能增加查询时间
3. **互动数据** - content\_events 的点赞/评论需要单独处理
4. **向后兼容** - 确保旧版 Feed 在

