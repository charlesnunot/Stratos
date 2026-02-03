# Stratos 项目测试脚本清单（系统性）

**用途**：覆盖用户行为链路、社交内容、电商、聊天、社区成长、推荐与运维的测试项，便于手工/E2E/API 分层执行。  
**衔接**：[pre-launch-systematic-checklist](pre-launch-systematic-checklist.md)、[pre-launch-intent-runthrough-checklist](pre-launch-intent-runthrough-checklist.md)、[check-project-script](check-project-script.md)、`e2e/`、`scripts/check-project.js`。

**自动化脚本（写一个跑一个，修完再写下一个）**  
| 脚本 | 命令 | 覆盖 |
|------|------|------|
| 脚本 1 - 用户 & 身份（健康 + 登出） | `npm run test:01-auth` | GET /api/health、POST /api/auth/logout |
| 脚本 2 - Profile 与用户设置 | `npm run test:02-profile` | GET/PATCH /api/settings 未登录 → 401 |
| 脚本 3 - Feed / 推荐反馈 | `npm run test:03-feed` | POST /api/feed/feedback、/api/trust/feedback 未登录 → 401 |
| 脚本 4 - 电商与交易 | `npm run test:04-ecommerce` | POST /api/checkout/validate-product、/api/orders/create 未登录 → 401 |
| 脚本 5 - 聊天 & Cron | `npm run test:05-chat-and-cron` | POST /api/messages 未登录 → 401；GET /api/cron/... 无密钥 → 401 |
| 脚本 6 - 订阅/支付账户 & 支持工单 | `npm run test:06-subscriptions-and-support` | POST /api/subscriptions/create-payment、GET /api/payment-accounts、POST /api/support/tickets 未登录 → 401 |
| 脚本 7 - 订阅历史/保证金/联盟帖/支付方式 | `npm run test:07-more-auth` | GET /api/subscriptions/history、/api/deposits/check；POST /api/affiliate/posts/create、/api/orders/get-available-payment-methods 未登录 → 401 |
| 脚本 8 - 订单操作/实名/小组/支付账户 | `npm run test:08-orders-identity-groups` | POST /api/orders/[id]/cancel、GET /api/identity-verification、POST /api/groups/create、GET /api/payment-accounts/[id] 未登录 → 401 |
| 脚本 9 - 确认收货/保证金/小组加入/账号注销 | `npm run test:09-receipt-deposits-account` | POST /api/orders/[id]/confirm-receipt、/api/deposits/[lotId]/request-refund、/api/community-groups/[id]/join；GET /api/account/deletion-request 未登录 → 401 |
| 脚本 10 - 发货/订阅创建/信任/工单/小组退出/佣金 | `npm run test:10-ship-trust-support-commissions` | POST /api/orders/[id]/ship、/api/subscriptions/create-pending、/api/community-groups/[id]/leave；GET /api/trust/judgment、/api/commissions/pay；PUT /api/support/tickets/[id] 未登录 → 401 |
| 脚本 11 - 争议/支付账户默认/保证金/工单回复/小组成员 | `npm run test:11-dispute-deposits-tickets-groups` | POST /api/orders/[id]/dispute、/dispute/respond、/api/payment-accounts/[id]/set-default、/api/deposits/pay、/api/support/tickets/[id]/replies、/api/groups/[id]/members 未登录 → 401 |
| 脚本 12 - 账号恢复 & Stripe 支付会话 & 支付账户创建 | `npm run test:12-account-recover-payments` | GET /api/account/recover；POST /api/payments/stripe/create-order-checkout-session、create-tip-session、create-checkout-session、create-user-tip-session；POST /api/payment-accounts 未登录 → 401 |
| 脚本 13 - 社区小组/AI/Stripe 与支付宝/PayPal | `npm run test:13-community-ai-payments` | POST /api/community-groups/create、/api/ai/complete、/api/payments/stripe/create-intent、/stripe/connect/create-account、/api/payments/alipay/create-order、/api/payments/paypal/create-order 未登录 → 401 |
| 脚本 14 - 支付账户更新/删除 & 支付渠道 | `npm run test:14-payment-accounts-and-payments` | PUT/DELETE /api/payment-accounts/[id]；POST /api/payments/paypal/capture-order、/wechat/create-order、/bank/init、/seller/confirm-payment、/alipay/refund 未登录 → 401 |
| 脚本 15 - 实名/恢复/翻译/银行凭证/注销/佣金 | `npm run test:15-identity-recover-ai-account-commissions` | POST /api/identity-verification、/api/account/recover、/api/ai/translate-after-publish、/api/payments/bank/upload-proof、/api/account/deletion-request、/api/commissions/pay 未登录 → 401 |
| 脚本 16 - AI 审核/支付账户根路径/银行审核 | `npm run test:16-ai-admin-payment-accounts-bank-approve` | POST /api/ai/extract-topics-after-approval、/api/ai/translate-profile-after-approval、/api/payments/bank/approve-proof；PUT /api/payment-accounts、DELETE /api/payment-accounts 未登录 → 401 |
| 脚本 17 - 订单争议 GET & Admin 只读 | `npm run test:17-dispute-get-admin-routes` | GET /api/orders/[id]/dispute、/api/admin/compensations、/api/admin/deletion-requests、/api/admin/disputes、/api/admin/monitoring/dashboard、/api/admin/seller-debts 未登录 → 401 |
| 脚本 18 - Admin 写操作与工单列表 | `npm run test:18-admin-write-routes` | POST /api/admin/compensations、/refunds/process、/content-review/[id]/approve、/payment-accounts/[id]/verify、/profiles/[id]/ban、/deletion-requests/[id]/approve；GET /api/admin/support/tickets 未登录 → 401 |
| 脚本 19 - Admin 扩展与实名审核 | `npm run test:19-admin-extra-and-identity` | POST /api/admin/commissions/[id]/settle、content-review/[id]/reject、profiles/[id]/unban、deposits/[lotId]/process-refund、transfers/retry、violation-penalties/deduct、platform-fees/charge；GET /api/admin/platform-payment-accounts、identity-verification 未登录 → 401 |
| 真实用户鉴权（需 .env.test） | `npm run test:auth:real` | 登录 → 带 Cookie 调 GET /api/settings、/api/subscriptions/history、/api/payment-accounts、/api/deposits/check；管理员再调 GET /api/admin/monitoring/dashboard、/api/admin/platform-payment-accounts。见 [real-user-testing.md](real-user-testing.md) |

> 前置：先执行 `npm run dev`。真实用户测试需配置 `.env.test`（勿提交），见 `.env.test.example`。；可选 `BASE_URL=... npm run test:01-auth`。

---

## 一、用户行为链路测试

### 1️⃣ 注册/登录/身份

| 测试项 | 验证方式 | 路径/API | 备注 |
|--------|----------|----------|------|
| 用户注册（邮箱/手机号/第三方） | 手工 / E2E | `/[locale]/register`、Supabase Auth | 推演 1.1 |
| 登录/登出 | 手工 / E2E | `/[locale]/login`、`/api/auth/logout` | 推演 1.1、1.3 |
| 忘记密码 / 重置密码 | 手工 | `/[locale]/forgot-password`、`/[locale]/reset-password` | |
| 用户信息修改（昵称、头像、简介） | 手工 / API | `/[locale]/profile/[id]/edit`、`/api/settings` | 推演 2.1 |
| 账号切换（多账号 session） | 手工 | 登出后另账号登录，确认无串数据 | 推演 1.4、1.5 |

---

### 2️⃣ Profile 与关注

| 测试项 | 验证方式 | 路径/API | 备注 |
|--------|----------|----------|------|
| 查看自己/他人 profile | 手工 / E2E | `/[locale]/profile/[id]` | 推演 2.2 |
| 关注 / 取消关注 | 手工 / E2E | useProfile follow/unfollow、follows 表 | 推演 2.3、2.4 |
| 粉丝数/关注数正确更新 | 手工 / 数据 | profiles 或计数 trigger | |
| 用户成长体系（积分/等级/徽章）变化 | 手工 / 数据 | user_points、user_badges、徽章触发 | 见「五、社区与成长」 |

---

## 二、社交内容

### 1️⃣ 帖子与评论

| 测试项 | 验证方式 | 路径/API | 备注 |
|--------|----------|----------|------|
| 发帖（text / image / story / music / short_video） | 手工 / E2E | `/[locale]/post/create`、posts 表 | 推演 3.1 |
| 编辑帖子，字段更新 | 手工 | `/[locale]/post/[id]/edit` | 推演 3.2 |
| 删除帖子 | 手工 | PostCard 删除、RLS | 推演 3.3 |
| 帖子在 Feed 中正确显示 | 手工 / E2E | `/[locale]`、get_personalized_product_feed / feed | |
| 评论/回复/删除评论 | 手工 / E2E | CommentSection、comments 表 | 推演 3.7、3.8 |
| 点赞 / 取消点赞 | 手工 / E2E | LikeButton、likes 表、like_count | 推演 3.5、3.6 |
| 收藏 / 取消收藏 | 手工 | favorites、FavoriteButton | |
| 分享帖子（复制链接/外部分享） | 手工 | ShareDialog、copyLink | |
| 帖子挂商品（story/music/video）展示 | 手工 | post_products、ProductCard 内嵌 | |
| post_type 对应内容（长文折叠、音乐、视频播放器） | 手工 | PostCardView、PostCardUnit | |
| Feed 推荐理由 & reason_type 展示 | 手工 / 数据 | feed_recommendation_feedback、reason_type | 见「六、智能与推荐」 |
| 推荐反馈（同意/不同意/忽略） | 手工 / 数据 | feed_recommendation_feedback、feed/feedback API | |

---

### 2️⃣ 话题与小组

| 测试项 | 验证方式 | 路径/API | 备注 |
|--------|----------|----------|------|
| 关注/取关话题 | 手工 | topic_follows、`/[locale]/topics/[topic]` | |
| 发帖到话题 | 手工 | post_topics、发帖页 topic 选择 | |
| 小组加入/退出（group_id） | 手工 | `/[locale]/groups`、group_members、join/leave API | |
| 小组帖子列表 | 手工 | `/[locale]/groups/[slug]` | |
| 话题/小组页筛选 | 手工 | 筛选 UI、查询参数 | |

---

## 三、电商与交易

### 1️⃣ 商品

| 测试项 | 验证方式 | 路径/API | 备注 |
|--------|----------|----------|------|
| 浏览商品详情 | 手工 / E2E | `/[locale]/product/[id]` | |
| 商品信任判断组件（档位、证据条） | 手工 | ProductPageClient、trust_judgment RPC | |
| 历史价格与价格趋势（price_history_window_days） | 手工 / 数据 | 若有 price_history 表或 RPC | |
| 价格异常判 medium / 高风险 high | 手工 | 信任判断 UI、recommendation 档位 | |
| 商品内嵌帖子 / 帖子挂商品 | 手工 | 商品详情、帖子详情 post_products | |

---

### 2️⃣ 购物车 & 结算

| 测试项 | 验证方式 | 路径/API | 备注 |
|--------|----------|----------|------|
| 添加商品到购物车 | 手工 / E2E | cartStore、AddToCart | |
| 修改数量 / 移除商品 | 手工 | ShoppingCart、cartStore | |
| 校验库存和价格变动 | 手工 / API | checkout validate-product、orders/create | 推演 5.5、6.1 |
| 下单 / 支付 / 支付回调 | 手工 / E2E | `/[locale]/checkout`、`/orders/[id]/pay`、Webhook | 推演 6.1～6.6 |
| 订单完成后新卖家判断、反馈积分 | 数据 / 手工 | trust_judgment、seller_feedback、积分逻辑 | |

---

## 四、聊天系统

| 测试项 | 验证方式 | 路径/API | 备注 |
|--------|----------|----------|------|
| 发起单聊 / 群聊 | 手工 / E2E | Message seller、getOrCreateConversation、`/messages/[id]` | 推演 4.1、4.2 |
| 消息发送与接收 | 手工 / E2E | POST /api/messages、Realtime、ChatWindow | 推演 4.5 |
| 消息撤回 / 删除 | 手工 | 若产品支持，API + RLS | |
| 未读数和通知 | 手工 | mark read、未读角标、notifications | 推演 4.8、4.9 |
| 商品/帖子分享到聊天 | 手工 | 分享到会话、消息类型 | |
| 快捷回复/模板消息（若阶段 2+） | 手工 | 若有 feature | |
| 聊天权限（黑名单/被封用户） | 手工 / API | blocked_users、403、Message seller 显隐 | 推演 4.11 |

---

## 五、社区与成长

| 测试项 | 验证方式 | 路径/API | 备注 |
|--------|----------|----------|------|
| 积分/等级/徽章加成触发 | 数据 / 手工 | user_points、badges、user_badges、触发 RPC | |
| 用户成长体系页面展示 | 手工 | 若有 /profile/[id]/badges 或等价 | |
| 打赏帖子/文章/音乐/视频，积分与徽章 | 手工 / 数据 | TipButton、process-tip-payment、积分规则 | |
| 举报帖子/评论 | 手工 | ReportDialog、reports 表 | |
| 内容审核（规则 + AI 标签）触发 | 手工 / 数据 | content_review、AI 标签、admin 审核流 | |
| 后台 admin/dashboard 内容统计 | 手工 | `/[locale]/admin/dashboard`、统计接口 | |

---

## 六、智能与推荐

| 测试项 | 验证方式 | 路径/API | 备注 |
|--------|----------|----------|------|
| Feed 个性化排序（Tier1/2/3） | 数据 / 手工 | get_personalized_product_feed、feed 接口 | |
| 推荐理由与 reason_type 展示 | 手工 | Feed 卡片 reason、reason_type | |
| 推荐反馈表写入（同意/不同意/忽略） | 手工 / 数据 | feed_recommendation_feedback、/api/feed/feedback | |
| AI 标签/摘要/话题抽取（阶段 2） | 手工 / 数据 | 若有 extract_topics、AI 接口 | |
| 信任判断反馈闭环（agreed/reason） | 手工 / 数据 | trust_judgment_feedback、/api/trust/feedback | |
| 异常预测/风险标签（阶段 3） | 手工 | 若有 feature | |

---

## 七、系统与运维

| 测试项 | 验证方式 | 路径/API | 备注 |
|--------|----------|----------|------|
| Cron 任务触发 | 手工 / 脚本 | vercel.json crons、/api/cron/*、cron_logs | [production-runbook](production-runbook.md) |
| Migration 测试（新字段、post_type） | 手工 / 脚本 | supabase/migrations、目标库执行 | [pre-launch-config-checklist](pre-launch-config-checklist.md) 二 |
| RLS 权限测试（按用户/角色） | 手工 / SQL | 各业务表 RLS、403/404 | 配置检查表 七 |
| Supabase 存储上传（图片/音乐/短视频） | 手工 / API | storage RLS、upload API | |
| API 超时/异常处理 | 手工 / E2E | criticalFetch、toast、handleError | 推演 8.2、8.3 |
| 前端骨架与错误展示 | 手工 | Skeleton、EmptyState、error boundary | [pre-launch-ui-quick-checklist](pre-launch-ui-quick-checklist.md) |

---

## 八、UI/交互与边界

| 测试项 | 验证方式 | 说明 |
|--------|----------|------|
| 长文折叠/展开 | 手工 | 帖子详情、collapseReplies/expandReplies |
| 音乐/视频播放器（播放/暂停/音量） | 手工 | post_type 对应播放器组件 |
| Feed 滚动加载/分页/Skeleton | 手工 / E2E | 无限滚动、loading、skeleton |
| 多语言切换（zh/en） | 手工 | next-intl、/[locale]、LanguageSwitcher |
| 错误状态（无内容、加载失败、权限不足） | 手工 | EmptyState、toast、403 提示 | UI 清单 三 |

---

## 九、自动化脚本思路

### API 自动化

- **工具**：Postman / Playwright `request` / Axios + Jest（或 Vitest）。
- **覆盖**：REST API（/api/orders/create、/api/messages、/api/subscriptions/create-payment、/api/feed/feedback、/api/trust/feedback 等）、RPC（若对外暴露）。
- **要点**：鉴权（Cookie 或 token）、状态码、关键 JSON 字段；幂等与重复请求（如 provider_ref）。

### UI 自动化

- **工具**：Playwright（推荐）、Cypress。
- **现有**：`e2e/check-en.spec.ts`（/en 首页可访问、main 非空、无严重 console error）、`e2e/auth.spec.ts`（/en/login、/zh/login、forgot-password 可访问、表单存在）。
- **可扩展**：
  - 登录页：`/[locale]/login` 表单提交、redirect（auth.spec.ts 已含基础可访问性）。
  - Feed：`/[locale]/en` 或 `/[locale]/zh`，滚动、帖子卡片存在。
  - 帖子详情：`/[locale]/post/[id]`，评论框、点赞按钮存在。
  - 商品详情：`/[locale]/product/[id]`，Buy Now、Message seller 存在。
- **执行**：`npm run test:e2e`（需先 `npm run dev`）；可加 `e2e/auth.spec.ts`、`e2e/feed.spec.ts` 等。

### 数据验证

- **库**：Supabase 客户端或 SQL 脚本（需 SERVICE_ROLE 或只读账号）。
- **表**：posts、feed_recommendation_feedback、trust_judgment_feedback、user_points、user_badges、orders、payment_transactions、subscriptions、messages、cron_logs。
- **验证**：CRUD 后记录存在、计数/触发器正确、积分/徽章规则、推荐反馈与信任反馈写入。

### 端到端链路（E2E 串联）

- **示例**：注册 → 登录 → 发帖 → 点赞 → 评论 → 打赏 → 查积分/徽章 → Feed 中见推荐 → 推荐反馈（同意/不同意）→ 后台统计更新。
- **实现**：单条 Playwright spec 多 step（login → createPost → like → comment → tip → checkPoints → feedRecommendation → feedback → adminDashboard），或拆成多 spec 按阶段跑。

### 与现有脚本的衔接

| 脚本/文档 | 用途 |
|-----------|------|
| `npm run check` | 项目健康检查（JSON、env、lint、api-auth、webhook、cron、health）；不覆盖 UI 行为。 |
| `npm run check:e2e` | 在 dev 启动后跑 Playwright，当前仅 check-en.spec.ts。 |
| [pre-launch-intent-runthrough-checklist](pre-launch-intent-runthrough-checklist.md) | 意图级推演与 Gate 1 六条链路。 |
| [pre-launch-runthrough-results](pre-launch-runthrough-results.md) | 推演结果表、Gate 1 手工填写。 |

---

## 执行建议

1. **P0（必过）**：一.1 登录/登出、二.1 发帖/评论/点赞、三.2 购物车与下单支付、四 聊天发起与发送、七 Cron/RLS/健康检查 — 与 Gate 1 六条链路对齐。
2. **P1**：一.2 Profile 与关注、二.2 话题与小组、五 社区成长、八 UI 边界。
3. **P2**：六 推荐与反馈、九 自动化扩展（E2E 串联、API 自动化、数据验证）。
4. **环境**：先在 staging 或本地完整跑通 P0/P1，再补 P2 与自动化；上线前再次执行 [pre-launch-systematic-checklist](pre-launch-systematic-checklist.md) 与 Gate。

**文档版本**：与 pre-launch、check-project、e2e 配套；可按迭代在本清单中增删测试项或补充自动化用例。
