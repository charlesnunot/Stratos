# 用户绑定收款账户与收款就绪详细检查报告

## 一、结论摘要

**仅“绑定好收款账户”不足以直接收款。** 必须同时满足：

1. **profile 已绑定**：`profiles.payment_provider` 与 `profiles.payment_account_id` 已写入  
2. **平台侧就绪**：`profiles.seller_payout_eligibility = 'eligible'`（由 `updateSellerPayoutEligibility` 唯一更新）  
3. **订阅有效**：卖家订阅存在且未过期  
4. **支付方式一致**：买家所选支付方式与卖家 `payment_provider` 一致  

**Stripe**：创建 Connect 账户 → 完成 onboarding 回调 → 回调/Webhook 写 profile 并触发 eligibility → 若 Stripe 返回 charges_enabled 且 payouts_enabled，则可为 `eligible`，即可收款。  

**PayPal / 支付宝 / 微信 / 银行**：此前仅写入 `payment_accounts`，**未同步到 profile**，也**未在设默认或管理员审核后触发 eligibility**，导致永远无法变为 `eligible`，无法通过现有校验收款。已通过本次修复补全：设默认同步 profile + 触发 eligibility；管理员审核通过后同步 profile 并触发 eligibility。

---

## 二、数据与校验链路

### 2.1 涉及表与字段

| 表/来源 | 字段 | 含义 |
|--------|------|------|
| `payment_accounts` | seller_id, account_type, is_default, is_verified, account_info | 卖家添加的收款账户（可多个，按类型一个默认） |
| `profiles` | payment_provider, payment_account_id | **当前用于收款的** 支付方式与账户标识（唯一绑定） |
| `profiles` | provider_charges_enabled, provider_payouts_enabled, provider_account_status | 支付方状态缓存（只读） |
| `profiles` | seller_payout_eligibility | **平台侧是否允许收款**：eligible / blocked / pending_review |

收款能力以 **profile** 为准：`validateSellerPaymentReady` 只读 `profiles`，不读 `payment_accounts`。

### 2.2 何时可以“直接收款”

`validateSellerPaymentReady` 通过条件（全部满足才可创建支付）：

1. 卖家存在  
2. 卖家订阅有效（seller 订阅、active、未过期）  
3. **profile 已绑定**：`payment_provider`、`payment_account_id` 非空  
4. 买家所选支付方式与 `payment_provider` 一致  
5. **seller_payout_eligibility === 'eligible'**（唯一放行状态）  

`calculate_seller_payout_eligibility`（DB）决定 eligible 的条件：

- 订阅有效  
- profile 上已绑定 payment_provider + payment_account_id  
- **Stripe**：`provider_charges_enabled` 且 `provider_payouts_enabled`  
- **PayPal/支付宝/微信**：`provider_account_status = 'enabled'`  
- **银行**：不校验 provider 状态（视为就绪）  
- 未处于 `provider_account_status = 'restricted'`  

因此：**仅“在 payment_accounts 里添加并审核”不够，必须 profile 上有绑定且 eligibility 被算成 eligible。**

---

## 三、各支付方式当前流程（修复前 vs 修复后）

### 3.1 Stripe

| 步骤 | 谁写 profile | 谁触发 eligibility |
|------|----------------|---------------------|
| 创建 Connect 账户 | create-account：写 payment_provider、payment_account_id、provider_* 初始值 | 未触发（当时多为 pending） |
| Onboarding 回调 | callback：写 provider_charges_enabled / payouts_enabled / provider_account_status | ✅ callback 内调用 updateSellerPayoutEligibility |
| Webhook account.updated | webhook：更新 provider_* | ✅ 调用 updateSellerPayoutEligibility |

结论：Stripe 流程完整，**只要 Stripe 侧开通完成，即可变为 eligible 并收款**。

### 3.2 PayPal / 支付宝 / 微信 / 银行（修复前）

| 步骤 | 谁写 profile | 谁触发 eligibility |
|------|----------------|---------------------|
| 用户添加收款账户 | POST /api/payment-accounts | ❌ 只写 payment_accounts，**不写 profile** |
| 用户设默认 | POST set-default | ❌ 只改 payment_accounts.is_default，**不写 profile，不触发 eligibility** |
| 管理员审核通过 | POST admin verify | ❌ 只改 payment_accounts.is_verified，**不写 profile，不触发 eligibility** |

结果：profile 上永远没有 payment_provider/payment_account_id，或没有 provider_account_status='enabled'，eligibility 不会变成 eligible，**无法通过校验，不能收款**。

### 3.3 本次修复（PayPal / 支付宝 / 微信 / 银行）

1. **设默认（set-default）**  
   - 将当前设为默认的账户同步到 profile：  
     - `payment_provider = account_type`  
     - `payment_account_id = payment_accounts.id`（UUID，用于后续查 payment_accounts）  
   - 银行：同时设 `provider_account_status = 'enabled'`（与 DB 中 bank 逻辑一致）  
   - 调用 `updateSellerPayoutEligibility(sellerId)`，使 eligibility 按新状态重算  

2. **管理员审核通过（admin verify）**  
   - 审核通过后：若该账户为卖家**当前默认账户**（`is_default = true`），则同步到 profile（同上）并设 `provider_account_status = 'enabled'`；若非默认，仅调用 `updateSellerPayoutEligibility`（不覆盖 profile，用户可将该账户设为默认后由 set-default 同步）  
   - 调用 `updateSellerPayoutEligibility(sellerId)`  

这样，**用户绑定收款账户并设为默认 + 管理员审核通过（或银行无需审核时仅设默认）** 后，profile 会更新，eligibility 会重算，满足条件即可变为 eligible，即可直接收款。

---

## 四、代码与调用关系

| 模块 | 作用 |
|------|------|
| `validate-seller-payment-ready.ts` | 下单/支付前校验：只读 profile，必须 eligibility === 'eligible' |
| `calculate-seller-payout-eligibility.ts` | 调用 DB `calculate_seller_payout_eligibility`，得到 eligible/blocked/pending_review |
| `update-seller-payout-eligibility.ts` | **唯一** 写 `seller_payout_eligibility` 的入口，内部先算再调 DB `update_seller_payout_eligibility` |
| Stripe callback / webhook | 写 profile 的 provider_*，并调用 updateSellerPayoutEligibility |
| set-default（已修复） | 同步 profile 并调用 updateSellerPayoutEligibility |
| admin verify（已修复） | 审核通过时同步 profile 并调用 updateSellerPayoutEligibility |

---

## 五、回答“用户是否绑定好收款账户就可以直接收款”

- **不能** 仅凭“在页面上添加了收款账户”就认为可以收款。  
- 必须：  
  1. **Profile 已绑定**：当前用于收款的账户已同步到 `profiles.payment_provider` 与 `profiles.payment_account_id`（Stripe 由 Connect 回调/创建写；其他由**设默认**或**管理员审核通过**写）。  
  2. **seller_payout_eligibility = 'eligible'**（由 `updateSellerPayoutEligibility` 在设默认、审核通过、Stripe 回调/Webhook 后触发）。  
  3. 订阅有效、支付方式与卖家一致。  

本次修复后：**用户绑定收款账户并设为默认，且（若需审核）管理员审核通过，即可在满足上述条件后直接收款。**

---

## 六、平台收款（订阅费用等）— 管理员绑定即可

**结论：管理员在后台绑定平台收款账户后，即可收取订阅费、保证金、平台服务费等。**

- **数据**：平台账户存在 `payment_accounts` 表，`is_platform_account = true`、`seller_id = NULL`。每种支付方式（stripe / paypal / alipay / wechat）仅一个平台账户。
- **创建**：管理员通过 **管理后台 → 平台收款账户** 创建并填写 `account_info`（如 Stripe 的 `stripe_secret_key`）。创建时即 `is_verified = true`、`status = 'active'`，无需二次审核。
- **使用**：订阅/保证金/平台服务费 等接口调用 `createCheckoutSession(..., undefined)`（不传 `destinationAccountId`），资金进入平台账户。Stripe/PayPal/Alipay/WeChat 等库优先通过 `get_platform_payment_account` 从数据库读取平台账户配置，未配置时回退到环境变量。
- **条件**：平台账户需 `is_verified = true` 且（对 Stripe）`account_info` 中含有效密钥；管理员创建时已满足，故**管理员绑定（创建）平台收款账户后即可收款**。
