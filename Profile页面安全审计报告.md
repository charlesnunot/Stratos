# Profile 页面安全审计报告

**审计时间**: 2026-01-26  
**审计范围**: `/profile/[id]` 页面（访问他人主页场景）  
**审计角色**: 真实已登录用户（非页面所属用户）  
**访问路径**: `http://localhost:3000/zh/profile/60bc38f2-da86-4fa3-b9b1-16c77066f790`

---

## 一、页面初始化阶段审计

### 1.1 页面渲染模式

**代码位置**: `src/app/[locale]/(main)/profile/[id]/page.tsx:1`

```typescript
'use client'  // Client Component
```

**审计结果**:
- ✅ **正确**: 页面为 CSR（Client-Side Rendering），不存在 SSR hydration mismatch 风险
- ✅ **正确**: 所有数据获取通过 `useQuery` 在客户端完成，依赖 Supabase session

**潜在问题**:
- 🟠 **性能**: 首次加载需要等待多个 `useQuery` 完成，可能导致白屏时间较长
- 🟢 **优化建议**: 考虑使用 React Suspense 或骨架屏优化加载体验

---

### 1.2 Profile 数据获取

**代码位置**: `src/lib/hooks/useProfile.ts:21-52`

```typescript
const { data, error } = await supabase
  .from('profiles')
  .select('id, username, display_name, avatar_url, bio, location, follower_count, following_count, created_at')
  .eq('id', userId)
  .single()
```

**RLS Policy**:
```sql
-- supabase/migrations/001_initial_schema.sql:318-319
CREATE POLICY "Users can view all profiles" ON profiles
  FOR SELECT USING (true);
```

**审计结果**:
- ✅ **正确**: 查询明确指定了公开字段，不包含敏感信息（email, payment_account_id, subscription_type 等）
- ✅ **正确**: RLS Policy 允许所有人查看 profiles，但查询层面已过滤敏感字段
- ✅ **正确**: 存在 `public_profiles` 视图（migration 155），但代码未使用，建议迁移

**潜在问题**:
- 🟠 **架构**: 虽然查询层面过滤了字段，但 RLS Policy 允许查询所有字段，存在潜在风险
- 🟢 **优化建议**: 迁移到使用 `public_profiles` 视图，在数据库层面限制字段访问

---

### 1.3 404 / 403 边界情况处理

**代码位置**: `src/app/[locale]/(main)/profile/[id]/page.tsx:147-189`

**审计结果**:

#### Profile 不存在
```typescript
if (!profile) {
  return <div>用户不存在</div>
}
```
- ✅ **正确**: 当 `useProfile` 返回 `null` 时显示友好提示
- ✅ **正确**: 不泄露 userId 信息（注释显示已修复）

#### Profile 被封禁
```typescript
// 检查是否被限制查看
const { data: isRestricted } = useIsRestricted(userId)

if (isRestricted && !isOwnProfile) {
  return <div>您已被限制查看此用户的内容</div>
}
```
- ✅ **正确**: 检查 `restricted_view_users` 表
- ⚠️ **问题**: 未检查 `profiles.status = 'banned'` 或 `'suspended'`

**严重问题**:
- 🔴 **缺失**: 未检查目标用户的 `profiles.status` 字段
  - **触发路径**: 访问被封禁用户的主页
  - **涉及文件**: `src/app/[locale]/(main)/profile/[id]/page.tsx:147-189`
  - **修复建议**: 
    ```typescript
    // 在 useProfile 或页面组件中检查
    if (profile?.status === 'banned' || profile?.status === 'suspended') {
      return <div>该用户已被封禁</div>
    }
    ```

#### 当前用户被拉黑
- ✅ **正确**: `useIsRestricted` 检查了 `restricted_view_users` 表（不让他看）
- ⚠️ **问题**: 未检查 `blocked_users` 表（拉黑关系）

**严重问题**:
- 🔴 **缺失**: 未检查当前用户是否被目标用户拉黑
  - **触发路径**: 被拉黑用户访问拉黑者的主页
  - **涉及文件**: `src/app/[locale]/(main)/profile/[id]/page.tsx`
  - **修复建议**: 
    ```typescript
    // 检查是否被拉黑
    const { data: isBlocked } = useQuery({
      queryKey: ['isBlocked', user?.id, userId],
      queryFn: async () => {
        const { data } = await supabase
          .from('blocked_users')
          .select('id')
          .eq('blocker_id', userId)
          .eq('blocked_id', user?.id)
          .maybeSingle()
        return !!data
      },
      enabled: !!user && !!userId && user.id !== userId,
    })
    
    if (isBlocked) {
      return <div>您已被该用户拉黑</div>
    }
    ```

---

## 二、页面核心功能推演

### 2.1 Follow / Unfollow 功能

**代码位置**: 
- `src/components/social/FollowButton.tsx:17-99`
- `src/lib/hooks/useProfile.ts:77-135`

#### 功能流程
1. **检查关注状态**: `useIsFollowing(userId)` → 查询 `follows` 表
2. **点击关注**: `useFollow().mutate({ followingId, shouldFollow: true })`
3. **插入记录**: `supabase.from('follows').insert({ follower_id: user.id, followee_id: userId })`
4. **更新计数**: Trigger 自动更新 `profiles.follower_count` 和 `profiles.following_count`

**RLS Policy**:
```sql
-- supabase/migrations/049_add_follows_rls_policies.sql
CREATE POLICY "Users can insert their own follows" ON public.follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);
```

**审计结果**:

✅ **正确**:
- 检查登录状态 (`if (!user)`)
- 检查不能关注自己 (`if (user.id === userId)`)
- 检查是否被拉黑 (`blocked_users` 表)
- RLS Policy 确保只能插入自己的关注关系
- 处理唯一约束冲突（重复插入时忽略错误）

⚠️ **潜在问题**:

1. **并发点击导致重复插入**
   - **问题描述**: 快速连续点击可能导致多个插入请求同时发出
   - **触发路径**: 用户快速连续点击 Follow 按钮
   - **涉及文件**: `src/lib/hooks/useProfile.ts:108-119`
   - **当前处理**: 代码已处理 `23505` 错误（唯一约束冲突），但 UI 可能显示不一致
   - **修复建议**: 
     - 在 `FollowButton` 中添加 `disabled={followMutation.isPending}`（已实现）
     - 考虑使用乐观更新（optimistic update）提升 UX

2. **UI 状态与 DB 不一致**
   - **问题描述**: 如果插入成功但 `invalidateQueries` 失败，UI 可能显示错误状态
   - **触发路径**: 网络问题导致 query invalidation 失败
   - **涉及文件**: `src/lib/hooks/useProfile.ts:129-133`
   - **修复建议**: 
     - 使用乐观更新，失败时回滚
     - 添加重试机制

3. **未检查目标用户状态**
   - **问题描述**: 可以关注被封禁的用户
   - **触发路径**: 关注 `status = 'banned'` 的用户
   - **涉及文件**: `src/lib/hooks/useProfile.ts:77-135`
   - **修复建议**: 
     ```typescript
     // 在 useFollow 中添加检查
     const { data: targetProfile } = await supabase
       .from('profiles')
       .select('status')
       .eq('id', followingId)
       .single()
     
     if (targetProfile?.status === 'banned' || targetProfile?.status === 'suspended') {
       throw new Error('Cannot follow banned or suspended user')
     }
     ```

---

### 2.2 Chat / Message 功能

**代码位置**: 
- `src/components/social/ChatButton.tsx:45-123`
- `src/lib/hooks/useConversation.ts:10-72`

#### 功能流程
1. **点击 Chat**: `ChatButton` → `getOrCreateConversation(targetUserId)`
2. **检查黑名单**: 查询 `blocked_users` 表
3. **查找现有会话**: 查询 `conversations` 表（对称匹配）
4. **创建新会话**: `supabase.from('conversations').insert({ participant1_id, participant2_id, conversation_type: 'private' })`
5. **跳转**: `router.push(/messages/${conversationId})`

**RLS Policy**:
```sql
-- supabase/migrations/040_add_conversations_messages_rls_policies.sql
CREATE POLICY "Users can create private conversations" ON conversations
  FOR INSERT WITH CHECK (
    conversation_type = 'private'
    AND (participant1_id = auth.uid() OR participant2_id = auth.uid())
  );
```

**审计结果**:

✅ **正确**:
- 检查登录状态
- 检查不能给自己发私信
- 检查是否被拉黑
- RLS Policy 确保只能创建自己参与的会话
- 对称匹配避免重复创建会话

⚠️ **潜在问题**:

1. **并发创建会话**
   - **问题描述**: 两个用户同时点击 Chat，可能创建两个会话
   - **触发路径**: 用户 A 和用户 B 同时访问对方主页并点击 Chat
   - **涉及文件**: `src/lib/hooks/useConversation.ts:39-51`
   - **当前处理**: 使用 `maybeSingle()` 和对称匹配，但存在竞态条件
   - **修复建议**: 
     - 在数据库层面添加唯一约束：`UNIQUE(participant1_id, participant2_id, conversation_type)` 或使用 `LEAST/GREATEST` 排序
     - 使用数据库函数 `get_or_create_conversation()` 确保原子性

2. **未检查目标用户状态**
   - **问题描述**: 可以给被封禁用户发私信
   - **触发路径**: 给 `status = 'banned'` 的用户发私信
   - **涉及文件**: `src/lib/hooks/useConversation.ts:14-72`
   - **修复建议**: 添加目标用户状态检查

3. **会话创建后未验证权限**
   - **问题描述**: 创建会话后，如果目标用户拉黑了当前用户，会话仍然存在
   - **触发路径**: 创建会话后，目标用户拉黑当前用户
   - **涉及文件**: `src/app/[locale]/(main)/messages/[id]/page.tsx`
   - **修复建议**: 在消息页面加载时检查拉黑关系，如果被拉黑则禁止发送消息

---

### 2.3 打赏 / Tips 功能

**代码位置**: 
- `src/components/social/UserTipButton.tsx:23-284`
- `src/app/api/payments/stripe/create-user-tip-session/route.ts:10-179`
- `src/lib/payments/process-user-tip-payment.ts:18-152`

#### 功能流程
1. **前端检查**: `UserTipButton` 检查 `profile.tip_enabled` 和 `tipSubscription`
2. **点击打赏**: 调用 `/api/payments/stripe/create-user-tip-session`
3. **服务端验证**:
   - 检查登录状态
   - 检查打赏者订阅 (`checkTipEnabled`)
   - 检查不能给自己打赏
   - 检查是否被拉黑
   - 检查接收者 `tip_enabled`
   - 检查接收者打赏订阅
   - 检查打赏限额 (`checkTipLimits`)
4. **创建支付会话**: Stripe Checkout Session
5. **支付回调**: Webhook → `processUserTipPayment`

**审计结果**:

✅ **正确**:
- 前端和服务端双重检查 `tip_enabled`
- 检查不能给自己打赏
- 检查是否被拉黑
- 检查打赏者订阅状态
- 检查接收者订阅状态
- 检查打赏限额
- 使用服务端 Supabase Admin Client，绕过 RLS 进行验证

⚠️ **潜在问题**:

1. **前端校验可绕过**
   - **问题描述**: 前端检查 `tipEnabled` 可以绕过，直接调用 API
   - **触发路径**: 修改前端代码或直接调用 API，传入 `targetUserId`
   - **涉及文件**: `src/components/social/UserTipButton.tsx:83-92`
   - **当前处理**: ✅ 服务端已完整验证，前端校验仅为 UX 优化
   - **结论**: 无安全问题，但建议添加 API 限流

2. **金额验证不完整**
   - **问题描述**: 前端只检查 `> 0`，未检查最大值
   - **触发路径**: 传入极大金额（如 999999999）
   - **涉及文件**: `src/components/social/UserTipButton.tsx:94-103`
   - **当前处理**: 服务端 `checkTipLimits` 可能有限额检查
   - **修复建议**: 前端添加最大金额限制，提升 UX

3. **支付会话创建后状态变更**
   - **问题描述**: 创建支付会话后，如果接收者取消订阅或被拉黑，支付仍可能成功
   - **触发路径**: 创建会话 → 接收者取消订阅 → 完成支付
   - **涉及文件**: `src/app/api/payments/stripe/webhook/route.ts`
   - **修复建议**: 在 Webhook 处理支付成功时，再次验证所有条件

---

### 2.4 卖家 / 商品 / 带货入口

**代码位置**: 
- `src/app/[locale]/(main)/profile/[id]/page.tsx:387-399`
- `src/lib/hooks/useProducts.ts:96-145`

#### 功能流程
1. **显示商品 Tab**: 检查 `productsCount > 0`
2. **查询商品**: `useUserProducts(userId)` → 查询 `products` 表
3. **RLS Policy**: 只返回 `status = 'active'` 的商品

**RLS Policy**:
```sql
-- supabase/migrations/001_initial_schema.sql:347-350
CREATE POLICY "Users can view active products" ON products
  FOR SELECT USING (
    status = 'active' OR seller_id = auth.uid() OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'support')
    )
  );
```

**审计结果**:

✅ **正确**:
- 只显示 `status = 'active'` 的商品
- RLS Policy 确保只能查看活跃商品
- 商品查询使用 `seller_id = userId`，确保商品属于该用户

⚠️ **潜在问题**:

1. **未检查卖家状态**
   - **问题描述**: 可以查看被封禁卖家的商品
   - **触发路径**: 访问 `status = 'banned'` 的卖家主页，仍能看到商品 Tab
   - **涉及文件**: `src/app/[locale]/(main)/profile/[id]/page.tsx:387-399`
   - **修复建议**: 
     ```typescript
     // 检查卖家状态
     if (profile?.status === 'banned' || profile?.status === 'suspended') {
       // 不显示商品 Tab
     }
     ```

2. **商品数量查询性能**
   - **问题描述**: 使用 `count: 'exact'` 可能在大数据量时较慢
   - **触发路径**: 卖家有大量商品时
   - **涉及文件**: `src/app/[locale]/(main)/profile/[id]/page.tsx:58-69`
   - **修复建议**: 考虑使用缓存或估算值

3. **直接访问商品 API 越权**
   - **问题描述**: 如果存在商品详情 API，需要验证商品是否属于指定卖家
   - **触发路径**: 直接访问 `/api/products/[id]` 或 `/product/[id]`
   - **涉及文件**: `src/app/[locale]/(main)/product/[id]/page.tsx`
   - **修复建议**: 在商品详情页面验证 `product.seller_id` 与 URL 参数一致（如果从 profile 页面跳转）

---

## 三、联动链路完整性检查

### 3.1 Follow → Feed / Notification

**代码位置**: 
- `src/lib/hooks/useProfile.ts:129-133` (invalidateQueries)
- `supabase/migrations/035_update_follows_favorite_notification_trigger.sql` (Trigger)

**审计结果**:
- ✅ **正确**: Follow 后触发 `invalidateQueries`，更新 profile 计数
- ✅ **正确**: 存在 Trigger 自动更新 `profiles.follower_count`
- ⚠️ **问题**: 未检查 Feed 是否包含被关注用户的内容（可能被限制查看）

**修复建议**: 在 Feed 查询时检查 `restricted_view_users` 和 `blocked_users` 表

---

### 3.2 Chat → Conversation → Messages

**代码位置**: 
- `src/lib/hooks/useConversation.ts:14-72`
- `src/app/[locale]/(main)/messages/[id]/page.tsx`

**审计结果**:
- ✅ **正确**: 创建会话后跳转到消息页面
- ⚠️ **问题**: 消息页面可能未检查拉黑关系（需验证）

**修复建议**: 在消息页面加载时检查拉黑关系，如果被拉黑则禁止发送消息

---

### 3.3 Tips → Payment → Order / Ledger

**代码位置**: 
- `src/app/api/payments/stripe/webhook/route.ts`
- `src/lib/payments/process-user-tip-payment.ts:18-152`

**审计结果**:
- ✅ **正确**: 支付成功后创建 `tip_transactions` 记录
- ✅ **正确**: 创建通知给接收者
- ⚠️ **问题**: 未检查支付时的状态是否与创建会话时一致

**修复建议**: 在 Webhook 处理支付成功时，再次验证所有条件（订阅状态、拉黑关系等）

---

### 3.4 Profile → Posts → Post Detail → Like / Comment

**代码位置**: 
- `src/app/[locale]/(main)/profile/[id]/page.tsx:38`
- `src/lib/hooks/usePosts.ts:77-141`

**审计结果**:
- ✅ **正确**: 使用 `useUserPosts(userId, 'approved')` 只查询已审核帖子
- ✅ **正确**: RLS Policy 确保只返回 `status = 'approved'` 的帖子
- ⚠️ **问题**: 未检查帖子作者是否被封禁（RLS 已处理，但需确认）

**修复建议**: 确认 RLS Policy 已过滤被封禁用户的帖子（migration 153 已处理）

---

## 四、异常 & 安全视角

### 4.1 前端隐藏但 API 可直接调用的功能

**审计结果**:

1. **打赏功能**
   - **前端**: `UserTipButton` 检查 `tipEnabled` 后才显示按钮
   - **API**: `/api/payments/stripe/create-user-tip-session` 有完整验证
   - **结论**: ✅ 安全，服务端验证完整

2. **关注功能**
   - **前端**: `FollowButton` 检查登录和不能关注自己
   - **API**: 直接调用 Supabase，依赖 RLS Policy
   - **结论**: ✅ 安全，RLS Policy 确保只能操作自己的关注关系

3. **私信功能**
   - **前端**: `ChatButton` 检查登录和不能给自己发私信
   - **API**: 直接调用 Supabase，依赖 RLS Policy
   - **结论**: ✅ 安全，RLS Policy 确保只能创建自己参与的会话

---

### 4.2 RLS 缺失导致的数据泄露

**审计结果**:

1. **Profiles 表**
   - **RLS Policy**: `FOR SELECT USING (true)` - 允许所有人查看
   - **代码层面**: 查询时明确指定公开字段
   - **结论**: 🟠 存在风险，但代码层面已缓解
   - **修复建议**: 迁移到使用 `public_profiles` 视图

2. **Posts 表**
   - **RLS Policy**: 只返回 `status = 'approved'` 的帖子
   - **结论**: ✅ 安全

3. **Products 表**
   - **RLS Policy**: 只返回 `status = 'active'` 的商品
   - **结论**: ✅ 安全

4. **Conversations 表**
   - **RLS Policy**: 只能查看自己参与的会话
   - **结论**: ✅ 安全

5. **Follows 表**
   - **RLS Policy**: 允许所有人查看（用于显示关注数）
   - **结论**: ✅ 安全，不涉及敏感信息

---

### 4.3 Client 直连 Supabase 表是否存在越权

**审计结果**:

所有 Client 端 Supabase 调用都依赖 RLS Policy，审计结果如下：

1. **Profiles 查询**: ✅ 安全（查询指定字段）
2. **Posts 查询**: ✅ 安全（RLS 过滤）
3. **Products 查询**: ✅ 安全（RLS 过滤）
4. **Follows 插入/删除**: ✅ 安全（RLS 确保只能操作自己的）
5. **Conversations 插入**: ✅ 安全（RLS 确保只能创建自己参与的）

**结论**: ✅ 所有 Client 端调用都有 RLS 保护，不存在越权风险

---

### 4.4 服务端 API 是否信任前端传参

**审计结果**:

1. **打赏 API** (`/api/payments/stripe/create-user-tip-session`)
   - **传参**: `targetUserId`, `amount`
   - **验证**: ✅ 使用 `auth.uid()` 获取当前用户，不信任 `targetUserId`
   - **结论**: ✅ 安全

2. **其他 API**: 未发现其他相关 API 调用

**结论**: ✅ 服务端 API 不信任前端传参，使用 `auth.uid()` 获取当前用户

---

## 五、总结

### 🔴 严重问题（会导致越权 / 资金 / 数据泄露）

1. **未检查目标用户状态（封禁/暂停）**
   - **位置**: `src/app/[locale]/(main)/profile/[id]/page.tsx:147-189`
   - **影响**: 可以查看被封禁用户的主页
   - **修复**: 在页面加载时检查 `profile.status`

2. **未检查拉黑关系**
   - **位置**: `src/app/[locale]/(main)/profile/[id]/page.tsx`
   - **影响**: 被拉黑用户可以查看拉黑者的主页
   - **修复**: 添加 `blocked_users` 表检查

3. **关注功能未检查目标用户状态**
   - **位置**: `src/lib/hooks/useProfile.ts:77-135`
   - **影响**: 可以关注被封禁用户
   - **修复**: 在 `useFollow` 中添加目标用户状态检查

4. **私信功能未检查目标用户状态**
   - **位置**: `src/lib/hooks/useConversation.ts:14-72`
   - **影响**: 可以给被封禁用户发私信
   - **修复**: 在 `getOrCreateConversation` 中添加目标用户状态检查

---

### 🟠 中等问题（状态不一致 / UX 错误 / 潜在 Bug）

1. **并发创建会话**
   - **位置**: `src/lib/hooks/useConversation.ts:39-51`
   - **影响**: 可能创建重复会话
   - **修复**: 使用数据库唯一约束或原子函数

2. **UI 状态与 DB 不一致**
   - **位置**: `src/lib/hooks/useProfile.ts:129-133`
   - **影响**: 关注状态可能显示错误
   - **修复**: 使用乐观更新，失败时回滚

3. **商品 Tab 显示逻辑**
   - **位置**: `src/app/[locale]/(main)/profile/[id]/page.tsx:387-399`
   - **影响**: 被封禁卖家仍显示商品 Tab
   - **修复**: 检查卖家状态后再显示

4. **支付会话创建后状态变更**
   - **位置**: `src/app/api/payments/stripe/webhook/route.ts`
   - **影响**: 支付时状态可能与创建会话时不一致
   - **修复**: 在 Webhook 中再次验证所有条件

---

### 🟢 可优化项（结构 / 性能 / DX）

1. **使用 public_profiles 视图**
   - **位置**: `src/lib/hooks/useProfile.ts:32-36`
   - **建议**: 迁移到使用 `public_profiles` 视图，在数据库层面限制字段访问

2. **添加 Suspense 或骨架屏**
   - **位置**: `src/app/[locale]/(main)/profile/[id]/page.tsx`
   - **建议**: 优化首次加载体验

3. **商品数量查询性能**
   - **位置**: `src/app/[locale]/(main)/profile/[id]/page.tsx:58-69`
   - **建议**: 考虑使用缓存或估算值

4. **前端金额验证**
   - **位置**: `src/components/social/UserTipButton.tsx:94-103`
   - **建议**: 添加最大金额限制，提升 UX

---

## 六、修复优先级建议

### P0（立即修复）
1. 检查目标用户状态（封禁/暂停）
2. 检查拉黑关系

### P1（本周修复）
1. 关注/私信功能添加目标用户状态检查
2. 并发创建会话问题

### P2（本月修复）
1. UI 状态一致性优化
2. 支付会话状态验证
3. 商品 Tab 显示逻辑

### P3（优化）
1. 使用 public_profiles 视图
2. 性能优化（Suspense、缓存等）

---

**审计完成时间**: 2026-01-26  
**审计人员**: AI Assistant  
**报告版本**: v1.0
