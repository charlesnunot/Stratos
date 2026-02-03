# 项目自动化检查脚本说明

**脚本**：`scripts/check-project.js`  
**用途**：自动检查项目中的问题和潜在风险，对应上线清单与代码健康度。

---

## 用法

```bash
# 完整检查（含 next lint）
npm run check

# 快速检查（跳过 lint，适合频繁跑）
npm run check:fast

# 含 E2E（需先另开终端 npm run dev）
npm run check:e2e
```

或直接：

```bash
node scripts/check-project.js [--e2e] [--no-lint]
```

- `--e2e`：同时运行 Playwright 对 /en 的检查（需 http://localhost:3000 已启动）
- `--no-lint`：跳过 `next lint`，加快执行

---

## 检查项说明

| 检查项 | 说明 | 失败时 |
|--------|------|--------|
| **messages-json** | src/messages/*.json 能否正确解析（无语法错误） | error |
| **messages-keys** | 各语言 JSON 的 key 是否与参考语言一致（缺 key 会告警） | warn |
| **env-example** | .env.example 是否存在且包含必填项说明 | warn |
| **lint** | next lint 是否通过（未通过时仅作 warn，不阻塞） | warn |
| **api-auth** | 关键 API（orders/create、cancel、messages、subscriptions/create-payment）是否含 getUser 鉴权 | error |
| **webhook-idempotency** | Stripe/Alipay 支付回调是否含 provider_ref 幂等 | warn |
| **ui-loading** | 结账页、聊天、ChatButton 是否含 loading/disabled 防重复 | warn |
| **cron-auth** | /api/cron/* 路由是否使用 verifyCronSecret | warn |
| **health-route** | 是否存在 /api/health 且校验 DB | warn |
| **e2e** | /en 页面 E2E 是否通过（仅 --e2e 时执行） | warn |

---

## 退出码与报告

- **全部通过**：退出码 0，控制台输出「全部通过」。
- **有 error**：退出码 1，CI 可据此判定失败。
- **仅有 warn**：退出码 0，但会提示「建议修复后再上线」。

报告在控制台打印，格式示例：

```
========== Stratos 项目检查报告 ==========

  ✓ [OK] messages-json: 已检查 2 个 JSON，解析通过
  ✓ [OK] messages-keys: 各语言 key 与参考一致
  ✓ [OK] env-example: .env.example 包含必填项说明
  ...
============================================
```

---

## 与上线清单的对应

- **1️⃣ 核心链路 / 2️⃣ Gate**：api-auth、webhook-idempotency、cron-auth、health-route 对应权限与可观测性。
- **3️⃣ UI 快速检查**：ui-loading 对应核心按钮防重复。
- **5️⃣ 数据与配置**：messages-json、env-example 对应配置与 i18n。
- **🔟 E2E**：--e2e 时跑 Playwright /en 检查，对应 Gate 1 首页可访问。

可定期或在 MR 前执行 `npm run check`，必要时加上 `npm run check:e2e`（先启动 dev）。

---

## 相关文档

- **[stratos-test-script-checklist](stratos-test-script-checklist.md)**：系统性测试脚本清单（用户链路、社交、电商、聊天、社区、推荐、运维、UI、自动化思路），与 E2E/API/数据验证扩展对应。
