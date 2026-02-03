# Stratos 上线 Gate（Production Release Gate）

**适用阶段**：首次正式上线 / 重大版本上线  
**项目规模假设**：当前 ≈ 10 万行、多业务线

---

## 🟥 Gate 0：发布前置条件（不满足直接停）

**必须全部满足，否则 Gate 不开启。**

| 条件 | 说明 |
|------|------|
| 生产环境变量全部就绪（无 hardcode） | 所有必需变量在目标环境配置，敏感信息不写进代码 |
| Supabase RLS：所有业务表开启 | 业务表均有 RLS 策略，禁止仅靠 API 鉴权 |
| 支付 / Webhook 指向生产地址 | 支付回调、Webhook URL 为生产域名；测试密钥已替换 |
| 有明确的「回滚方式」（哪怕是关功能） | 有回滚步骤或功能开关，可快速止血 |

👉 **这是“进考场资格”。**

**衔接**：逐项打勾见 [pre-launch-config-checklist.md](pre-launch-config-checklist.md)。

---

## 🟥 Gate 1：核心链路可跑通（Blocking）

**任何一条失败 = 禁止上线。**

必须 **100% 跑通** 的 6 条链路：

| # | 链路 | 要求 |
|---|------|------|
| 1 | 游客 → 登录 → 进入系统 | 未登录拦截、登录成功、redirect 正确、进入主站 |
| 2 | 登录 → 社交基本操作（发帖 / 关注） | 发帖成功、关注/取消关注、列表/详情可见 |
| 3 | Message seller → 建会话 → 聊天 | 联系卖家建会话、跳转聊天页、可发消息 |
| 4 | 聊天 → Buy Now → 创建订单 | 从聊天/商品页 Buy Now、结账页、创建订单成功 |
| 5 | 下单 → 支付 → Webhook → 状态回写 | 支付完成、Webhook 处理、订单/订阅状态正确 |
| 6 | 订阅 → 权益生效 / 取消 | 订阅支付、权益生效（如卖家中心）；取消后到期失效 |

**要求标准**：

- 不白屏  
- 不卡死  
- 不靠手动修数据  

**衔接**：意图推演与结果见 [pre-launch-intent-runthrough-checklist.md](pre-launch-intent-runthrough-checklist.md)、[pre-launch-runthrough-results.md](pre-launch-runthrough-results.md)；UI 表现见 [pre-launch-ui-quick-checklist.md](pre-launch-ui-quick-checklist.md)。

---

## 🟥 Gate 2：异常情况下不破坏系统（最关键）

**这是“能不能扛线上事故”的分水岭。**

对 **每条核心链路**，至少验证以下异常之一：

| 异常类型 | 验证要点 |
|----------|----------|
| 重复点击 | 防重复提交、幂等、不产生双单/双消息 |
| 页面刷新 / 关闭 | 支付类已提交由 Webhook 处理；未提交可重试；无半成品订单 |
| 网络失败 / 超时 | 有超时与错误提示、可重试、不静默失败 |
| Webhook 延迟或重复 | 延迟后状态最终一致；重复回调幂等，不重复入账 |
| Realtime 未连接 | 重连后数据一致；不丢消息、不重复消息 |

**必须满足**：

- 不产生脏数据  
- 不影响其他用户  
- 不影响钱 / 权限  
- 可以安全重试  

👉 **只要有一条链路不满足 → 禁止上线。**

**衔接**：推演结果表中 4.7/6.2/6.5/6.6/8.1/8.2 等；关键路径与超时见 [critical-path-engineering-standard.md](critical-path-engineering-standard.md)；故障处理见 [production-runbook.md](production-runbook.md)。

---

## 🟥 Gate 3：钱 & 权限零容忍（Absolute Blocker）

### 支付 & 订阅

| 要求 | 说明 |
|------|------|
| Webhook 幂等 | 同一 event/provider_ref 多次回调只处理一次，return 200 |
| 前端失败 ≠ 支付失败 | 支付成功以 Webhook/后端为准；前端未收到回调仍可查单/刷新 |
| 支付状态 ≠ UI 状态 | 以订单/订阅/支付表为准；UI 可轮询或刷新对齐 |
| 权益只由后端 / Webhook 决定 | 订阅生效、到期、取消以后端/Webhook 为准，不信任前端缓存 |

### 权限

| 要求 | 说明 |
|------|------|
| 拉黑 / 封禁后立即生效 | middleware/API 校验 banned/suspended；拉黑后发消息 403、Message seller 隐藏或禁用 |
| 非本人无法操作资源 | 订单/支付/资料/帖子等按 buyer_id/seller_id/user_id 校验，403/404 |
| 前端挡 + 后端再挡（双重） | 前端按权限显隐；写操作 API 必须再次鉴权 |

👉 **钱 / 权限问题 = 一票否决。**

**衔接**：推演结果表 1.5/1.6/2.7/4.11/6.3～6.10/7.x；[production-runbook.md](production-runbook.md) 支付幂等与对账。

---

## 🟧 Gate 4：非核心功能允许降级（有边界）

以下功能 **不要求 100% 完美**，但必须：

- 失败时有 **用户可理解提示**  
- **不阻塞主链路**  
- **不写入不完整数据**  

允许降级的例子：

- 评论失败  
- 编辑资料失败  
- 次级管理操作  

👉 **“不好用”可以，“炸系统”不行。**

---

## 🟨 Gate 5：可观测性最低保障（上线后能救）

不是要上全套监控，而是 **最小救命能力**：

| 能力 | 说明 |
|------|------|
| 支付 / 订单 / 订阅有日志 | 关键操作有审计或日志，可查“谁在何时做了什么” |
| 消息发送失败可追踪 | 发送失败可定位会话/用户/时间 |
| 能定位用户 ID + 关键行为 | 日志或审计含 user_id、resource_id、action |
| 知道「这笔钱发生了什么」 | 订单/支付/退款/订阅状态变更可追溯 |

👉 **上线 ≠ 看天吃饭。**

**衔接**：审计日志与 API 日志见现有 `logAudit`、`withApiLogging`；Runbook 对账与故障步骤见 [production-runbook.md](production-runbook.md)。

---

## 与现有预发布文档的关系

| 文档 | 对应 Gate |
|------|-----------|
| **[pre-launch-systematic-checklist.md](pre-launch-systematic-checklist.md)** | **10 大项总表（核心链路/Gate/UI/权限/DB/集成/性能/日志/文档/QA）** |
| [pre-launch-config-checklist.md](pre-launch-config-checklist.md) | Gate 0 |
| [pre-launch-intent-runthrough-checklist.md](pre-launch-intent-runthrough-checklist.md) | Gate 1（意图列表） |
| [pre-launch-runthrough-results.md](pre-launch-runthrough-results.md) | Gate 1（结果）+ Gate 2/3（代码验证） |
| [pre-launch-ui-quick-checklist.md](pre-launch-ui-quick-checklist.md) | Gate 1（UI 不误导、不阻塞） |
| [production-runbook.md](production-runbook.md) | Gate 2/3/5（故障、对账、可观测） |

**建议顺序**：先过 Gate 0 → 再跑 Gate 1 六条链路（推演 + UI 清单）→ 再验 Gate 2 异常场景 → 确认 Gate 3 钱与权限 → 明确 Gate 4 降级边界 → 落实 Gate 5 最小可观测。全部通过后再发布。完整执行节奏见 [pre-launch-systematic-checklist.md](pre-launch-systematic-checklist.md)。

---

## 执行结果（代码/文档验证）

**执行日期**：按本次推演记录。  
**结论**：基于现有推演结果表、配置检查表、Runbook、代码静态检查；Gate 0～5 均有对应文档或实现，满足则打勾；手工/环境项需在 staging 或生产自检时完成。

### Gate 0：发布前置条件

| 条件 | 验证结果 | 备注 |
|------|----------|------|
| 生产环境变量全部就绪（无 hardcode） | ✅ 有清单 | [pre-launch-config-checklist.md](pre-launch-config-checklist.md) 一、环境变量 + [.env.example](.env.example)；middleware 缺变量时生产 503 |
| Supabase RLS：所有业务表开启 | ⚠️ 需部署前确认 | 迁移中应包含 RLS；上线前在目标库确认业务表均有策略 |
| 支付 / Webhook 指向生产地址 | ✅ 有清单 | 配置检查表「至少一种支付」；NEXT_PUBLIC_APP_URL 用于回调；上线时替换测试密钥与 URL |
| 有明确的「回滚方式」 | ✅ 已补充 | [production-runbook.md](production-runbook.md) 含 503/支付/Cron/迁移回滚；[pre-launch-config-checklist.md](pre-launch-config-checklist.md) 新增「六、回滚方式」打勾项 |

### Gate 1：核心链路可跑通

| 链路 | 验证结果 | 备注 |
|------|----------|------|
| 1 游客 → 登录 → 进入系统 | ✅ 代码通过 | 推演 1.1/1.3；useAuthGuard + redirect；middleware 不拦未登录 |
| 2 登录 → 社交（发帖/关注） | ✅ 代码通过 | 推演 2.3/2.4/3.1；发帖/关注/取消关注均有鉴权与幂等 |
| 3 Message seller → 建会话 → 聊天 | ✅ 代码通过 | 推演 4.1/4.2/4.5；getOrCreateConversationCore + openChat；发送消息鉴权+限流 |
| 4 聊天 → Buy Now → 创建订单 | ✅ 代码通过 | 推演 5.5/6.1；validate-product + orders/create；结账页 criticalFetch 8s |
| 5 下单 → 支付 → Webhook → 状态回写 | ✅ 代码通过 | 推演 6.3～6.6；Stripe webhook 按 provider_ref 幂等；Runbook 支付补救 |
| 6 订阅 → 权益生效/取消 | ✅ 代码通过 | 推演 7.1～7.6；create-pending/create-payment；useSellerGuard 查 subscriptions；Cron subscription-lifecycle |

**要求**：不白屏、不卡死、不靠手修数据 — 推演结果表 + UI 清单已覆盖；手工结果需在 staging 逐条执行后填写。

### Gate 2：异常情况下不破坏系统

| 异常类型 | 验证结果 | 备注 |
|----------|----------|------|
| 重复点击 | ✅ 代码通过 | 推演 4.7/6.2；发送/结账 disabled+loading；点赞/关注 23505 忽略 |
| 页面刷新/关闭 | ✅ 代码通过 | 推演 8.1；支付已提交由 Webhook 处理；未提交可重试 |
| 网络失败/超时 | ✅ 代码通过 | criticalFetch + CriticalPathTimeoutError；toast「验证超时，请重试」 |
| Webhook 延迟或重复 | ✅ 代码通过 | 推演 6.5/6.6；provider_ref 幂等；Runbook 补救与 resend |
| Realtime 未连接 | ✅ 代码通过 | 推演 4.10/8.4；Supabase 客户端重连；appendMessageDeduped |

**要求**：不脏数据、不影响他人、不动钱/权限、可安全重试 — 推演结果表与 Runbook 已覆盖。

### Gate 3：钱 & 权限零容忍

| 类别 | 验证结果 | 备注 |
|------|----------|------|
| Webhook 幂等 | ✅ | Stripe webhook 用 provider_ref 查 payment_transactions，已存在则跳过 return 200 |
| 前端失败 ≠ 支付失败 | ✅ | 订单/订阅状态以 Webhook 与 DB 为准；用户可刷新/查单 |
| 权益只由后端/Webhook 决定 | ✅ | useSellerGuard 查 subscriptions 表；Cron 更新到期 |
| 拉黑/封禁立即生效 | ✅ | middleware banned→/banned；messages API 校验 blocked_users；Message seller 按 canChat/canMessageSeller 显隐 |
| 非本人无法操作资源 | ✅ | 订单/支付/资料/帖子等 API 校验 buyer_id/seller_id/user_id |
| 前端挡 + 后端再挡 | ✅ | 前端 useAuthGuard/useSellerGuard/capabilities；写操作 API 均 getUser() 校验 |

### Gate 4：非核心功能允许降级

| 要求 | 验证结果 | 备注 |
|------|----------|------|
| 失败有用户可理解提示 | ✅ | handleError、toast、EmptyState；评论/编辑资料失败有文案 |
| 不阻塞主链路 | ✅ | 评论/编辑/次级管理失败不阻断登录、发帖、下单、支付 |
| 不写入不完整数据 | ✅ | 发帖/订单/支付/订阅均有事务或校验；失败不写半成品 |

### Gate 5：可观测性最低保障

| 能力 | 验证结果 | 备注 |
|------|----------|------|
| 支付/订单/订阅有日志 | ✅ | logAudit 覆盖订单创建/取消/确认收货/发货、支付、订阅、佣金等；withApiLogging 覆盖主要 API |
| 消息发送失败可追踪 | ✅ | /api/messages 有 logAudit(send_message)；withApiLogging；403/401 带 message |
| 能定位 user_id + 关键行为 | ✅ | logAudit 含 userId、resourceId、action、timestamp |
| 知道「这笔钱发生了什么」 | ✅ | payment_transactions、orders、subscriptions 表；Runbook 对账与补救步骤 |

**汇总**：Gate 0～5 均已有对应实现或文档；RLS 需在目标库确认；Gate 1 六条链路与 Gate 2 异常场景需在 **staging 手工跑通** 并填写推演结果表「手工结果」列后，再视为上线 Gate 通过。

**已落实的文档**：
- **Gate 1 六条链路**：推演结果表已新增 [Gate 1 六条链路（staging 手工执行）](pre-launch-runthrough-results.md#gate-1-六条链路staging-手工执行) 表，按链路填写手工结果/执行人/执行日期即可。
- **业务表 RLS**：配置检查表已新增 [七、业务表 RLS 确认（目标生产库）](pre-launch-config-checklist.md#七业务表-rls-确认目标生产库)，含业务表清单与 SQL 核对方式。
- **发布签署**：配置检查表已新增 [发布签署](pre-launch-config-checklist.md#发布签署) 栏，发布前逐项打勾（含一～七）并由发布负责人签字/记录日期。
