# 支付与结算架构

本文档描述平台支付、结算与直营卖家的架构共识与约束。平台官方收款账户的详细设计见 [平台官方收款账户架构](../platform-payment-account-architecture.md)。

---

## 用户与卖家模型（资金归属）

| 维度 | 外部用户/卖家 | 内部用户 / 直营卖家 |
|------|----------------|----------------------|
| **用户** | 公开注册；需订阅才能打赏/带货 | Admin 创建；打赏/带货由 Admin 开通，无订阅费，资金走平台 |
| **卖家** | 需卖家订阅与保证金；自有收款 | 直营由 Admin 设置；无订阅无保证金；平台收款/退款/佣金支出走平台 |
| **订单/佣金** | 资金归属卖家或带货者 | 直营订单 `funds_recipient=platform`；佣金由平台支付给带货者（`funds_source: platform`） |

详见 [内部用户（Internal Users）](../internal-users.md)。

---

## 直营卖家（冷启动）共识

**定调（平台共识）**：

> 直营卖家在结算与支付语义上等同于平台自身商品，而非第三方卖家；其身份仅用于内部结算与风控，不向买家或公域暴露。

### 含义

- **结算与支付**：直营卖家的订单款项进入**平台收款账户**，与“买家直付给外部卖家”的路径不同；对账、退款、财务导出以订单上的 `funds_recipient`（platform / seller）和 `seller_type_snapshot` 为准。
- **身份不对外暴露**：直营标水（Badge/文案）仅**管理员**和**该直营卖家本人**可见；买家、公域、其他卖家一律不展示，API 对非管理员且非本人不返回 `seller_type`，避免冷启动策略失效。

### 直营卖家如何产生

- 直营卖家**不开放注册**，只能由**管理员在后台**将已存在的 seller 在 external ↔ direct 之间切换（convert existing）。
- 不新增注册流程，不向任何端暴露“直营”选项；仅 admin 可操作。

### 数据与风控

- **订单层**：`orders.seller_type_snapshot`、`orders.funds_recipient` 在下单时写入，作为支付/退款/对账的唯一语义依据（金融级防御）。
- **平台账户不可用**：直营订单在**订单创建阶段**即失败（fail-fast），不静默 fallback，避免资金语义漂移。
- **审计**：每次 seller_type 切换写入 `seller_type_audit_logs`（seller_id、operator_admin_id、before、after、created_at）。

---

## 平台账户配置要求（冷启动）

- 通过管理端 `/admin/platform-payment-accounts` 配齐至少一种支付方式与对应币种。
- 确保 `get_platform_payment_account(p_currency, p_account_type)` 能返回 **active + verified** 的平台账户；否则直营卖家无法下单。

---

## 测试与故障排查

- **直营下单**：创建 `seller_type='direct'` 的卖家，配置平台 Stripe（或其它）账户后，下单 → 支付应进入平台账户；订单 `funds_recipient='platform'`。
- **外部卖家**：仍走 destination charges，资金进卖家账户；订单 `funds_recipient='seller'`。
- **可见性**：用买家或其它卖家账号访问直营卖家的商品/店铺/订单，页面上不得出现“直营”相关文案；相关 API 不返回 `seller_type`。
- **平台账户不可用**：直营卖家下单时若平台账户未配置或未验证，应返回明确错误（如 Payment method unavailable），不在 checkout 阶段静默 fallback。

---

## 相关文档

- [内部用户（Internal Users）](../internal-users.md)：系统主体（冷启动/测试/自动化），与直营卖家正交；`user_origin` 与 `seller_type` 独立。
