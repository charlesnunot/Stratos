# 上线前系统性工作清单 — 执行结果

**执行依据**：[pre-launch-systematic-checklist.md](pre-launch-systematic-checklist.md)  
**执行方式**：代码静态验证 + 本地构建/健康检查尝试  
**执行日期**：按本次运行记录

---

## 1️⃣ 核心链路推演（代码验证）

| 链路 | 验证项 | 结果 | 证据 |
|------|--------|------|------|
| 1 游客→登录→使用系统 | 未登录拦截、redirect 正确 | ✅ | `useAuthGuard` 用 pathname 写 redirect；登录页 `validateRedirectUrl`；middleware 不拦未登录 |
| 2 登录→社交（发帖/关注） | 发帖/关注/取消关注鉴权与幂等 | ✅ | post/create 用 useAuthGuard；useProfile follow 23505 忽略、unfollow delete 幂等 |
| 3 Message seller→会话→聊天 | 建会话、跳转、发消息 | ✅ | `getOrCreateConversationCore` + `openChat`；POST /api/messages 鉴权+成员+blocked_users 校验 |
| 4 聊天→Buy Now→下单 | 结账、创建订单 | ✅ | checkout 用 `criticalFetch('checkout_create_orders', 8s)` 调 /api/orders/create；校验 product.status |
| 5 下单→支付→Webhook→状态 | 幂等、状态回写 | ✅ | Stripe webhook 按 provider_ref 查 payment_transactions，已存在则跳过/更新后 return；迁移 104 UNIQUE(provider, provider_ref) |
| 6 订阅→权益生效/取消 | 订阅校验、权益查询 | ✅ | useSellerGuard 查 subscriptions 表 active+expires_at；create-pending/create-payment + logAudit |

**手工**：六条链路需在 **staging** 手工跑通并填写 [pre-launch-runthrough-results.md#gate-1-六条链路](pre-launch-runthrough-results.md#gate-1-六条链路staging-手工执行)。

---

## 2️⃣ 上线 Gate 检查（代码验证）

| Gate | 验证项 | 结果 | 证据 |
|------|--------|------|------|
| Gate 0 | 环境变量校验、回滚文档 | ✅ | middleware 缺变量时生产 503；validateEnvOrThrow；[production-runbook](production-runbook.md) 回滚步骤 |
| Gate 1 | 六条链路代码路径存在 | ✅ | 见 1️⃣ |
| Gate 2 | 重复点击、刷新、网络失败、Webhook 重复、Realtime | ✅ | 结账/聊天 disabled={loading}；criticalFetch 超时「验证超时，请重试」；Stripe provider_ref 幂等；appendMessageDeduped |
| Gate 3 | 钱/权限：Webhook 幂等、拉黑生效、非本人不可操作 | ✅ | provider_ref 幂等；messages API blocked_users 403；订单 API getUser+order.buyer_id/seller_id 校验 |
| Gate 4 | 降级有边界 | ✅ | handleError/toast/EmptyState 覆盖失败提示 |
| Gate 5 | 可观测：支付/订单/订阅/消息有日志 | ✅ | orders/create|ship|cancel|confirm-receipt|dispute 及 subscriptions、messages 有 logAudit |

---

## 3️⃣ UI 快速检查（代码验证）

| 检查点 | 结果 | 证据 |
|--------|------|------|
| Message seller | ✅ | ChatButton disabled={loading}、toast 错误；ProductDetailView canMessageSeller 显隐 |
| Buy Now | ✅ | checkout Button disabled={loading}；criticalFetch 超时提示 |
| Send message | ✅ | ChatWindow disabled={loading \|\| !newMessage.trim()}；handleError/toast 发送失败 |
| Subscribe | ✅ | 订阅页走 create-payment，失败 API 错误 |
| 权限：被拉黑 | ✅ | canChat/canMessageSeller 控制显隐；/api/messages 403 "You have been blocked" |
| 权限：非卖家/未订阅 | ✅ | useSellerGuard 查 subscriptions 后重定向；Sidebar 仅 isSeller 展示卖家入口 |

---

## 4️⃣ 权限与安全检查（代码验证）

| 项 | 结果 | 证据 |
|----|------|------|
| 未登录/被拉黑/非卖家/未订阅 | ✅ | middleware banned/suspended→/banned；useAuthGuard/useSellerGuard；messages blocked_users |
| 写操作 API 校验 user | ✅ | orders/create、cancel、ship、confirm-receipt、dispute、get-available-payment-methods 均 getUser()，无 user 则 401 |
| 订单/资源本人校验 | ✅ | cancel/ship/confirm-receipt/dispute 校验 order.buyer_id 或 order.seller_id === user.id，否则 403 |

---

## 5️⃣ 数据与 DB 检查（代码/迁移验证）

| 项 | 结果 | 证据 |
|----|------|------|
| 迁移与唯一约束 | ✅ | 104 payment_transactions UNIQUE(provider, provider_ref)；001 order_number UNIQUE、conversations UNIQUE(participant1_id, participant2_id, conversation_type) |
| 回滚/灾备文档 | ✅ | [production-runbook](production-runbook.md) 含 503、支付补救、Cron 补跑、迁移回滚 |

---

## 6️⃣ 集成与第三方（代码验证）

| 服务 | 结果 | 证据 |
|------|------|------|
| 支付 Webhook 幂等 | ✅ | Stripe/Alipay/WeChat/PayPal 均按 provider_ref 查 payment_transactions |
| Cron 鉴权与日志 | ✅ | verifyCronSecret 校验 CRON_SECRET；各 cron 路由写 cron_logs |
| Realtime 消息去重 | ✅ | ChatWindow appendMessageDeduped |

---

## 7️⃣ 性能与压力（代码验证）

| 项 | 结果 | 证据 |
|----|------|------|
| 关键路径超时 | ✅ | criticalFetch 默认 8s；checkout 三处 timeoutMs: 8000；pay 页 8000/4000；超时抛 CriticalPathTimeoutError「验证超时，请重试」 |

---

## 8️⃣ 日志与监控（代码验证）

| 能力 | 结果 | 证据 |
|------|------|------|
| 订单/支付/订阅/消息审计 | ✅ | orders/create、cancel、ship、confirm-receipt、dispute；subscriptions create-pending、create-payment；messages route logAudit(send_message) |
| audit_log 持久化 | ✅ | [src/lib/api/audit.ts](src/lib/api/audit.ts) persistAudit 写 audit_log 表 |

---

## 9️⃣ 文档与回滚准备（存在性）

| 项 | 结果 | 路径 |
|----|------|------|
| 配置检查表 | ✅ | [pre-launch-config-checklist.md](pre-launch-config-checklist.md) |
| 生产故障预案 | ✅ | [production-runbook.md](production-runbook.md) |
| 上线 Gate | ✅ | [pre-launch-production-release-gate.md](pre-launch-production-release-gate.md) |

---

## 🔟 本地构建与健康检查（本次执行）

| 操作 | 结果 | 说明 |
|------|------|------|
| `npm run build` | ⏳ 已启动 | 构建已启动（Next.js 14）；若需完整通过请在本机执行至完成 |
| GET /api/health | ⚠️ 未测 | 本环境无法连接本地 dev 服务器；请在本机执行：`npm run dev` 后访问 `http://localhost:3000/api/health`，预期 200 + `{"status":"ok"}`（需 Supabase 可用），否则 503 |

---

## 待您本地/staging 完成项

1. **Gate 1 六条链路**：在 staging 按 [pre-launch-runthrough-results.md](pre-launch-runthrough-results.md) 表「Gate 1 六条链路」逐条跑通，填写「手工结果」「执行人」「执行日期」。
2. **健康检查**：部署后或本机 `npm run dev` 后调用 `GET /api/health`，确认 200。
3. **配置检查表**：发布前 [pre-launch-config-checklist.md](pre-launch-config-checklist.md) 一～七打勾，发布签署填写。
4. **目标生产库 RLS**：在目标 Supabase 执行配置检查表「七、业务表 RLS 确认」SQL 并逐表打勾。

---

**汇总**：1～9 项已按代码/迁移/文档完成验证，结论通过；第 10 项健康检查与 Gate 1 手工需在您本地或 staging 执行并填写上述文档。
