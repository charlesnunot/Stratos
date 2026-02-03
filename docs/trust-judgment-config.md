# Phase 2 信任判断规则可调参数表

产品/运营可调节以下参数（代码入口：`src/lib/trust-judgment/config.ts`），保证「可解释、可审计、可迭代」。

## 可调参数表

| 环节         | 参数                              | 当前值 | 作用/说明                                      | 可调建议 |
|--------------|-----------------------------------|--------|-----------------------------------------------|----------|
| 卖家纠纷     | `dispute_window_days`             | 90     | 统计近多少天的纠纷                             | 30–180 天；短期敏感选短周期，长期趋势选 180 天 |
| 卖家纠纷     | `high_risk_dispute_threshold`     | ≥1     | 近 N 天有多少纠纷算高风险                      | 可根据纠纷平均水平调成 2 笔 |
| 卖家完成订单 | `new_seller_order_threshold`      | 0      | 完成订单数 = 0 即新卖家                        | 可根据策略加入「认证卖家、保证金卖家」豁免（后续迭代） |
| 商品价格偏离 | `price_deviation_ratio`           | 1.2    | 当前价格超过历史最高价 × ratio 判 medium      | 1.1–1.5；可根据品类、季节调整 |
| 商品价格统计 | `price_history_window_days`       | 365    | 统计历史成交价格的时间范围（天）               | 180–730 天，根据商品生命周期调整 |
| 档位映射     | `risk_levels`                     | low / medium / high | 最终输出档位                    | Phase 2 固定 3 档，不建议改动档位数 |
| 文案模板     | `recommendation_i18n_key`         | trust.recommendation* | 不同档位对应的文案 key              | 可改文案，但保留「平台判断 / 系统判断」前缀 |
| 证据条       | `evidence_types`                  | completed_orders / disputes / price_deviation | 展示哪些可验证条目 | 可增加「卖家认证」「成交量增速」等，后续迭代 |

## 建议取值表（参考）

| 参数                              | 建议区间      | 说明 |
|-----------------------------------|---------------|------|
| `dispute_window_days`             | 30–180        | 纠纷窗口越短越敏感，越长越看长期趋势 |
| `high_risk_dispute_threshold`     | 1–2           | 1 笔即高风险偏严，2 笔可降低误伤 |
| `new_seller_order_threshold`      | 0（当前）     | 后续可加认证/保证金豁免逻辑 |
| `price_deviation_ratio`           | 1.1–1.5       | 1.2 为当前默认；品类差异大时可分策略 |
| `price_history_window_days`       | 180–730       | 快消可短，耐用品可长 |

## 修改方式

1. 打开 `src/lib/trust-judgment/config.ts`
2. 修改 `TRUST_JUDGMENT_CONFIG` 中对应字段的数值
3. 部署后生效（无需改 API 或前端，判断逻辑统一读该配置）

RPC 层（Supabase）已支持 `dispute_window_days`、`price_history_window_days` 传入（见 migration `218_trust_judgment_rpc_params.sql`），API 会将 config 中的值传给 RPC。
