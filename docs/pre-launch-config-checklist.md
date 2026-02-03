# 上线前配置检查表

发布生产前请逐项打勾，全部通过后再发布。

---

## 一、环境变量

| 序号 | 项 | 说明 | 勾选 |
|------|----|------|------|
| 1 | `NEXT_PUBLIC_SUPABASE_URL` | 必填，缺则生产 503 | ☐ |
| 2 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 必填，缺则生产 503 | ☐ |
| 3 | `SUPABASE_SERVICE_ROLE_KEY` | 必填，缺则生产 503 | ☐ |
| 4 | `CRON_SECRET` | 推荐，缺则所有 /api/cron/* 返回 401 | ☐ |
| 5 | `NEXT_PUBLIC_APP_URL` | 推荐，支付回调/邮件链接会用到，缺则回退 localhost | ☐ |
| 6 | 至少一种支付方式 | Stripe / PayPal / Alipay / WeChat 至少配置一组 | ☐ |

详见 [env-checklist-for-deploy.md](env-checklist-for-deploy.md)。

---

## 二、数据库迁移

| 序号 | 项 | 说明 | 勾选 |
|------|----|------|------|
| 1 | 在目标 Supabase 项目执行全部迁移 | 按 `supabase/migrations/` 下文件名顺序执行 | ☐ |
| 2 | 记录生产当前最新迁移版本 | 填写最后执行的迁移文件名，便于回滚对照：________________ | ☐ |

---

## 三、Cron 鉴权

| 序号 | 项 | 说明 | 勾选 |
|------|----|------|------|
| 1 | Vercel Cron 请求头 | 确认带 `Authorization: Bearer <CRON_SECRET>`（Vercel 项目 Settings → Cron Jobs） | ☐ |

未配置时所有 `/api/cron/*` 返回 401，定时任务不会执行。

---

## 四、安全与敏感路由

| 序号 | 项 | 说明 | 勾选 |
|------|----|------|------|
| 1 | 无 debug 类路由对外 | 已全局检查，当前仓库无 `/debug-env` 等调试路由；若后续新增，须仅开发环境可访问或生产 404 | ☐ |

---

## 五、部署后自检

| 序号 | 项 | 说明 | 勾选 |
|------|----|------|------|
| 1 | 生产首页可访问且非 503 | 表示必填环境变量已生效 | ☐ |
| 2 | 健康检查可用 | `GET /api/health` 返回 200（见 [生产故障预案](production-runbook.md)） | ☐ |
| 3 | 无环境变量告警 | 控制台/日志无 CRON_SECRET、NEXT_PUBLIC_APP_URL 等推荐项缺失告警 | ☐ |

---

## 六、回滚方式（Gate 0 要求）

| 序号 | 项 | 说明 | 勾选 |
|------|----|------|------|
| 1 | 已阅读并认可回滚步骤 | 见 [production-runbook.md](production-runbook.md)：503 回滚（Redeploy/回退部署）、支付补救、Cron 补跑、迁移回滚；必要时关功能或回退版本 | ☐ |

---

## 七、业务表 RLS 确认（目标生产库）

在 **目标生产 Supabase 项目** 确认以下业务表 RLS 已开启（Table Editor → 选中表 → RLS 为 ON，或执行下方 SQL 核对）。

| 序号 | 表名（public） | 说明 | 勾选 |
|------|----------------|------|------|
| 1 | profiles | 用户资料 | ☐ |
| 2 | posts | 帖子 | ☐ |
| 3 | comments | 帖子评论 | ☐ |
| 4 | likes | 点赞 | ☐ |
| 5 | follows | 关注 | ☐ |
| 6 | blocked_users | 拉黑 | ☐ |
| 7 | products | 商品 | ☐ |
| 8 | orders / order_items | 订单 | ☐ |
| 9 | subscriptions | 订阅 | ☐ |
| 10 | conversations / group_members / messages | 会话与消息 | ☐ |
| 11 | user_addresses / user_settings | 地址与设置 | ☐ |
| 12 | payment_transactions / payment_accounts | 支付与收款账户（若存在） | ☐ |
| 13 | notifications / reports | 通知与举报 | ☐ |

**SQL 核对（Supabase SQL Editor）**：执行后检查 `rowsecurity = true` 的表是否包含上述业务表。

```sql
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

---

## 发布签署

**发布前请逐项打勾（含一～七），并由发布负责人签字/记录日期后再执行生产发布。**

| 项 | 填写 |
|----|------|
| 发布负责人 | ________________ |
| 签署日期 | ________________ |
