# 内部用户（Internal Users）

## 定调

**Internal users are system-generated principals used for cold start, testing, and automation. They are not registered users and are never exposed as internal to buyers or public users.**

内部用户是系统生成的主体，用于冷启动、测试与自动化；不是注册用户，且从不向买家或公域暴露“内部”身份。

## 可见性与功能

- **功能**：内部用户与外部用户**功能一致**；不因 `user_origin=internal` 受业务限制（可被搜索、关注、出现在推荐等）。
- **打赏/带货**：由管理员在管理后台开通（`internal_tip_enabled`、`internal_affiliate_enabled`），**无订阅费**；资金走平台账户。
- **对外**：不向公域暴露“内部”标识；profile API 对外与普通用户一致（不返回 `user_origin`）；仅 admin 与内部系统可区分。
- **对内**：管理员可见 `user_origin`；日志、审计、风控可按 internal/external 过滤。

## 创建

- 仅通过 **migration/seed**、**Admin API**（`POST /api/admin/internal-users`）或后续脚本创建；不开放注册。
- 管理端入口：管理后台 → 内部用户 → 创建内部用户。

## 与直营卖家

- internal 可与 direct seller 组合（内部直营卖家）；`user_origin` 与 `seller_type` 独立维护。
- **直营卖家**（`seller_type=direct`）：由管理员设置；无订阅、无保证金；订单收款/退款/佣金支出均走**平台账户**；创建/编辑商品与外部卖家一致（均待审核）。
- 三个维度不混用：`user_origin`（是谁）、`role`/`seller_type`（能干什么）、`funds_recipient`（钱给谁）。

## 冷启动最小组合（推荐）

以下 3 个 internal profiles 可写死进 runbook 或通过 Admin 创建：

1. **1 个 internal + direct seller**（官方商品）：创建后需在「支付账户 / 直营卖家」中将该账号设为直营。
2. **1 个 internal user**（内容生产）：发帖等。
3. **1 个 internal user**（互动/点赞/浏览）：制造冷启动互动数据。

## 实施约定（Supabase Auth）

- 内部用户对应的 `auth.users` **永远不走 password / magic link 登录**。
- 创建时：不发送确认邮件；不暴露 reset password；在 auth user 的 metadata 中写明 `internal: true`。
- 详见 `POST /api/admin/internal-users` 路由注释与 runbook。

## 未来扩展（可选）

- *Future extension: visibility_scope (e.g. private | public_readonly) for internal users.* 当前不新增字段，日后扩展不推翻现有设计。
