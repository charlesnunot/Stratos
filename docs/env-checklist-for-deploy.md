# 线上部署环境变量清单

部署到 Vercel（或其它平台）前，在 **项目 → Settings → Environment Variables** 中按下面清单逐项添加。  
**必填** 未配置时生产环境会返回 503；**推荐** 未配置时定时任务/回调可能异常。

---

## 一、必填（3 项）

| 变量名 | 说明 | 获取方式 |
|--------|------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL | Supabase 控制台 → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名（公钥） | 同上 → Project API keys → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 服务角色密钥 | 同上 → service_role（勿泄露，仅服务端） |

缺任一项：middleware 校验会抛错，生产返回 **503 Service Unavailable**。

---

## 二、推荐（生产务必配置，2 项）

| 变量名 | 说明 | 建议值 |
|--------|------|--------|
| `CRON_SECRET` | 定时任务鉴权 | 随机字符串（建议 32 位以上），如 `openssl rand -hex 24` 生成 |
| `NEXT_PUBLIC_APP_URL` | 应用公网地址 | 部署后的域名，如 `https://your-app.vercel.app` |

- **CRON_SECRET** 未配置：所有 `/api/cron/*` 返回 **401**，定时任务不会执行。  
- **NEXT_PUBLIC_APP_URL** 未配置：支付回调、邮件链接等会回退到 `origin` 或 `localhost`，建议设为生产域名。

---

## 三、支付（至少配置一种）

按实际使用的支付方式配置，否则生产会打日志告警。

| 变量名 | 说明 |
|--------|------|
| **Stripe** | `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET` |
| **PayPal** | `PAYPAL_CLIENT_ID`、`PAYPAL_CLIENT_SECRET` |
| **Alipay** | `ALIPAY_APP_ID`、`ALIPAY_PRIVATE_KEY`、`ALIPAY_PUBLIC_KEY` |
| **WeChat Pay** | `WECHAT_PAY_APP_ID`、`WECHAT_PAY_MCH_ID`、`WECHAT_PAY_API_KEY`、证书路径等 |

---

## 四、可选（按需）

| 变量名 | 说明 |
|--------|------|
| `DEEPSEEK_API_KEY` | AI 推理（/api/ai/complete） |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`、`CLOUDINARY_API_KEY`、`CLOUDINARY_API_SECRET` | 审核通过后图片迁移到 Cloudinary |
| `CHAPTER_PRICE_MAX_CENTS`、`CHAPTER_DAILY_SPEND_MAX_CENTS` | 付费章节风控（见 docs/paid-chapters-risk-control.md） |

---

## 五、Vercel 操作步骤

1. 打开 Vercel 项目 → **Settings** → **Environment Variables**。  
2. 先填 **必填** 三项（Production / Preview / Development 按需勾选，一般 Production 必勾）。  
3. 再填 **推荐** 两项：  
   - `CRON_SECRET`：本地执行 `openssl rand -hex 24` 或自拟长随机串。  
   - `NEXT_PUBLIC_APP_URL`：首次部署可先填 `https://xxx.vercel.app`，部署后再改成正式域名。  
4. 配置至少一种支付相关变量（若需要支付功能）。  
5. 保存后 **Redeploy** 一次，使新变量生效。

---

## 六、部署后自检

- 打开生产首页：无 503 即表示必填三项已生效。  
- 若使用 Vercel Cron：在 Vercel 项目 **Settings → Cron Jobs** 中确认请求头带 `Authorization: Bearer <CRON_SECRET>`（或平台文档中对应配置）。  
- 控制台/日志中若无 “Environment variable warnings” 中关于 `CRON_SECRET`、`NEXT_PUBLIC_APP_URL` 的告警，即推荐项已配置完整。

变量名与说明与仓库内 `.env.example`、`src/lib/env/validate.ts` 一致。
