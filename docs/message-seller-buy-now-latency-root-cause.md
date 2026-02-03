# Message seller / Buy Now 跳转慢：根因与 10 秒内必达方案

## 目标

- **Message seller**：点击后 **10 秒内** 必须跳转到聊天页
- **Buy Now**：点击后 **10 秒内** 必须跳转到支付/收银台页  
这是成交关键路径，不能长时间等待或反复重试。

---

## 一、Message seller 慢的根因

### 1.1 数据流（当前，已修复）

```
用户点击 Message seller
  → useConversation.getOrCreateConversation(sellerId)
      → supabase.rpc('get_or_create_private_conversation', …)  ← 单次网络（cookie + auth.uid()）
      → Promise.race(8s) 超时兜底
  → router.push('/messages/[id]')
```

**已落实**：已去掉 getSession()，仅一次 RPC；前端 8 秒超时 + 「打开聊天超时，请重试」文案。

### 1.2 根因归纳

| 根因 | 说明 | 影响 |
|------|------|------|
| **双重往返** | 先 `getSession()` 再调 RPC，两次网络串行 | 延迟叠加，易超 10 秒 |
| **getSession 非必需** | RPC 内用 `auth.uid()` 校验，未登录会直接报错；session 由 cookie 随请求带过去即可 | 可删掉 getSession，少一次往返 |
| **RPC 内多步查询** | 依次：profiles 状态 → blocked_users → conversations 对称查 → 可能 INSERT 再 SELECT | 单次 RPC 内 3～4 次 DB 操作，若缺索引会变慢 |
| **无前端超时** | 若 Auth 或 DB 卡住，用户一直等，没有"超时提示/重试" | 体验差、易误以为失败而多次点击 |

### 1.3 已做/建议的修复

- **去掉 getSession()**：直接调 RPC，用 RPC 的"未认证"错误处理未登录，**减少一次网络往返**。
- **为 conversations 对称查询加索引**：`(conversation_type, participant1_id, participant2_id)`，保证"查已有会话"在 10 秒内完成。
- **前端 8 秒超时**：对 `getOrCreateConversation` 包一层 Promise.race(8s)，超时提示"打开聊天超时，请重试"，避免无限等待和重复点击。

---

## 二、Buy Now 慢的根因

### 2.1 数据流（当前，已修复）

```
用户点击 Buy Now
  → useProductDetailActions.buyNow()
      → fetch(..., { signal: AbortSignal 8s }) → /api/checkout/validate-product（单次请求内 auth + 查库）
      → addItem(product) + router.push('/checkout')
```

**已落实**：前端 8 秒超时；按钮态显示「正在跳转收银台…」；validate-product 保持单次请求完成校验。

### 2.2 根因归纳

| 根因 | 说明 | 影响 |
|------|------|------|
| **Serverless 冷启动** | Vercel 等无状态，首请求或久未访问会冷启动（1～5+ 秒） | 首击或低频用户最容易超 10 秒 |
| **服务端串行链** | createClient()（含 cookies）→ getUser() → 再查 products，全部串行 | 每步都等上一步，总延迟累加 |
| **无前端超时** | fetch 无 AbortSignal/超时，服务端卡住时用户一直等 | 易超 10 秒且无明确反馈 |
| **无"正在跳转"反馈** | 仅按钮变"..."，没有"正在跳转收银台"的明确提示 | 用户不知道是在等还是坏了，容易重复点击 |

### 2.3 已做/建议的修复

- **前端 8 秒超时**：`fetch(..., { signal: AbortSignal.timeout(8000) })`，超时提示"验证超时，请重试"，**保证 10 秒内必有结果（成功或明确失败）**。
- **明确加载文案**：Buy Now 点击后显示"正在跳转收银台..."等，减少重复点击。
- **服务端**：validate-product 保持"单次请求内完成 auth + 查库"，避免再加重链长；冷启动可通过 keep-warm 或后续边缘化缓解，但 10 秒内必达优先靠"超时 + 重试"和索引/单次 RPC 优化。

---

## 三、为何"原因最重要"

- **只加 loading/重试**：不解决 Auth 双重往返、RPC 多步与冷启动，仍会经常逼近或超过 10 秒。
- **先减往返、再加超时**：少一次 getSession、RPC 有索引、前端 8 秒超时，才能稳定满足"10 秒内要么进页要么明确失败"，避免用户长时间等待和反复重试，成交路径才可靠。

---

## 四、实施清单（已落实）

| 项 | 说明 | 状态 |
|----|------|------|
| useConversation | 去掉 getSession()，直接调 RPC；对 getOrCreateConversation 做 8 秒超时并友好提示。 | 已落实 |
| Buy Now | fetch validate-product 时加 8 秒超时；按钮态显示「正在跳转收银台…」。 | 已落实 |
| DB | conversations 表增加 (conversation_type, participant1_id, participant2_id) 索引，加速对称查询。 | 已落实（170） |
| ChatButton | 加载态显示「正在为你打开聊天…」；超时/错误时明确提示可重试。 | 已落实 |
| Add to Cart | 调用 validate-product 时加 8 秒超时，超时提示「验证超时，请重试」。 | 已落实 |

以上完成后，Message seller 与 Buy Now 均在 10 秒内要么成功跳转，要么明确超时/错误并提示重试，不再出现「一直转圈、用户反复点」的情况。
