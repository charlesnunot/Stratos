# PayPal Sandbox 测试与生产一致性指南

## 一、Sandbox 决策优先级

**优先级**：平台账户 `sandbox` > `PAYPAL_SANDBOX` 环境变量 > `NODE_ENV`

| 优先级 | 来源 | 说明 |
|--------|------|------|
| 1 | 平台账户 `account_info.sandbox` | 管理员在后台配置平台收款账户时勾选「使用沙盒环境」 |
| 2 | `PAYPAL_SANDBOX` | `true`/`1` 为沙盒，`false`/`0` 为生产；预发环境可用此覆盖 NODE_ENV |
| 3 | `NODE_ENV !== 'production'` | 未配置上述两项时，开发环境默认沙盒、生产默认 Live |

**代码位置**：`src/lib/payments/paypal.ts` 中 `resolveSandbox()` 函数。

---

## 二、PayPal SDK 加载说明

- **同一 Client ID 自动区分 Sandbox / Production**：PayPal Client ID 本身标识环境（Sandbox 应用与 Live 应用在 PayPal Developer Dashboard 中为不同应用）。
- **前端 Client ID 来源**：`PayPalButton` 优先从 `GET /api/payments/paypal/client-config` 获取，与后端 `create-order`、`capture-order` 共用配置；API 失败时回退到 `NEXT_PUBLIC_PAYPAL_CLIENT_ID`。
- **无需在代码中根据环境分支**：仅加载一次 Client ID，SDK 会根据 Client ID 自动连接对应环境。

---

## 三、Webhook 配置一致性约定

- 若未来实现 PayPal Webhook（如 `PAYMENT.CAPTURE.COMPLETED`），**必须**调用 `getPayPalClientConfig()` 获取配置，与 create-order、capture-order、client-config 共用同一配置源。
- 避免 Webhook URL 与 create-order 使用的环境不一致（例如 Webhook 用 Live、create-order 用 Sandbox）。
- 幂等性：Webhook 与 capture-order 均按 `provider_ref`（capture ID）查 `payment_transactions`，避免重复处理。

---

## 四、平台账户 account_info Schema（PayPal）

```json
{
  "client_id": "PayPal App Client ID（Sandbox 或 Live）",
  "client_secret": "PayPal App Client Secret",
  "sandbox": true
}
```

- `sandbox: true` → 使用 `api-m.sandbox.paypal.com`
- `sandbox: false` → 使用 `api-m.paypal.com`
- 管理员在后台绑定平台账户时，需明确勾选「使用沙盒环境」。

---

## 五、Sandbox 账号角色与标准测试流程

### 5.1 账号角色

| 角色 | 账号示例 | 用途 |
|------|----------|------|
| 商家 (Business) | sb-xxx@business.example.com | 后端 API 凭据（Client ID + Secret）、接收付款 |
| 买家 (Personal) | sb-xxx@personal.example.com | 弹窗内登录付款，无需填卡号/身份证 |

### 5.2 标准测试步骤

1. **后端**：使用 Business Sandbox 的 Client ID / Secret（平台账户或 env）
2. **前端**：点击 PayPal 按钮，弹窗出现
3. **弹窗内**：**直接登录** sb-xxx@personal.example.com（不要用 Guest Checkout）
4. **用户操作**：点击「同意并付款」
5. **验证**：capture 成功，订单/订阅/打赏状态更新，`payment_transactions` 有记录

### 5.3 上线 Gate（验收标准）

- 使用 Sandbox business + personal 完成一次端到端支付
- 验证幂等性（同一 captureId 重复请求不重复处理）
- 验证取消流程（用户在弹窗取消，无副作用）
- **不接受**「只看到弹窗就算通过」

---

## 六、部署与环境变量

| 场景 | 配置方式 |
|------|----------|
| 开发/测试 | 平台账户 `sandbox: true`，或 env：Sandbox 凭据 + `PAYPAL_SANDBOX=true` |
| 预发 | 同测试；可 `NODE_ENV=production` 但 `PAYPAL_SANDBOX=true` |
| 生产 | 平台账户 `sandbox: false`，或 env：Live 凭据 + `PAYPAL_SANDBOX=false` 或不设 |

同一环境内，平台账户与 env 二选一，避免混用。
