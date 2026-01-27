# 自己 Profile 页面安全审计报告

**审计时间**: 2026-01-26  
**审计范围**: `/profile/[id]` 页面（访问自己主页场景）  
**审计角色**: 真实已登录用户（访问自己的 Profile 页面）  
**访问路径**: `http://localhost:3000/zh/profile/60bc38f2-da86-4fa3-b9b1-16c77066f790`  
**用户 ID**: `60bc38f2-da86-4fa3-b9b1-16c77066f790`

---

## 一、页面初始化 & 身份分支判断

### 1.1 身份判断逻辑

**代码位置**: `src/app/[locale]/(main)/profile/[id]/page.tsx:141`

```typescript
const isOwnProfile = user?.id === userId
```

**审计结果**:

✅ **正确**:
- 使用 `user?.id === userId` 判断是否为自己的页面
- `user` 来自 `useAuth()`，从 Supabase session 获取
- `userId` 来自 URL 参数 `params.id`

⚠️ **潜在问题**:

1. **仅前端判断，后端未校验**
   - **问题描述**: `isOwnProfile` 仅用于前端 UI 显示，所有数据查询都使用 `userId`（URL 参数）
   - **触发路径**: 如果 URL 参数被篡改（如 `/profile/other-user-id`），前端会显示他人数据，但 UI 仍显示"编辑"按钮
   - **涉及文件**: `src/app/[locale]/(main)/profile/[id]/page.tsx:141`
   - **修复建议**: 
     - 所有数据查询应使用 `user.id` 而非 `userId`（当 `isOwnProfile` 为 true 时）
     - 或添加服务端 API 验证，确保只能查询自己的数据

2. **URL 参数可被伪造**
   - **问题描述**: `userId` 直接来自 URL 参数，未验证是否与 session 用户一致
   - **触发路径**: 用户访问 `/profile/other-user-id`，如果该用户不存在或查询失败，可能泄露错误信息
   - **涉及文件**: `src/app/[locale]/(main)/profile/[id]/page.tsx:34`
   - **修复建议**: 
     - 在页面加载时，如果 `userId !== user.id`，应重定向到 `/profile/${user.id}`
     - 或使用服务端组件验证 URL 参数

---

### 1.2 数据加载

**代码位置**: `src/app/[locale]/(main)/profile/[id]/page.tsx:36-38`

```typescript
const { data: profile, isLoading: profileLoading, error: profileError } = useProfile(userId)
const { data: postsData, isLoading: postsLoading } = useUserPosts(userId, 'approved')
```

**审计结果**:

✅ **正确**:
- 使用 `useProfile(userId)` 查询 profile 数据
- 使用 `useUserPosts(userId, 'approved')` 查询帖子（只查询已审核的）
- 查询使用 Supabase client，依赖 RLS Policy

⚠️ **潜在问题**:

1. **未查询草稿帖子**
   - **问题描述**: 自己的页面只显示 `status = 'approved'` 的帖子，不显示草稿
   - **触发路径**: 用户访问自己主页，看不到草稿帖子
   - **涉及文件**: `src/app/[locale]/(main)/profile/[id]/page.tsx:38`
   - **修复建议**: 
     - 如果是自己的页面，应额外查询 `status = 'draft'` 的帖子
     - 或添加"草稿"Tab，只对自己可见

2. **未查询私有数据**
   - **问题描述**: 自己的页面未查询私有数据（如：收益、订单统计、卖家数据）
   - **触发路径**: 用户访问自己主页，看不到收益统计
   - **涉及文件**: `src/app/[locale]/(main)/profile/[id]/page.tsx`
   - **修复建议**: 
     - 如果是自己的页面，可以显示收益统计（但需确保 RLS 保护）
     - 或通过单独的 Dashboard 页面显示

3. **Profile 查询字段限制**
   - **问题描述**: `useProfile` 只查询公开字段，不包含敏感信息（如 email、收益等）
   - **触发路径**: 自己的页面也无法看到自己的 email
   - **涉及文件**: `src/lib/hooks/useProfile.ts:32-36`
   - **修复建议**: 
     - 如果是自己的页面，应查询完整 profile 数据（包括 email 等）
     - 或创建 `useOwnProfile` hook，返回完整数据

---

### 1.3 UI 分支显示

**代码位置**: `src/app/[locale]/(main)/profile/[id]/page.tsx:280-345`

```typescript
{isOwnProfile && (
  <div className="flex flex-wrap gap-2 sm:gap-3 pt-2">
    {/* Admin Panel, Seller Center, Affiliate Center, etc. */}
  </div>
)}
```

**审计结果**:

✅ **正确**:
- 使用 `isOwnProfile` 控制显示/隐藏
- 只显示管理入口（Admin Panel、Seller Center 等）
- 不显示 Follow/Chat/Tip 按钮

⚠️ **潜在问题**:

1. **UI 隐藏但 API 可访问**
   - **问题描述**: 管理入口（如 `/seller/dashboard`）的链接存在，即使前端隐藏，仍可通过直接访问 URL 访问
   - **触发路径**: 直接访问 `/seller/dashboard` 或其他管理页面
   - **涉及文件**: `src/app/[locale]/(main)/profile/[id]/page.tsx:291-297`
   - **修复建议**: 
     - ✅ 已在各管理页面添加权限检查（如 `useSellerGuard`）
     - 确保所有管理页面都有服务端权限验证

2. **Favorites Tab 只对自己可见**
   - **问题描述**: Favorites Tab 使用 `isOwnProfile` 控制显示
   - **触发路径**: 访问他人主页时，Favorites Tab 不显示
   - **涉及文件**: `src/app/[locale]/(main)/profile/[id]/page.tsx:466-478`
   - **结论**: ✅ 正确，无安全问题

---

## 二、编辑 & 管理类功能推演（高风险区）

### 2.1 Edit Profile

**代码位置**: `src/app/[locale]/(main)/profile/[id]/edit/page.tsx`

#### 功能流程
1. **页面加载**: 检查 `user.id === profile.id`
2. **表单提交**: 更新 `profiles` 表
3. **字段更新**: `display_name`, `username`, `bio`, `location`, `avatar_url`

**审计结果**:

✅ **正确**:
- 前端检查 `user.id !== profile.id` 时重定向
- 更新时使用 `.eq('id', user.id)` 确保只能更新自己的 profile
- 只更新允许的字段（不包含敏感字段如 `role`、`balance` 等）

⚠️ **潜在问题**:

1. **Mass Assignment 风险**
   - **问题描述**: 更新时明确指定字段，但未验证字段是否允许修改
   - **触发路径**: 如果未来添加新字段，可能被误更新
   - **涉及文件**: `src/app/[locale]/(main)/profile/[id]/edit/page.tsx:151-161`
   - **修复建议**: 
     - 使用白名单机制，只允许更新指定字段
     - 或使用数据库函数限制可更新字段

2. **Username 唯一性检查**
   - **问题描述**: 检查 username 唯一性时，使用 `.neq('id', user.id)` 排除当前用户
   - **触发路径**: 如果并发更新，可能创建重复 username
   - **涉及文件**: `src/app/[locale]/(main)/profile/[id]/edit/page.tsx:127-137`
   - **修复建议**: 
     - 在数据库层面添加唯一约束
     - 使用数据库函数进行原子性检查

3. **RLS Policy 验证**
   - **问题描述**: 更新依赖 RLS Policy，但未明确验证
   - **触发路径**: 如果 RLS Policy 配置错误，可能允许更新他人 profile
   - **涉及文件**: `src/app/[locale]/(main)/profile/[id]/edit/page.tsx:151-161`
   - **修复建议**: 
     - 确认 RLS Policy: `FOR UPDATE USING (auth.uid() = id)`
     - 添加服务端 API 验证

---

### 2.2 Settings / 隐私配置

**代码位置**: 未找到专门的 Settings 页面

**审计结果**:

⚠️ **缺失**:
- 未找到隐私配置页面（如：是否允许他人查看、是否允许打赏等）
- 如果存在，需要检查：
  - 配置是否即时生效
  - 是否影响他人访问时的可见性
  - 是否存在缓存未失效问题

**修复建议**: 
- 如果存在隐私配置，应添加服务端验证
- 使用数据库触发器或函数确保配置即时生效

---

### 2.3 内容管理（Posts / Drafts）

**代码位置**: `src/lib/hooks/usePosts.ts:77-125`

**审计结果**:

⚠️ **问题**:

1. **草稿未显示**
   - **问题描述**: 自己的页面只显示 `status = 'approved'` 的帖子，不显示草稿
   - **触发路径**: 用户访问自己主页，看不到草稿帖子
   - **涉及文件**: `src/app/[locale]/(main)/profile/[id]/page.tsx:38`
   - **修复建议**: 
     - 如果是自己的页面，应查询所有状态的帖子（包括 `draft`、`pending` 等）
     - 或添加"草稿"Tab，只对自己可见

2. **草稿访问权限**
   - **问题描述**: 如果直接访问草稿帖子 URL（如 `/post/[id]`），需要验证是否属于当前用户
   - **触发路径**: 直接访问草稿帖子 URL
   - **涉及文件**: `src/app/[locale]/(main)/post/[id]/page.tsx`
   - **修复建议**: 
     - 在帖子详情页面检查：如果是草稿，只允许作者访问
     - 使用 RLS Policy 限制草稿访问

3. **删除/编辑后影响**
   - **问题描述**: 删除/编辑帖子后，是否影响 Feed / Search
   - **触发路径**: 删除帖子后，Feed 中仍可能显示
   - **涉及文件**: 帖子管理相关代码
   - **修复建议**: 
     - 删除帖子时，应更新相关缓存
     - 使用数据库触发器自动处理关联数据

---

## 三、社交功能（自己视角的特殊逻辑）

### 3.1 Follow

**代码位置**: `src/lib/hooks/useProfile.ts:79-148`

**审计结果**:

✅ **正确**:
- 检查 `user.id === followingId` 时抛出错误
- RLS Policy 确保只能插入自己的关注关系
- UI 隐藏 Follow 按钮（`FollowButton` 在 `!isOwnProfile` 时显示）

⚠️ **潜在问题**:

1. **UI 隐藏但 API 未限制**
   - **问题描述**: 虽然 UI 隐藏了 Follow 按钮，但如果直接调用 API，可能仍能关注自己
   - **触发路径**: 直接调用 `useFollow().mutate({ followingId: user.id, shouldFollow: true })`
   - **涉及文件**: `src/lib/hooks/useProfile.ts:93`
   - **当前处理**: ✅ 代码已检查 `user.id === followingId`，会抛出错误
   - **结论**: 无安全问题，但建议添加 RLS Policy 限制

2. **数据库约束缺失**
   - **问题描述**: 如果数据库没有唯一约束或检查约束，可能创建 `follows(self, self)` 记录
   - **触发路径**: 绕过前端检查，直接插入数据库
   - **涉及文件**: `supabase/migrations/049_add_follows_rls_policies.sql`
   - **修复建议**: 
     - 添加数据库检查约束：`CHECK (follower_id != followee_id)`
     - 或使用数据库函数验证

---

### 3.2 Chat

**代码位置**: `src/lib/hooks/useConversation.ts:14-78`

**审计结果**:

✅ **正确**:
- 检查 `otherUserId === user.id` 时抛出错误
- UI 隐藏 Chat 按钮（`ChatButton` 在 `!isOwnProfile` 时显示）
- RLS Policy 确保只能创建自己参与的会话

⚠️ **潜在问题**:

1. **UI 隐藏但 API 未限制**
   - **问题描述**: 虽然 UI 隐藏了 Chat 按钮，但如果直接调用 API，可能仍能创建 self-chat
   - **触发路径**: 直接调用 `getOrCreateConversation(user.id)`
   - **涉及文件**: `src/lib/hooks/useConversation.ts:22-24`
   - **当前处理**: ✅ 代码已检查 `otherUserId === user.id`，会抛出错误
   - **结论**: 无安全问题

2. **数据库约束缺失**
   - **问题描述**: 如果数据库没有检查约束，可能创建 `conversations(participant1_id = participant2_id)` 记录
   - **触发路径**: 绕过前端检查，直接插入数据库
   - **涉及文件**: `supabase/migrations/040_add_conversations_messages_rls_policies.sql`
   - **修复建议**: 
     - 添加数据库检查约束：`CHECK (participant1_id != participant2_id)`
     - 或使用数据库函数验证

---

### 3.3 Block / Mute（如果存在）

**代码位置**: 未找到 Block/Mute 功能

**审计结果**:

⚠️ **缺失**:
- 未找到 Block/Mute 功能
- 如果存在，需要检查：
  - 是否禁止拉黑自己
  - 是否影响全局状态
  - 是否可能误伤其他用户数据

**修复建议**: 
- 如果存在 Block/Mute 功能，应添加服务端验证
- 禁止拉黑自己
- 使用数据库约束确保数据一致性

---

## 四、打赏 / 支付 / 资金相关（最高风险）

### 4.1 Tips / 打赏

**代码位置**: 
- `src/components/social/UserTipButton.tsx:105-112`
- `src/app/api/payments/stripe/create-user-tip-session/route.ts:79-85`

**审计结果**:

✅ **正确**:
- 前端检查 `user.id === targetUserId` 时显示提示
- 服务端检查 `targetUserId === user.id` 时返回 400 错误
- 双重验证确保不能给自己打赏

⚠️ **潜在问题**:

1. **前端校验可绕过**
   - **问题描述**: 前端检查可以绕过，直接调用 API
   - **触发路径**: 直接调用 `/api/payments/stripe/create-user-tip-session`，传入 `targetUserId = user.id`
   - **涉及文件**: `src/components/social/UserTipButton.tsx:105-112`
   - **当前处理**: ✅ 服务端已完整验证，会返回 400 错误
   - **结论**: 无安全问题

2. **支付回调验证**
   - **问题描述**: 支付回调时，是否再次验证不能给自己打赏
   - **触发路径**: 创建支付会话后，如果状态变更，支付仍可能成功
   - **涉及文件**: `src/app/api/payments/stripe/webhook/route.ts`
   - **修复建议**: 
     - 在 Webhook 处理支付成功时，再次验证 `tipperId !== recipientId`
     - 确保所有支付相关函数都有此检查

---

### 4.2 收益展示

**代码位置**: 未在 profile 页面找到收益展示

**审计结果**:

⚠️ **缺失**:
- Profile 页面未显示收益统计
- 收益数据应在 Seller Dashboard 或其他管理页面显示
- 如果未来添加，需要确保：
  - 只在本人页面显示
  - 不在 SSR 阶段泄露
  - 使用 RLS Policy 保护

**修复建议**: 
- 如果添加收益展示，应使用服务端 API 查询
- 确保 RLS Policy 只允许查询自己的收益数据
- 不在 SSR 阶段查询敏感数据

---

### 4.3 Seller / 商品管理

**代码位置**: 
- `src/app/[locale]/(main)/profile/[id]/page.tsx:54-69`
- `src/app/[locale]/(main)/seller/dashboard/page.tsx`

**审计结果**:

✅ **正确**:
- 商品查询使用 `seller_id = userId`，确保只查询该用户的商品
- RLS Policy 确保只能查看活跃商品
- Seller Dashboard 使用 `useSellerGuard` 验证权限

⚠️ **潜在问题**:

1. **商品数量查询性能**
   - **问题描述**: 使用 `count: 'exact'` 可能在大数据量时较慢
   - **触发路径**: 卖家有大量商品时
   - **涉及文件**: `src/app/[locale]/(main)/profile/[id]/page.tsx:58-69`
   - **修复建议**: 考虑使用缓存或估算值

2. **Seller Dashboard 数据泄露**
   - **问题描述**: Seller Dashboard 查询订单、收益等敏感数据
   - **触发路径**: 如果权限检查失败，可能泄露他人数据
   - **涉及文件**: `src/app/[locale]/(main)/seller/dashboard/page.tsx:48-134`
   - **当前处理**: ✅ 使用 `useSellerGuard` 验证权限
   - **修复建议**: 
     - 确保所有查询都使用 `user.id` 而非 URL 参数
     - 添加服务端 API 验证

---

## 五、联动链路完整性检查

### 5.1 Edit Profile → Profile Public View

**代码位置**: `src/app/[locale]/(main)/profile/[id]/edit/page.tsx:166`

**审计结果**:

✅ **正确**:
- 更新后调用 `queryClient.invalidateQueries({ queryKey: ['profile', userId] })`
- 重定向到 `/profile/${userId}` 查看更新后的 profile
- 缓存失效机制正常

⚠️ **潜在问题**:

1. **缓存失效不完整**
   - **问题描述**: 只失效了 `['profile', userId]` 的缓存，可能还有其他相关缓存未失效
   - **触发路径**: 更新 profile 后，其他页面可能仍显示旧数据
   - **涉及文件**: `src/app/[locale]/(main)/profile/[id]/edit/page.tsx:166`
   - **修复建议**: 
     - 失效所有相关的 profile 缓存
     - 或使用全局缓存失效策略

---

### 5.2 Post 管理 → Feed / Search / Topic

**代码位置**: 未找到帖子管理功能

**审计结果**:

⚠️ **缺失**:
- 未找到帖子管理功能（如：编辑、删除、发布草稿等）
- 如果存在，需要检查：
  - 编辑/删除后是否影响 Feed
  - 是否影响 Search 索引
  - 是否影响 Topic 关联

**修复建议**: 
- 如果存在帖子管理功能，应添加缓存失效机制
- 使用数据库触发器自动处理关联数据
- 确保 Search 索引及时更新

---

### 5.3 Follow 数变化 → 自己统计 vs 他人看到的数据

**代码位置**: `src/lib/hooks/useProfile.ts:142-145`

**审计结果**:

✅ **正确**:
- Follow 后调用 `invalidateQueries` 更新 profile 计数
- 存在 Trigger 自动更新 `profiles.follower_count`
- 计数更新机制正常

⚠️ **潜在问题**:

1. **计数不一致**
   - **问题描述**: 如果 Trigger 失败，计数可能不一致
   - **触发路径**: 数据库 Trigger 执行失败
   - **涉及文件**: `supabase/migrations/004_update_counts_triggers.sql`
   - **修复建议**: 
     - 添加监控和告警机制
     - 定期校验计数准确性

---

### 5.4 Seller 设置 → 商品可见性

**代码位置**: 未找到 Seller 设置功能

**审计结果**:

⚠️ **缺失**:
- 未找到 Seller 设置功能（如：商品可见性、收益设置等）
- 如果存在，需要检查：
  - 设置是否即时生效
  - 是否影响商品查询
  - 是否存在缓存未失效问题

**修复建议**: 
- 如果存在 Seller 设置功能，应添加缓存失效机制
- 使用数据库触发器确保设置即时生效

---

### 5.5 Tips → Ledger → Balance → 提现

**代码位置**: 未找到完整的打赏链路

**审计结果**:

⚠️ **缺失**:
- 未找到完整的打赏链路（Ledger、Balance、提现等）
- 如果存在，需要检查：
  - 打赏是否记录到 Ledger
  - Balance 是否及时更新
  - 提现是否验证余额

**修复建议**: 
- 如果存在打赏链路，应使用数据库事务确保一致性
- 添加余额校验机制
- 使用数据库触发器自动更新余额

---

## 六、安全 & 架构视角（怀疑一切）

### 6.1 前端"只隐藏 UI"但 API 未限制的功能

**审计结果**:

1. **Edit Profile**
   - **前端**: 只在 `isOwnProfile` 时显示编辑按钮
   - **API**: 直接调用 Supabase，依赖 RLS Policy
   - **结论**: ✅ 安全，RLS Policy 确保只能更新自己的 profile

2. **Follow**
   - **前端**: 只在 `!isOwnProfile` 时显示 Follow 按钮
   - **API**: 检查 `user.id === followingId` 时抛出错误
   - **结论**: ✅ 安全，前后端双重验证

3. **Chat**
   - **前端**: 只在 `!isOwnProfile` 时显示 Chat 按钮
   - **API**: 检查 `otherUserId === user.id` 时抛出错误
   - **结论**: ✅ 安全，前后端双重验证

4. **Tips**
   - **前端**: 只在 `!isOwnProfile` 时显示 Tip 按钮
   - **API**: 检查 `targetUserId === user.id` 时返回 400 错误
   - **结论**: ✅ 安全，前后端双重验证

---

### 6.2 Supabase client 直连表是否存在本人以外的数据可读

**审计结果**:

所有 Client 端 Supabase 调用都依赖 RLS Policy，审计结果如下：

1. **Profiles 查询**: ✅ 安全（查询指定字段，RLS 允许所有人查看公开字段）
2. **Posts 查询**: ✅ 安全（RLS 过滤，只返回 `status = 'approved'` 的帖子）
3. **Products 查询**: ✅ 安全（RLS 过滤，只返回 `status = 'active'` 的商品）
4. **Orders 查询**: ✅ 安全（RLS 确保只能查询自己的订单）
5. **Favorites 查询**: ✅ 安全（RLS 确保只能查询自己的收藏）

**结论**: ✅ 所有 Client 端调用都有 RLS 保护，不存在越权风险

---

### 6.3 Service Role API 是否错误信任 client 传参

**审计结果**:

1. **打赏 API** (`/api/payments/stripe/create-user-tip-session`)
   - **传参**: `targetUserId`, `amount`
   - **验证**: ✅ 使用 `auth.uid()` 获取当前用户，不信任 `targetUserId`
   - **结论**: ✅ 安全

2. **Profile 更新**
   - **传参**: 无（直接使用 Supabase client）
   - **验证**: ✅ 使用 `.eq('id', user.id)` 确保只能更新自己的 profile
   - **结论**: ✅ 安全

3. **其他 API**: 未发现其他相关 API 调用

**结论**: ✅ 服务端 API 不信任前端传参，使用 `auth.uid()` 或 `user.id` 获取当前用户

---

### 6.4 user_id / profile_id 是否可被伪造

**审计结果**:

1. **URL 参数 `userId`**
   - **问题描述**: `userId` 来自 URL 参数，可被伪造
   - **触发路径**: 访问 `/profile/other-user-id`
   - **当前处理**: 
     - 前端使用 `isOwnProfile` 判断，但数据查询仍使用 `userId`
     - 如果 `userId !== user.id`，会显示他人数据，但 UI 显示"编辑"按钮（因为 `isOwnProfile = false`）
   - **修复建议**: 
     - 如果是自己的页面，所有数据查询应使用 `user.id` 而非 `userId`
     - 或添加服务端验证，确保只能查询自己的数据

2. **API 参数 `targetUserId`**
   - **问题描述**: 打赏 API 接收 `targetUserId` 参数
   - **触发路径**: 调用 API 时传入他人的 `targetUserId`
   - **当前处理**: ✅ 服务端验证 `targetUserId !== user.id`，确保不能给自己打赏
   - **结论**: ✅ 安全

**结论**: 🟠 存在风险，URL 参数可被伪造，但影响有限（只能查看他人数据，无法修改）

---

## 七、总结

### 🔴 严重问题（会导致越权 / 资金 / 数据泄露）

1. **URL 参数可被伪造，数据查询使用 URL 参数**
   - **位置**: `src/app/[locale]/(main)/profile/[id]/page.tsx:34-38`
   - **影响**: 访问 `/profile/other-user-id` 时，会查询并显示他人数据（虽然 UI 显示"编辑"按钮，但实际无法编辑）
   - **修复**: 
     - 如果是自己的页面，所有数据查询应使用 `user.id` 而非 `userId`
     - 或添加服务端验证，确保只能查询自己的数据

2. **草稿帖子未显示**
   - **位置**: `src/app/[locale]/(main)/profile/[id]/page.tsx:38`
   - **影响**: 用户访问自己主页，看不到草稿帖子
   - **修复**: 
     - 如果是自己的页面，应查询所有状态的帖子（包括 `draft`、`pending` 等）
     - 或添加"草稿"Tab，只对自己可见

3. **Profile 查询字段限制，自己的页面也无法看到完整数据**
   - **位置**: `src/lib/hooks/useProfile.ts:32-36`
   - **影响**: 自己的页面也无法看到 email 等敏感信息
   - **修复**: 
     - 如果是自己的页面，应查询完整 profile 数据（包括 email 等）
     - 或创建 `useOwnProfile` hook，返回完整数据

---

### 🟠 中等问题（逻辑错误 / 状态不一致）

1. **Mass Assignment 风险**
   - **位置**: `src/app/[locale]/(main)/profile/[id]/edit/page.tsx:151-161`
   - **影响**: 如果未来添加新字段，可能被误更新
   - **修复**: 使用白名单机制，只允许更新指定字段

2. **Username 唯一性检查并发问题**
   - **位置**: `src/app/[locale]/(main)/profile/[id]/edit/page.tsx:127-137`
   - **影响**: 并发更新可能创建重复 username
   - **修复**: 在数据库层面添加唯一约束

3. **缓存失效不完整**
   - **位置**: `src/app/[locale]/(main)/profile/[id]/edit/page.tsx:166`
   - **影响**: 更新 profile 后，其他页面可能仍显示旧数据
   - **修复**: 失效所有相关的 profile 缓存

4. **商品数量查询性能**
   - **位置**: `src/app/[locale]/(main)/profile/[id]/page.tsx:58-69`
   - **影响**: 卖家有大量商品时，查询可能较慢
   - **修复**: 考虑使用缓存或估算值

---

### 🟢 可优化项（体验 / 架构 / 性能）

1. **添加草稿 Tab**
   - **位置**: `src/app/[locale]/(main)/profile/[id]/page.tsx`
   - **建议**: 添加"草稿"Tab，只对自己可见，显示所有状态的帖子

2. **添加收益统计**
   - **位置**: `src/app/[locale]/(main)/profile/[id]/page.tsx`
   - **建议**: 如果是自己的页面，可以显示收益统计（但需确保 RLS 保护）

3. **优化 Profile 查询**
   - **位置**: `src/lib/hooks/useProfile.ts`
   - **建议**: 创建 `useOwnProfile` hook，返回完整数据（包括 email 等）

4. **添加服务端验证**
   - **位置**: `src/app/[locale]/(main)/profile/[id]/page.tsx`
   - **建议**: 使用服务端组件验证 URL 参数，确保只能访问自己的页面

---

## 八、修复优先级建议

### P0（立即修复）
1. URL 参数验证：确保只能查询自己的数据
2. 草稿帖子显示：自己的页面应显示草稿
3. Profile 查询优化：自己的页面应查询完整数据

### P1（本周修复）
1. Mass Assignment 防护
2. Username 唯一性约束
3. 缓存失效优化

### P2（本月修复）
1. 商品数量查询性能优化
2. 添加收益统计（如果适用）
3. 添加服务端验证

### P3（优化）
1. 添加草稿 Tab
2. 优化 Profile 查询架构
3. 添加更多私有数据展示

---

**审计完成时间**: 2026-01-26  
**审计人员**: AI Assistant  
**报告版本**: v1.0
