# Stratos 自动化测试脚本清单

**用途**：按「脚本 → 自动化入口 → 预期」罗列可自动化执行的测试项，便于 API/E2E/数据验证脚本对接。  
**衔接**：[stratos-test-script-checklist](stratos-test-script-checklist.md)、[check-project-script](check-project-script.md)、`e2e/`。

---

## 一、用户 & 身份

| 脚本 | 自动化入口 | 预期 |
|------|------------|------|
| 用户注册 | **Supabase Auth**: `supabase.auth.signUp({ email, password })`；无 REST `/api/auth/register` | 返回 user + session，profiles 表有对应记录 |
| 登录 | **Supabase Auth**: `supabase.auth.signInWithPassword({ email, password })`；无 REST `/api/auth/login` | 返回 session，后续请求带 Cookie 可访问受限接口 |
| 登出 | **API**: `POST /api/auth/logout` | session 失效，再请求需登录接口返回 401 |
| 修改用户信息（昵称/头像/简介） | **Supabase 直连**：`profiles` 表 update（RLS）；**API**: `PATCH /api/settings`（隐私/通知） | profiles / user_settings 更新正确 |
| 多账号切换 | 前端登出后另一账号登录 + **API** 带新 Cookie 请求 | 接口返回当前登录用户信息，无串号 |

---

## 二、Profile 与关注

| 脚本 | 自动化入口 | 预期 |
|------|------------|------|
| 查看自己/他人 profile | **Supabase 直连**：`profiles` 表 select（RLS）；或服务端组件内 `getProfile` | 返回 profile、post_count、follower_count 等 |
| 关注/取关用户 | **Supabase 直连**：`follows` 表 insert/delete（useProfile follow/unfollow）；无 REST `/api/follow` | follower_count / following_count 正确更新（含 trigger） |
| 用户成长体系（积分/等级/徽章） | **Supabase 直连**：`user_points`、`user_badges` 表；无 REST `/api/user/[id]/points` | 发帖/点赞/打赏后积分、等级、徽章变化正确 |

---

## 三、帖子 & 内容

| 脚本 | 自动化入口 | 预期 |
|------|------------|------|
| 发帖（text/image/story/music/short_video） | **Supabase 直连**：`posts` 表 insert（发帖页）；带货帖 **API**: `POST /api/affiliate/posts/create` | 返回 post_id，数据库记录正确，post_topics/post_products 关联正确 |
| 编辑帖子 | **Supabase 直连**：`posts` 表 update（RLS）；无 REST PATCH /api/posts/[id] | 字段更新成功 |
| 删除帖子 | **Supabase 直连**：`posts` 表 delete（RLS） | post 删除或状态变更，Feed 不显示 |
| 评论 / 回复 / 删除 | **Supabase 直连**：`comments` 表 insert/update/delete（RLS） | 数据写入/更新/删除正确，comment_count 更新 |
| 点赞 / 收藏 / 分享 | **Supabase 直连**：`likes`、`favorites` 表 insert/delete；分享多为复制链接，无专用 API | like_count、favorites 数据正确 |
| 帖子挂商品 | **Supabase 直连**：`post_products` 表；发帖时关联 | 关联正确，Feed/详情页展示商品 |

---

## 四、Feed & 推荐

| 脚本 | 自动化入口 | 预期 |
|------|------------|------|
| Feed 拉取 | **RPC**: `get_personalized_feed_with_reasons`（usePosts）；商品 Feed：`get_personalized_product_feed` | 返回帖子/商品列表，Tier 与 post_type 区分正确 |
| 推荐理由 | **RPC**: `get_personalized_feed_with_reasons` 返回 reason_type 等 | reason_type 与前端文案正确 |
| 推荐反馈 | **API**: `POST /api/feed/feedback`（body: postId, reasonType?, agreed?, dismissed?） | 写入 `feed_recommendation_feedback`，agreed/dismissed 正确 |
| AI 标签/摘要（可选） | **API**: `/api/ai/translate-after-publish`、`/api/ai/extract-topics-after-approval` 等；RPC 视迁移 | 输出字段存在、可解析 |

---

## 五、商品 & 电商

| 脚本 | 自动化入口 | 预期 |
|------|------------|------|
| 浏览商品详情 | **Supabase 直连**：`products` 表 select（RLS）；页面 `/[locale]/product/[id]` | 返回 product 数据 |
| 信任判断组件 | **RPC**: `get_seller_trust_stats`、价格/历史相关 RPC（见迁移 217/218）；**API**: `POST /api/trust/judgment` | high/medium/low 档位与证据条正确 |
| 添加购物车 | **前端状态**：cartStore（Zustand），无 REST `/api/cart` | 本地/持久化 cart 状态正确 |
| 修改数量 / 删除 | **前端**：cartStore 更新 | 更新正确 |
| 下单 | **API**: `POST /api/orders/create`（body 见 route） | 订单创建，order_items 正确，状态 pending |
| 支付 | **API**: Stripe/PayPal/Alipay/WeChat 对应 create-order、callback；**Webhook**: `/api/payments/stripe/webhook` 等 | 支付状态回写，payment_transactions 幂等 |
| 帖子内嵌商品显示 | **Supabase 直连**：`post_products` + `products`；页面 `GET` 帖子详情时带 product 数据 | product_ids 与详情页展示正确 |

---

## 六、聊天

| 脚本 | 自动化入口 | 预期 |
|------|------------|------|
| 发起单聊 / 群聊 | **RPC**: `get_or_create_private_conversation`（getOrCreateConversationCore）；无 REST POST /api/conversations | 返回 conversation_id，conversations + group_members 一致 |
| 消息发送 / 接收 | **API**: `POST /api/messages`（body: conversationId, content, type?）；**Realtime**: Supabase channel 订阅 messages | 收发正常，未读数更新 |
| 消息撤回 / 删除 | **Supabase 直连**：`messages` 表 update/delete（若产品支持）；无专用 PATCH/DELETE /api/messages | 消息状态变化 |
| 商品/帖子分享到聊天 | **API**: `POST /api/messages`（type 与 content 含链接或卡片结构） | 链接或卡片展示正确 |
| 快捷回复/模板消息 | **API**: `POST /api/messages`（若支持模板 type） | 模板内容或发送成功 |
| 聊天权限（黑名单/封禁） | **API**: `POST /api/messages` 校验 blocked_users；middleware 封禁用户重定向 /banned | 被拉黑/封禁返回 403，前端不展示入口 |

---

## 七、社区 & 成长

| 脚本 | 自动化入口 | 预期 |
|------|------------|------|
| 话题关注/取关 | **Supabase 直连**：`topic_follows` 表；无 REST `/api/topic_follows` | topic_follows 更新 |
| 小组加入/退出 | **API**: `POST /api/community-groups/[id]/join`、`/api/community-groups/[id]/leave` | member_count 更新 |
| 用户积分/等级/徽章 | **Supabase 直连**：`user_points`、`user_badges`；触发逻辑在 RPC/trigger | 发布/评论/打赏后更新正确 |
| 举报帖子/评论 | **Supabase 直连**：`reports` 表 insert（RLS）；或前端上报组件 | reports 表写入，状态正确 |
| 内容审核触发 | **API**: `/api/admin/content-review/[id]/approve`、`reject`；AI 标签可选 `/api/ai/*` | 可解释标签、状态待审核/已审核正确 |

---

## 八、存储与多媒体

| 脚本 | 自动化入口 | 预期 |
|------|------------|------|
| 图片上传 | **Supabase Storage** 或 **API**（如 Cloudinary 迁移接口）；RLS 策略 | 返回 public URL |
| 音乐上传 | **Supabase Storage**（bucket 见迁移 226）；上传后写 posts 或 media 表 | music_url 可访问 |
| 短视频上传 | **Supabase Storage**；上传后写 posts 或 media 表 | video_url、cover_url 正确 |
| 播放验证 | **E2E/Playwright**：页面加载后 `<audio>`/`<video>` 可播放，封面显示 | 播放器控制与封面正确 |

---

## 九、系统与运维

| 脚本 | 自动化入口 | 预期 |
|------|------------|------|
| Cron 任务 | **API**: `GET /api/cron/*`（需 Header `Authorization: Bearer CRON_SECRET`）；如 `/api/cron/subscription-lifecycle`、`/api/cron/cancel-expired-orders` 等 | 定时任务触发，cron_logs 写入，业务数据更新正确 |
| Migration 测试 | **SQL**：在目标库执行 `supabase/migrations/*.sql`；无专用 API | 迁移成功，旧数据兼容 |
| RLS 权限验证 | **API**：用不同角色/未登录请求受限资源 | 返回 403/404，数据不越权 |
| API 异常处理 | **API**：故意传错参数、未登录访问写接口 | 返回正确错误码与提示，前端可展示 |

---

## 自动化实现建议

| 类型 | 工具/方式 | 说明 |
|------|-----------|------|
| **API 自动化** | Axios/fetch + Jest 或 Vitest；Postman/Newman | 先登录拿 Cookie（Supabase session），再调各 API；校验 status、body 关键字段 |
| **RPC / Supabase 直连** | Supabase 客户端 + 测试账号 | 在测试环境用 service role 或测试用户 token 调 RPC、读表，校验返回行与字段 |
| **E2E** | Playwright（现有 `e2e/check-en.spec.ts`、`e2e/auth.spec.ts`） | 覆盖登录、Feed、帖子详情、商品、结账、聊天入口等；见 [stratos-test-script-checklist](stratos-test-script-checklist.md) 九 |
| **数据验证** | SQL 或 Supabase 客户端 | 校验 feed_recommendation_feedback、trust_judgment_feedback、user_points、orders、payment_transactions 等表与业务规则 |

---

## 与现有脚本的对应

| 现有脚本/文档 | 对应本清单 |
|---------------|------------|
| `scripts/check-project.js` | 九（Cron 鉴权、API 鉴权、webhook 幂等、health） |
| `e2e/check-en.spec.ts` | 四（Feed 页可访问）、一（首页已登录/未登录） |
| `e2e/auth.spec.ts` | 一（登录/忘记密码页可访问） |
| [stratos-test-script-checklist](stratos-test-script-checklist.md) | 本清单为其中「自动化入口」与「预期」的 Stratos 实际映射 |

**说明**：本清单中「Supabase 直连」表示无对应 Next.js API 路由，需通过 Supabase 客户端或 RPC 在测试中调用；Auth 注册/登录为 Supabase Auth，非 REST。
