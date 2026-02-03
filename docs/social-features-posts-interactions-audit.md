# 社交功能（帖子与互动）链路审计报告

## 任务名称
Social Interaction & Engagement Linkage Test

## 任务结果：✅ 成功

所有验证点通过，发现并修复了多个问题。

---

## 修复的问题

### 1. LikeButton 国际化问题 (P1)
**问题**：`LikeButton.tsx` 中的错误消息和提示使用硬编码中文字符串
**修复**：
- 添加 `useTranslations('posts')` hook
- 将 `'请先登录后再点赞'` 替换为 `t('pleaseLoginToLike')`
- 将错误消息替换为国际化键
- 添加审计日志记录点赞/取消点赞操作

### 2. 佣金计算审计日志缺失 (P0)
**问题**：`calculateAndCreateCommissions` 函数不记录任何审计日志
**修复**：
- 为佣金创建成功添加 `[AUDIT INFO]` 日志
- 为佣金创建失败添加 `[AUDIT WARN]` 日志
- 日志包含：affiliateId、orderId、productId、commissionRate（不记录具体金额）

### 3. 收藏功能审计日志缺失 (P1)
**问题**：`useFavorites.ts` 中的收藏/取消收藏操作不记录审计日志
**修复**：
- 导入 `logAudit` 函数
- 在 `onSuccess` 回调中添加审计日志记录
- 记录 action（add_favorite/remove_favorite）、userId、itemId、itemType

### 4. 转发功能审计日志缺失 (P1)
**问题**：`useRepost.ts` 中的转发操作不记录审计日志
**修复**：
- 导入 `logAudit` 函数
- 在 `onSuccess` 回调中添加审计日志记录
- 记录 action（create_repost）、userId、itemId、itemType、targetCount

### 5. 发帖后通知粉丝功能缺失 (P1)
**问题**：帖子审核通过后不通知作者的粉丝
**修复**：
- 创建新迁移文件 `195_notify_followers_on_post_approval.sql`
- 实现 `notify_followers_on_post_approval()` 触发器函数
- 当帖子状态从 pending 变为 approved 时触发
- 限制最大通知数量为 1000（防止大 V 发帖时性能问题）

### 6. 评论审计日志上下文不完整 (P2)
**问题**：评论创建/更新/删除的审计日志缺少 postId 上下文
**修复**：
- 在 `CommentSection.tsx` 的 `logAudit` 调用中添加 `meta: { postId, parentId }`
- 方便追踪评论归属的帖子

### 7. FavoriteButton 国际化问题 (P2)
**问题**：`FavoriteButton.tsx` 中的提示使用硬编码中文字符串
**修复**：
- 添加 `useTranslations('posts')` hook
- 将 `'请先登录后再收藏'` 替换为 `t('pleaseLoginToFavorite')`

### 8. RepostDialog 国际化问题 (P2)
**问题**：`RepostDialog.tsx` 中多处使用硬编码中文字符串
**修复**：
- 将 `'添加转发评论（可选）...'` 替换为 `t('addRepostComment')`
- 将 `'搜索用户...'` 替换为 `t('searchUsers')`
- 将 `'关注的人'` 替换为 `t('following')`
- 将 `'粉丝'` 替换为 `t('followers')`
- 将 `'暂无关注的人'` 替换为 `t('noFollowing')`
- 将 `'暂无粉丝'` 替换为 `t('noFollowers')`
- 将 `'已选择 X 个用户'` 替换为 `t('selectedUsers', { count })`
- 将 `'转发中...'` 替换为 `t('reposting')`

---

## 完整链路追踪

### 1. 帖子发布链路
```
用户 → /post/create
  ↓
CreatePostPage 组件
  ↓ useAuthGuard() 验证登录
  ↓ useImageUpload() 上传图片到 Supabase Storage
  ↓ sanitizeContent() 防 XSS
  ↓ supabase.from('posts').insert()
  ↓ supabase.from('topics').insert/select() 创建/获取话题
  ↓ supabase.from('post_topics').insert() 关联话题
  ↓ logAudit({ action: 'create_post', ... })
  ↓ queryClient.invalidateQueries(['posts'])
  ↓ router.push('/post/${id}')
  ↓
帖子进入 pending 状态 → 管理员审核
  ↓
create_post_creation_notification() 触发器 → 通知管理员
  ↓
管理员审核通过 → status = 'approved'
  ↓
create_post_review_notification() 触发器 → 通知作者
  ↓
notify_followers_on_post_approval() 触发器 → 通知所有粉丝（新增）
```

### 2. 评论链路
```
用户 → 帖子详情页 CommentSection
  ↓ useInfiniteQuery() 分页加载评论
  ↓ checkRateLimit() 防刷（2秒间隔）
  ↓ sanitizeContent() 防 XSS
  ↓ useImageUpload() 上传评论图片
  ↓ supabase.from('comments').insert()
  ↓ logAudit({ action: 'create_comment', meta: { postId, parentId } })
  ↓
评论触发器 → 更新 post.comment_count
  ↓
评论通知触发器 → 通知帖子作者
```

### 3. 点赞链路
```
用户 → LikeButton 点击
  ↓ handleLike() 检查登录状态
  ↓ debounce（300ms 防抖）
  ↓ likeMutation.mutate(shouldLike)
  ↓ 乐观更新 UI
  ↓ supabase.from('likes').insert/delete()
  ↓ logAudit({ action: 'like_post/unlike_post', ... })
  ↓
点赞触发器 → 更新 post.like_count
  ↓
点赞通知触发器 → 通知帖子作者
  ↓
Realtime 订阅 → 同步其他客户端
```

### 4. 收藏链路
```
用户 → FavoriteButton 点击
  ↓ handleFavorite() 检查登录状态
  ↓ 乐观更新 UI
  ↓ toggleFavorite.mutate({ itemType, itemId, isFavorite })
  ↓ supabase.from('favorites').insert/delete()
  ↓ logAudit({ action: 'add_favorite/remove_favorite', ... })
  ↓
收藏触发器 → 更新 post.favorite_count
  ↓
queryClient.invalidateQueries()
```

### 5. 转发链路
```
用户 → 转发按钮 → RepostDialog
  ↓ 选择目标用户
  ↓ 添加转发评论（可选）
  ↓ useRepost().mutate()
  ↓ supabase.from('reposts').insert()
  ↓ logAudit({ action: 'create_repost', meta: { targetCount } })
  ↓
转发触发器 → 更新 post.repost_count
  ↓
转发通知触发器 → 通知目标用户 + 原作者
```

### 6. 打赏链路
```
用户 → TipButton 点击
  ↓ 验证打赏订阅有效
  ↓ 输入打赏金额
  ↓ POST /api/payments/stripe/create-tip-session
     ↓ 验证用户认证
     ↓ 验证打赏订阅
     ↓ 检查黑名单
     ↓ 验证帖子存在且已审核
     ↓ 检查接收者打赏功能开启
     ↓ checkTipLimits() 检查打赏限额
     ↓ createCheckoutSession() 创建 Stripe 会话
  ↓
用户完成支付 → Stripe Webhook
  ↓
processTipPayment()
  ↓ 验证黑名单和订阅
  ↓ supabase.from('tip_transactions').insert()
  ↓ 更新 post.tip_amount
  ↓ transferToSeller() 转账给接收者
  ↓ supabase.from('notifications').insert() 通知接收者
  ↓ logPaymentSuccess('tip', ...)
```

### 7. 佣金计算链路
```
订单支付成功 → processOrderPayment()
  ↓
calculateAndCreateCommissions(order, supabaseAdmin)
  ↓ 检查 affiliate_post_id 和 affiliate_id
  ↓ 获取 affiliate_products.commission_rate
  ↓ 计算佣金金额
  ↓ supabase.from('affiliate_commissions').insert()
  ↓ [AUDIT INFO] 记录佣金创建成功
  ↓ 更新 order.commission_amount
  ↓ supabase.from('notifications').insert() 通知推广者
```

---

## 验证点检查

| 验证点 | 状态 | 说明 |
|--------|------|------|
| 帖子发布成功显示在 Feed | ✅ | 通过 queryClient.invalidateQueries 刷新 |
| 只有作者能编辑自己的帖子 | ✅ | edit/page.tsx 检查 user.id !== post.user_id |
| 发帖后粉丝收到通知 | ✅ | 新增 notify_followers_on_post_approval 触发器 |
| 评论成功后通知帖子作者 | ✅ | 评论通知触发器已存在 |
| 只能删除自己的评论 | ✅ | RLS 策略：auth.uid() = user_id |
| 点赞防重复 | ✅ | 唯一约束 + 错误处理忽略 23505 |
| 转发成功通知原作者 | ✅ | create_repost_notification 触发器 |
| 收藏防重复 | ✅ | 唯一约束 + 错误处理忽略 23505 |
| 打赏通过支付网关处理 | ✅ | Stripe/PayPal 集成 |
| 打赏记录正确更新 | ✅ | tip_transactions 表 + post.tip_amount 更新 |
| 打赏通知双方 | ✅ | processTipPayment 创建通知 |
| 日志不记录敏感数据 | ✅ | 不记录具体金额、卡号、密码等 |
| 所有操作有审计日志 | ✅ | logAudit 覆盖所有关键操作 |
| 佣金正确计算并发放 | ✅ | calculateAndCreateCommissions + 通知 |

---

## RLS 策略验证

| 表 | SELECT | INSERT | UPDATE | DELETE | 验证结果 |
|----|--------|--------|--------|--------|----------|
| posts | approved OR owner OR admin | owner | owner OR admin | owner OR admin | ✅ |
| comments | approved OR owner OR admin | owner | owner | owner OR admin | ✅ |
| likes | public | owner | - | owner | ✅ |
| favorites | owner only | owner | owner | owner | ✅ |
| reposts | public | owner | - | owner | ✅ |
| tip_transactions | - | via API | - | - | ✅ |
| notifications | owner only | via triggers | owner | - | ✅ |

---

## 数据权限验证

1. **帖子内容**：
   - 公开：已审核帖子的内容、图片、话题
   - 私有：pending/rejected 状态帖子仅作者和管理员可见

2. **评论**：
   - 公开：已审核评论
   - 私有：pending 评论仅作者可见

3. **点赞/收藏/转发**：
   - 点赞和转发列表公开可见
   - 收藏列表仅本人可见

4. **打赏**：
   - 打赏总额公开（post.tip_amount）
   - 具体打赏记录仅相关方可见

---

## 审计日志覆盖

| 操作 | action | resourceType | meta |
|------|--------|--------------|------|
| 创建帖子 | create_post | post | - |
| 创建评论 | create_comment | comment | postId, parentId |
| 更新评论 | update_comment | comment | postId |
| 删除评论 | delete_comment | comment | postId |
| 点赞 | like_post | post | - |
| 取消点赞 | unlike_post | post | - |
| 添加收藏 | add_favorite | post/product/... | - |
| 取消收藏 | remove_favorite | post/product/... | - |
| 转发 | create_repost | post/product | targetCount |
| 创建佣金 | create_commission | order | productId, commissionRate |

---

## 架构亮点

1. **乐观更新**：点赞、收藏、评论等操作使用乐观更新，提供即时反馈
2. **Realtime 同步**：使用 Supabase Realtime 同步跨客户端状态
3. **分页加载**：评论使用 useInfiniteQuery 实现分页
4. **Rate Limiting**：评论有 2 秒防抖，打赏有限额检查
5. **XSS 防护**：所有用户输入经过 sanitizeContent 处理
6. **触发器通知**：使用数据库触发器自动创建通知
7. **SECURITY DEFINER**：触发器函数使用 SECURITY DEFINER 绕过 RLS
8. **国际化**：所有用户界面文本使用 next-intl 国际化

---

## 文件变更清单

1. `src/components/social/LikeButton.tsx` - 添加国际化和审计日志
2. `src/components/social/FavoriteButton.tsx` - 添加国际化
3. `src/components/social/RepostDialog.tsx` - 添加国际化
4. `src/components/social/CommentSection.tsx` - 完善审计日志上下文
5. `src/lib/hooks/useFavorites.ts` - 添加审计日志
6. `src/lib/hooks/useRepost.ts` - 添加审计日志
7. `src/lib/commissions/calculate.ts` - 添加审计日志
8. `supabase/migrations/195_notify_followers_on_post_approval.sql` - 新增粉丝通知触发器
