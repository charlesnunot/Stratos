# 付费章节功能设计（订阅开通）

> **功能已下线**：帖子付费章节已取消。本文档仅作历史参考；迁移 230–234（付费章节相关）已从仓库删除。

## 1. 业务规则

- **开通条件**：用户需订阅「创作者 / 付费章节」专属套餐后，才能为故事/连载设置付费章节。
- **适用内容**：仅对 `post_type` 为 `story` 或 `series` 的帖子（章节）可标记为付费。
- **读者侧**：未购买某章节时仅展示摘要/试读；购买后永久可读。

## 2. 订阅体系扩展

### 2.1 新增订阅类型 `creator`

- 与现有 `seller`、`affiliate`、`tip` 并列，新增 `subscription_type = 'creator'`。
- 用户拥有**有效**的 creator 订阅时，即视为「已开通付费章节功能」。
- 套餐可设计为：月费/年费（如 29/月、199/年），仅用于「开通权限」，与具体章节收入无关；章节收入归作者（可后续与平台分成策略一起设计）。

### 2.2 用户侧标识

- **方案 A（推荐）**：不新增 profile 字段，仅通过 RPC `check_paid_chapters_enabled(p_user_id)` 查询当前是否有有效 creator 订阅。
- **方案 B**：在 `profiles` 增加 `paid_chapters_enabled BOOLEAN`，由订阅生命周期 trigger 同步更新（与 `tip_enabled` 一致），便于列表/筛选。

本方案采用 **方案 B**，与打赏开关一致，便于前端与运营统计。

## 3. 数据模型

### 3.1 订阅与 Profile

- `subscriptions.subscription_type` 增加 `'creator'`。
- `profiles` 增加 `paid_chapters_enabled BOOLEAN DEFAULT false`。
- Trigger：当 creator 订阅变为 active 时设 `paid_chapters_enabled = true`；当该类型无任何有效订阅时设为 `false`。

### 3.2 帖子（章节）付费属性

在 `posts` 表增加：

| 字段 | 类型 | 说明 |
|------|------|------|
| `is_paid_chapter` | BOOLEAN | 是否付费章节，默认 false |
| `chapter_price_cents` | INT | 价格（分），仅当 is_paid_chapter=true 时有效 |
| `chapter_currency` | TEXT | 货币，如 USD/CNY，默认与作者偏好一致 |

约束：

- 仅当 `post_type IN ('story', 'series')` 时允许 `is_paid_chapter = true`。
- `chapter_price_cents >= 0`；若为 0 且 is_paid_chapter=true，表示「免费章节」（占位或后续活动）。

### 3.3 章节购买记录

新建表 `chapter_purchases`：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| buyer_id | UUID | 购买用户 |
| post_id | UUID | 章节（帖子）ID |
| amount_cents | INT | 实付金额（分） |
| currency | TEXT | 货币 |
| payment_transaction_id | UUID | 关联 payment_transactions，可选 |
| paid_at | TIMESTAMPTZ | 支付成功时间 |
| created_at | TIMESTAMPTZ | 创建时间 |

- 唯一约束：`(buyer_id, post_id)`，同一用户对同一章节只记一条购买。
- RLS：读者仅可查自己的购买记录；作者可查自己帖子下的购买（用于统计）；写入由服务端/支付回调完成。

### 3.4 支付流水

- `payment_transactions.type` 增加 `'chapter'`。
- `payment_transactions.related_id` 在 type='chapter' 时指向 `chapter_purchases.id`。

## 4. 核心能力与接口

### 4.1 权限与查询

- **是否已开通付费章节**：`check_paid_chapters_enabled(p_user_id)` → boolean，基于有效 creator 订阅或 profile.paid_chapters_enabled。
- **读者是否可看某章节**：`can_view_chapter(p_viewer_id, p_post_id)` → boolean：
  - 若帖子非付费章节，或 viewer 为作者，或为管理员 → true；
  - 否则查 `chapter_purchases` 是否存在 (viewer_id, post_id) → true/false。

### 4.2 发帖/编辑

- 仅当 `check_paid_chapters_enabled(user_id)` 为 true 时，发帖/编辑页展示「设为付费章节」及价格输入。
- 服务端校验：若 `is_paid_chapter=true`，则校验当前用户已开通付费章节权限，且 `post_type IN ('story','series')`，且 `chapter_price_cents >= 0`。

### 4.3 阅读与支付

- 帖子详情/连载阅读处：根据 `can_view_chapter(viewer_id, post_id)` 决定展示全文或试读+「购买本章」按钮。
- 购买流程：创建订单/支付会话 → 支付成功后插入 `chapter_purchases` 并写 `payment_transactions`（type='chapter'）→ 前端刷新或跳转后根据 `can_view_chapter` 展示全文。

## 5. 前端要点

- **创作者中心/订阅页**：增加「付费章节」套餐（creator），购买后 `paid_chapters_enabled` 为 true。
- **发帖/编辑**：有权限时展示「付费章节」开关 + 价格（元/分由前端换算）。
- **帖子详情/连载**：付费章节未购买时显示试读 + 购买按钮；已购买或免费章节直接显示正文。
- **个人/作品统计**（可选）：作者端可展示「付费章节数」「本章购买人数」等（基于 `chapter_purchases` 聚合）。

## 6. 实施顺序建议（DB 已完成）

1. **迁移 230**（已完成）：订阅类型 creator、profile.paid_chapters_enabled、trigger；RPC check_paid_chapters_enabled；posts 增加 is_paid_chapter、chapter_price_cents、chapter_currency。
2. **迁移 231**（已完成）：chapter_purchases 表；payment_transactions.type 增加 'chapter'；RPC can_view_chapter；RLS。
3. **应用层（待做）**：
   - 订阅页：增加「付费章节 / 创作者」套餐（creator），购买后 paid_chapters_enabled 由 trigger 设为 true。
   - 发帖/编辑：若 check_paid_chapters_enabled 为 true 且 post_type 为 story/series，展示「付费章节」开关与价格输入；提交时写入 is_paid_chapter、chapter_price_cents、chapter_currency。
   - 帖子详情/连载：根据 can_view_chapter(viewer_id, post_id) 决定展示全文或试读 +「购买本章」；购买流程：创建支付 → 回调写入 chapter_purchases 与 payment_transactions(type='chapter') → 刷新后展示全文。

---

文档版本：1.0  
与「用户需订阅成为专门用户才能开通付费章节」一致。
