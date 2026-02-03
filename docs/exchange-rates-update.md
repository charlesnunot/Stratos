# 汇率数据与 exchange_rates 表更新

## 一、是否需要每日更新？

| 用途 | 是否依赖 exchange_rates 表 | 建议 |
|------|----------------------------|------|
| **后端**（保证金/债务/佣金换算为 USD） | ✅ 是，`convert_to_usd()` 会先查表 | 建议每日更新，保证业务计算一致 |
| **前端「参考换算」展示**（如 100 CNY ≈ 14 USD） | ❌ 当前用 `convert-currency.ts` 的 fallback 静态汇率 | 可选：继续用 fallback，或改为读表/读 API |

结论：

- **若希望「参考换算」和后台逻辑都用同一套汇率**：应对 `exchange_rates` 做**每日更新**（例如每日一次 cron）。
- **若仅后台用表、前端展示用静态 fallback 即可**：可以暂不每日更新，等需要时再接 API。

---

## 二、免费汇率 API 选项

### 1. ExchangeRate-API（推荐，免 key）

- **地址**：`GET https://api.exchangerate-api.com/v4/latest/USD`
- **特点**：无需 API key，每日更新，需在页面上注明数据来源（attribution）。
- **限制**：建议每天最多调 1～2 次（cron 每日一次），避免被限流。
- **返回示例**：`{ "base": "USD", "rates": { "CNY": 7.2, "EUR": 0.92, ... } }`

文档：<https://www.exchangerate-api.com/docs/free>

### 2. 其他免费方案（需 key，有额度）

- **exchangeratesapi.io**：约 100 次/月免费。
- **openexchangerates.org**：有免费档，适合小流量。

---

## 三、exchange_rates 表结构（回顾）

```sql
exchange_rates (
  base_currency TEXT NOT NULL,   -- 源币种，如 'CNY'
  target_currency TEXT NOT NULL, -- 目标币种，如 'USD'
  rate DECIMAL(15, 8) NOT NULL, -- 1 单位 base 可换多少 target
  source TEXT DEFAULT 'manual',
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(base_currency, target_currency, valid_from)
)
```

后端 `convert_to_usd(p_amount, p_from_currency)` 使用：`base_currency = p_from_currency`，`target_currency = 'USD'`，`rate = 1 单位 base 可换多少 USD`。

---

## 四、详细执行方案（已落地）

### Phase 1：Cron API 与每日写入

| 步骤 | 内容 | 状态 |
|------|------|------|
| 1.1 | 新增 API：`GET /api/cron/update-exchange-rates`，校验 `Authorization: Bearer ${CRON_SECRET}` | ✅ 已实现 |
| 1.2 | 请求 `https://api.exchangerate-api.com/v4/latest/USD`，解析 `rates` | ✅ 已实现 |
| 1.3 | 支持的币种：USD, CNY, EUR, GBP, JPY, KRW, SGD, HKD, AUD, CAD；对非 USD 计算 `rate_to_usd = 1 / rates[code]` | ✅ 已实现 |
| 1.4 | 当日 UTC 零点为 `valid_from`；先删当日已存在的 (base, USD, valid_from) 再插入，保证幂等 | ✅ 已实现 |
| 1.5 | 使用 `getSupabaseAdmin()` 写入 `exchange_rates`（Service Role） | ✅ 已实现 |
| 1.6 | 在 `vercel.json` 中注册 cron：每日 UTC 0:00 执行 | ✅ 已配置 |

### Phase 2：环境与运维

| 步骤 | 内容 | 说明 |
|------|------|------|
| 2.1 | 环境变量 | 部署环境需配置 `CRON_SECRET`（Vercel Cron 调用时携带）、`SUPABASE_SERVICE_ROLE_KEY`、`NEXT_PUBLIC_SUPABASE_URL` |
| 2.2 | 手动触发 | 本地或生产可用 `curl -H "Authorization: Bearer <CRON_SECRET>" https://<your-domain>/api/cron/update-exchange-rates` 测试 |
| 2.3 | 日志与监控 | 成功返回 `{ success: true, updated: 10 }`；失败返回 4xx/5xx，可在 Vercel Functions 日志中查看 |

### Phase 3：Attribution（合规）

| 步骤 | 内容 | 说明 |
|------|------|------|
| 3.1 | 展示汇率的页面 | 在商品价格「参考换算」或页脚等处注明：汇率仅供参考，数据来源 [ExchangeRate-API](https://www.exchangerate-api.com) |
| 3.2 | 文案 | 已提供 i18n 键 `products.conversionDisclaimer`，可在详情页展示；attribution 链接可放在设置/关于或页脚 |

### 执行清单（上线前）

- [ ] 在 Vercel（或当前部署平台）配置 `CRON_SECRET`
- [ ] 确认 `SUPABASE_SERVICE_ROLE_KEY` 已配置且有权写 `exchange_rates`
- [ ] 部署后首次可手动调用一次 `/api/cron/update-exchange-rates` 验证写入
- [ ] 在展示汇率的页面或页脚添加 ExchangeRate-API 的 attribution

---

## 五、前端「参考换算」是否用表？

- **方案 A（当前）**：前端只用 `convert-currency.ts` 的静态 fallback，不读 `exchange_rates`。
- **方案 B**：新增 API 或 RPC 按表返回换算结果，前端参考换算改为调该接口，与后台共用一套汇率。

建议：先跑通 **exchange_rates 每日更新**；前端可暂时保持 fallback，待需要前后端汇率一致时再接方案 B。

---

## 六、Attribution 文案示例

使用 ExchangeRate-API 免费端点时，请在展示汇率处注明：

- 中文：`汇率仅供参考，数据来源：ExchangeRate-API (https://www.exchangerate-api.com)`
- 英文：`Rates for reference only. Data by ExchangeRate-API (https://www.exchangerate-api.com)`

---

## 七、实施完成清单（开发侧）

| 项 | 实现位置 | 说明 |
|----|----------|------|
| Cron API | `src/app/api/cron/update-exchange-rates/route.ts` | GET，校验 `Authorization: Bearer CRON_SECRET`，拉取 USD 基准汇率并写入 `exchange_rates` |
| Vercel Cron | `vercel.json` | `path: /api/cron/update-exchange-rates`，`schedule: "0 0 * * *"`（每日 UTC 0:00） |
| 参考换算展示 | `ProductCard`、`ProductPageClient`、`HomePageClient`、`FavoriteItem` | 使用 `formatPriceWithConversion`，币种不同时显示「≈ 用户币种」 |
| Attribution | 商品详情页 + i18n `products.conversionSource` | 链接至 https://www.exchangerate-api.com，中英文文案已配置 |
