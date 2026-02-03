/**
 * Phase 2 信任判断规则可调参数表
 *
 * 产品/运营可在此调节阈值，保证「可解释、可审计、可迭代」。
 * 档位固定为 3 档（low / medium / high），文案保留「平台判断 / 系统判断」前缀。
 */

export const TRUST_JUDGMENT_CONFIG = {
  /** 卖家纠纷：统计近多少天的纠纷。可调 30–180 天；短期敏感选短周期，长期趋势选 180 天。 */
  dispute_window_days: 90,

  /** 卖家纠纷：近 N 天有多少纠纷算高风险。默认 1 笔即触发；可根据纠纷平均水平调成 2 笔。 */
  high_risk_dispute_threshold: 1,

  /** 卖家完成订单：完成订单数 ≤ 此值视为新卖家，判 medium_risk。可根据策略加入「认证卖家、保证金卖家」豁免（后续迭代）。 */
  new_seller_order_threshold: 0,

  /** 商品价格偏离：当前价格超过历史最高价 × 此比例判 medium_risk。可调 1.1–1.5；可根据品类、季节调整。 */
  price_deviation_ratio: 1.2,

  /** 商品价格统计：统计历史成交价格的时间范围（天）。可调 180–730 天，根据商品生命周期调整。 */
  price_history_window_days: 365,
} as const

export type TrustJudgmentConfig = typeof TRUST_JUDGMENT_CONFIG

/**
 * 可调参数说明（供产品/运营查阅）
 *
 * | 环节           | 参数                              | 当前值 | 作用/说明                                      | 可调建议 |
 * |----------------|-----------------------------------|--------|-----------------------------------------------|----------|
 * | 卖家纠纷       | dispute_window_days               | 90     | 统计近多少天的纠纷                             | 30–180 天 |
 * | 卖家纠纷       | high_risk_dispute_threshold       | ≥1     | 近 N 天有多少纠纷算高风险                      | 可调成 2 笔 |
 * | 卖家完成订单   | new_seller_order_threshold        | 0      | 完成订单数=0 即新卖家                          | 可加认证/保证金豁免 |
 * | 商品价格偏离   | price_deviation_ratio             | 1.2    | 当前价 > 历史最高价×ratio 判 medium           | 1.1–1.5 |
 * | 商品价格统计   | price_history_window_days         | 365    | 历史成交价统计范围（天）                       | 180–730 天 |
 * | 档位映射       | risk_levels                       | 3 档   | low / medium / high                           | Phase 2 固定，不改档位数 |
 * | 文案模板       | recommendation_i18n_key           | trust.*| 保留「平台判断/系统判断」前缀                  | 可改文案 |
 * | 证据条         | evidence_types                    | 现有   | completed_orders / disputes / price_deviation  | 可增加卖家认证、成交量增速等 |
 */
