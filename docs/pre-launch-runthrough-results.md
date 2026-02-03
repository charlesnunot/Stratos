# 预发布推演结果表

与 [pre-launch-intent-runthrough-checklist.md](pre-launch-intent-runthrough-checklist.md) 配套使用；**10 大项总表**见 [pre-launch-systematic-checklist.md](pre-launch-systematic-checklist.md)。  
**列说明**：用例 ID、意图简述、代码验证、手工结果、备注、执行人、执行日期。

- **代码验证**：基于代码阅读/静态检查得出的结论（通过/缺口/不适用）。
- **手工结果**：在 staging/预发环境执行后的结果（通过/失败/阻塞），由 QA/开发填写。
- **优先级**：P0 必过；P1 强推；P2 建议。

---

## 一、账号与身份（6 个）— P0 部分 / P2 部分

| 用例 ID | 意图简述 | 代码验证 | 手工结果 | 备注 | 执行人 | 执行日期 |
|---------|----------|----------|----------|------|--------|----------|
| 1.1 | 游客 → 触发需要登录的行为（聊天/下单） | ✅ 通过 | | useAuthGuard 用 pathname 写 redirect；登录页用 validateRedirectUrl 且去掉 locale 段再 router.push，无重复 locale；middleware 不拦未登录 | | | |
| 1.2 | 登录成功 → 用户资料未完成 | ⚠️ 需手工 | | 发帖/卖家中心等用 useAuthGuard 仅校验 user；未发现对 profile 缺失的显式防护，RLS/默认值需在 staging 验证是否 500 | | | |
| 1.3 | 登录状态过期 → 执行写操作 | ✅ 通过 | | 写操作 API 均 `getUser()` 后无 user 则 401；AuthProvider 在 SIGNED_OUT 时 showInfo「登录已过期，请重新登录」；无全局 401→redirect，各页面自行处理 | | | |
| 1.4 | 多设备同时登录 → 状态同步 | ✅ 通过 | | 依赖 Supabase session 刷新；middleware 每次请求 updateSession，服务端与客户端共用 cookie | | | |
| 1.5 | 登出后 → 旧页面仍可操作？ | ✅ 通过 | | 写操作 API 均校验 user，无 user 则 401；不暴露他人数据 | | | |
| 1.6 | 被封禁/冻结用户的行为边界 | ✅ 通过 | | middleware updateSession 查 profiles.status，banned/suspended 重定向到 /{locale}/banned；消息 API 校验发送方/对方 banned | | | |

---

## 二、用户资料与社交关系（7 个）— P1

| 用例 ID | 意图简述 | 代码验证 | 手工结果 | 备注 | 执行人 | 执行日期 |
|---------|----------|----------|----------|------|--------|----------|
| 2.1 | 编辑个人资料（并发保存/刷新） | ✅ 通过 | | PATCH /api/settings 为 update by user_id，最后写入生效；无乐观锁，冲突时以服务端为准 | | | |
| 2.2 | 访问他人 profile（权限/可见性） | ⚠️ 部分 | | useUserPage 有 canViewProfile/canViewPosts，基于 relationship、blocked、status；profile_visibility 在 user_settings，RLS 或 profile 接口是否按 public/followers/private 过滤需手工或 RLS 确认 | | | |
| 2.3 | 关注用户 | ✅ 通过 | | useProfile follow 用 insert，23505 忽略（幂等）；被拉黑/封禁时抛错 | | | |
| 2.4 | 取消关注 | ✅ 通过 | | useProfile unfollow 用 delete by follower_id+followee_id，未关注时 0 行无错 | | | |
| 2.5 | 拉黑用户 | ✅ 通过 | | useBlock 校验 user.id !== blockedUserId（不能拉黑自己）；insert 23505 忽略 | | | |
| 2.6 | 解除拉黑 | ✅ 通过 | | useBlock delete by blocker_id+blocked_id，幂等 | | | |
| 2.7 | 被拉黑后，旧入口是否还能操作 | ✅ 通过 | | messages API 校验 blocked_users 返回 403；useUserPage blocked_by_target 时 status=unavailable、canViewPosts=false | | | |

---

## 三、帖子与内容系统（8 个）— P1

| 用例 ID | 意图简述 | 代码验证 | 手工结果 | 备注 | 执行人 | 执行日期 |
|---------|----------|----------|----------|------|--------|----------|
| 3.1 | 发布帖子 | ✅ 通过 | | post/create 直接 insert posts；topic/products 失败时回滚删除 post；useAuthGuard 鉴权 | | | |
| 3.2 | 编辑帖子 | ✅ 通过 | | post/[id]/edit 用 usePost+supabase update，RLS 限制本人；非本人/已删 RLS 403/404 | | | |
| 3.3 | 删除帖子 | ✅ 通过 | | 删除走 supabase delete，RLS 限制本人 | | | |
| 3.4 | 帖子可见性变化 | ⚠️ 不适用 | | 帖子级无独立 visibility 设置项，仅 status（approved/draft/pending）；可见性由审核流控制 | | | |
| 3.5 | 点赞 | ✅ 通过 | | LikeButton insert likes，23505 忽略；Realtime 同步 like_count | | | |
| 3.6 | 取消点赞 | ✅ 通过 | | LikeButton delete by user_id+post_id，幂等 | | | |
| 3.7 | 评论 | ✅ 通过 | | CommentSection 直接 insert comments；RATE_LIMIT_MS 2s；who_can_comment 依赖 RLS；401 时 pleaseLoginFirst | | | |
| 3.8 | 删除评论 | ✅ 通过 | | CommentSection delete by id，RLS 限制本人或有权删除 | | | |

---

## 四、聊天与会话系统（12 个）— P0 重点

| 用例 ID | 意图简述 | 代码验证 | 手工结果 | 备注 | 执行人 | 执行日期 |
|---------|----------|----------|----------|------|--------|----------|
| 4.1 | Message seller（首次建会话） | ✅ 通过 | | getOrCreateConversationCore 调用 RPC get_or_create_private_conversation，3s 超时并提示「打开聊天超时，请重试」 | | | |
| 4.2 | 已存在会话 → 再次进入 | ✅ 通过 | | 同上 RPC 幂等；本地缓存 conversationId 先校验存在再返回 | | | |
| 4.3 | 并发创建会话（双击/多端） | ✅ 通过 | | 依赖 DB 层 get_or_create_private_conversation 唯一约束/幂等，只产生一会话 | | | |
| 4.4 | 创建会话成功，成员写入失败 | ⚠️ 需 DB 确认 | | 依赖 DB 层 get_or_create_private_conversation RPC；若 RPC 内事务写入 conversations+members 则一致；否则需 Runbook 补偿 | | | |
| 4.5 | 发送消息 | ✅ 通过 | | POST /api/messages 鉴权+成员校验+长度/类型校验；RateLimitConfigs.MESSAGES 30/分钟 | | | |
| 4.6 | 发送消息失败（网络/权限） | ✅ 通过 | | API 返回 403/401 带 message；ChatWindow handleError 用 data?.error，toast 展示明确文案 | | | |
| 4.7 | 重复发送（用户连点） | ✅ 通过 | | 发送按钮 disabled={loading}；handleSend 开头 if (loading) return 防双发 | | | |
| 4.8 | 消息未读数更新 | ✅ 通过 | | ChatList 查 messages 未读计数；ChatWindow 进入时 mark read 后 invalidate conversationDetails | | | |
| 4.9 | 打开会话 → 未读清零 | ✅ 通过 | | loadMessages 内 update messages set is_read=true where conversation_id 且非本人发送；只清当前会话 | | | |
| 4.10 | Realtime 延迟/未连接 | ✅ 通过 | | Supabase channel 订阅 messages INSERT；appendMessageDeduped；重连由 Supabase 客户端处理 | | | |
| 4.11 | 被拉黑后发送消息 | ✅ 通过 | | /api/messages 校验 blocked_users，被对方拉黑返回 403 "You have been blocked by this user" | | | |
| 4.12 | 会话删除/隐藏（如有） | ⚠️ 不适用 | | 产品未实现会话删除/隐藏；若有则需 API+RLS | | | |

---

## 五、电商与商品（7 个）— P1

| 用例 ID | 意图简述 | 代码验证 | 手工结果 | 备注 | 执行人 | 执行日期 |
|---------|----------|----------|----------|------|--------|----------|
| 5.1 | 创建商品 | ✅ 通过 | | 卖家中心用 useSellerGuard，以 subscriptions 有效 seller 订阅为准；API 侧需在创建商品处校验卖家（RLS 或 API） | | | |
| 5.2 | 商品上架 | ✅ 通过 | | 商品 status 更新走 Supabase update，RLS 限制 seller_id；卖家中心 useSellerGuard | | | |
| 5.3 | 商品下架 | ✅ 通过 | | 同上，status 改为 draft/下架 | | | |
| 5.4 | 商品被下架后 → 旧页面访问 | ✅ 通过 | | product/[id] 服务端 .eq('status','active')，非 active 则 notFound()，不 500 | | | |
| 5.5 | 商品被下架后 → 聊天中 Buy Now | ✅ 通过 | | orders/create 校验 product.status !== 'active' 返回 validation error，不生成订单 | | | |
| 5.6 | 编辑商品（价格/库存） | ✅ 通过 | | 卖家编辑页 update products，RLS 限制本人；无乐观锁，最后写入生效 | | | |
| 5.7 | 非卖家操作商品 | ✅ 通过 | | useSellerGuard 未登录→登录页，无有效 seller 订阅→redirectTo；不依赖仅前端鉴权 | | | |

---

## 六、订单与支付（10 个）— P0 极高风险

| 用例 ID | 意图简述 | 代码验证 | 手工结果 | 备注 | 执行人 | 执行日期 |
|---------|----------|----------|----------|------|--------|----------|
| 6.1 | Buy Now → 创建订单 | ✅ 通过 | | checkout 用 criticalFetch('checkout_create_orders', 8s)；orders/create 鉴权+库存/status 校验 | | | |
| 6.2 | 重复点击 Buy Now | ✅ 通过 | | 结账页确认按钮 disabled={loading}，loading 期间不可二次提交 | | | |
| 6.3 | 支付成功 → 前端回调失败 | ✅ 通过 | | Stripe Webhook 按 provider_ref 幂等；payment_transactions 去重；订单状态由 Webhook 更新，用户再打开订单页可见已支付 | | | |
| 6.4 | 支付失败 → 状态回写 | ✅ 通过 | | Webhook 仅处理成功事件；失败不写 payment_transactions，订单仍待支付 | | | |
| 6.5 | Webhook 延迟 | ✅ 通过 | | 用户先见待支付；刷新或 Realtime 后见已支付；幂等键防重复入账 | | | |
| 6.6 | Webhook 重复 | ✅ 通过 | | Stripe Webhook 用 provider_ref 查 payment_transactions 已存在则跳过，return 200 | | | |
| 6.7 | Webhook 丢失 | ⚠️ Runbook | | 见 production-runbook 对账与 Stripe Dashboard resend | | | |
| 6.8 | 订单状态与支付状态不一致 | ⚠️ Runbook | | 对账脚本与人工修复流程见 Runbook | | | |
| 6.9 | 订单完成 → 权限变化 | ✅ 通过 | | 订单查询按 buyer_id/seller_id，不依赖当前订阅；cancel/confirm-receipt/dispute/ship 均校验本人 | | | |
| 6.10 | 非订单用户访问订单 | ✅ 通过 | | 订单详情依赖 RLS 或页面数据；ship/cancel/confirm-receipt/dispute 等 API 均校验 order.buyer_id/order.seller_id === user.id，非本人 403/404 | | | |

---

## 七、订阅系统（6 个）— P1

| 用例 ID | 意图简述 | 代码验证 | 手工结果 | 备注 | 执行人 | 执行日期 |
|---------|----------|----------|----------|------|--------|----------|
| 7.1 | 订阅 | ✅ 通过 | | create-pending 鉴权+校验档位；create-payment 校验 pending；Webhook 激活订阅；支付失败不创建订阅 | | | |
| 7.2 | 重复订阅 | ✅ 通过 | | create-pending 可多次建 pending；支付/Webhook 侧按 subscription_id 幂等；已有同类型有效订阅时前端/业务可提示已订阅 | | | |
| 7.3 | 取消订阅 | ⚠️ 需确认 | | 若支持取消续费，与 Cron subscription-lifecycle 一致；取消逻辑在订阅表或 Stripe 侧 | | | |
| 7.4 | 到期自动失效 | ✅ 通过 | | Cron subscription-lifecycle 更新 status/expires_at；useSellerGuard 查 subscriptions 有效期内 active | | | |
| 7.5 | 权益生效延迟 | ✅ 通过 | | Webhook 写入后前端刷新/重进即见；不 500 | | | |
| 7.6 | 权益失效但 UI 仍显示可用 | ✅ 通过 | | useSellerGuard 每次查 subscriptions 且 gt expires_at；无长期缓存 | | | |

---

## 八、系统级与异常（6 个）— P2

| 用例 ID | 意图简述 | 代码验证 | 手工结果 | 备注 | 执行人 | 执行日期 |
|---------|----------|----------|----------|------|--------|----------|
| 8.1 | 页面刷新/关闭时的中间状态 | ✅ 通过 | | 支付已提交由 Webhook 处理；未提交可重试；订单创建/支付幂等与状态机见 6.3/6.6 | | | |
| 8.2 | 网络抖动/请求超时 | ✅ 通过 | | criticalFetch + CriticalPathTimeoutError 已接入结账、订单支付；8s/4s 超时与「验证超时，请重试」文案 | | | |
| 8.3 | API 返回异常 | ✅ 通过 | | handleError/parseError 统一展示文案；error boundary 与 toast；不暴露堆栈 | | | |
| 8.4 | Realtime 断线 | ✅ 通过 | | Supabase Realtime 客户端自动重连；消息/点赞等 channel 订阅 | | | |
| 8.5 | Cron 未执行/延迟 | ⚠️ Runbook | | verifyCronSecret、cron_logs；补跑步骤见 production-runbook | | | |
| 8.6 | 数据不一致后的用户体验 | ⚠️ Runbook | | 对账脚本与客服流程见 Runbook | | | |

---

## Gate 1 六条链路（staging 手工执行）

与 [pre-launch-production-release-gate.md](pre-launch-production-release-gate.md) Gate 1 对应。在 **staging** 按 [pre-launch-intent-runthrough-checklist.md](pre-launch-intent-runthrough-checklist.md) 跑通以下 6 条链路后，填写「手工结果」「执行人」「执行日期」；全部通过后 Gate 1 视为通过。

| # | 链路 | 对应推演用例（必跑） | 手工结果 | 执行人 | 执行日期 |
|---|------|----------------------|----------|--------|----------|
| 1 | 游客 → 登录 → 进入系统 | 1.1、1.3 | | | |
| 2 | 登录 → 社交基本操作（发帖/关注） | 2.3、2.4、3.1 | | | |
| 3 | Message seller → 建会话 → 聊天 | 4.1、4.2、4.5 | | | |
| 4 | 聊天 → Buy Now → 创建订单 | 5.5、6.1 | | | |
| 5 | 下单 → 支付 → Webhook → 状态回写 | 6.3、6.5、6.6 | | | |
| 6 | 订阅 → 权益生效/取消 | 7.1、7.4、7.6 | | | |

**要求**：不白屏、不卡死、不靠手动修数据。手工结果填「通过」或「失败/阻塞 + 备注」。

---

## 执行节奏与产出

- **阶段 0**：配置检查表打勾、健康检查 200、Cron 鉴权就绪。
- **阶段 1（P0 / Gate 1）**：上表六条链路在 staging 手工跑通并填写手工结果；1.1/1.3/1.6、4.1/4.2/4.5/4.11、6.1～6.10 等用例可一并执行。
- **阶段 2（P1）**：二、三、五、七全部通过。
- **阶段 3（P2）**：八 + 一剩余（1.2/1.4/1.5）。
- **阶段 4**：端到端串联（注册 → 发帖 → 下单 → 支付 → 订单完成）。
- **阶段 5**：推演结果表 + Runbook + 配置检查表就绪后上线决策。

**文档版本**：与 pre-launch-intent-runthrough-checklist、production-runbook、pre-launch-config-checklist、pre-launch-production-release-gate 配套。
