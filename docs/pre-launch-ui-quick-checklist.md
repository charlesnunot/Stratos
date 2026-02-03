# Stratos 上线前 UI 快速检查清单（20 分钟版）

**目标**：确保 UI 不误导、不阻塞、不掩盖系统状态  
**核心原则**：只关注核心链路 / 权限 / 异常状态

---

## 一、核心交互按钮检查

| 功能 | 检查点 |
|------|--------|
| **Message seller** | ✅ loading / disabled 防重复点击 |
| | ✅ 权限不足时隐藏或禁用 |
| | ✅ 点击失败有错误提示 |
| **Buy Now** | ✅ loading / 禁止重复点击 |
| | ✅ 支付中状态清晰 |
| | ✅ 失败回退提示 |
| **Send message** | ✅ loading / 防重复 |
| | ✅ 权限不足 / 被拉黑提示 |
| | ✅ 消息发送失败提示 |
| **Subscribe / Cancel** | ✅ 权益生效提示 |
| | ✅ 取消后状态刷新 |
| | ✅ 异常回退 |
| **Publish / Delete Post** | ✅ 权限校验正确 |
| | ✅ 删除后界面刷新 |
| | ✅ 幂等操作 |

---

## 二、权限相关 UI 检查

### 被拉黑用户

- [x] **Message seller** 按钮隐藏或禁用（帖子/商品/个人页按 canChat/canMessageSeller 显隐；本次已修）
- [x] 发消息功能不可用（或明确提示「无法发送」）（API 403 + handleError 展示）

### 非卖家用户

- [x] 编辑 / 下架 / 删除商品按钮隐藏（Sidebar 仅 isSeller 展示卖家入口；卖家页 useSellerGuard 重定向）

### 未订阅用户

- [x] 订阅专属功能按钮提示订阅，不报错（卖家中心入口仅有效订阅时显示；直链 useSellerGuard 重定向）

**核心原则**：UI 不提供假希望

---

## 三、异常 / 边界状态检查

| 场景 | 要求 |
|------|------|
| 网络失败 / 请求超时 | 不白屏、不无限 loading、有兜底文案或提示 |
| API 返回错误 / 权限异常 | 不白屏、不无限 loading、有兜底文案或提示 |
| 会话不存在或已删除 | 不白屏、不无限 loading、有兜底文案或提示 |
| 商品已下架 / 库存不足 | 不白屏、不无限 loading、有兜底文案或提示 |
| 页面刷新或关闭 | 不白屏、不无限 loading、有兜底文案或提示 |

---

## 四、状态变化可视化检查

| 场景 | 要求 |
|------|------|
| 未读数变化 | 及时反映（允许延迟 1～2 秒，不能与实际状态明显不符） |
| 订阅生效后 | UI 更新（如卖家中心入口、权益展示） |
| 支付完成后 | 状态刷新（订单页、订阅管理页） |
| 登录 / 登出 | UI 刷新（导航、权限相关按钮） |

---

## 五、跳转 / 流程完整性

| 流程 | 要求 |
|------|------|
| Message seller → 聊天页 | 跳转一定发生；失败有 fallback；不出现「点击没反应」 |
| Buy Now → 订单 / 支付页 | 跳转一定发生；失败有 fallback；不出现「点击没反应」 |
| 支付完成 → 回站 | 跳转一定发生；失败有 fallback；不出现「点击没反应」 |

---

## 六、上线 Gate UI 标准（红线）

- [x] **所有核心动作**有 loading + 错误反馈
- [x] **权限相关按钮**不误导用户（无权限则隐藏/禁用或明确提示）
- [x] **任意异常**不会白屏或卡死（EmptyState / handleError / toast）
- [x] **核心跳转**不中断主流程（失败有 fallback，不“点击没反应”）

**满足以上即认为 UI 过关。**

---

## 与推演清单的衔接

- 意图级推演见 [pre-launch-intent-runthrough-checklist.md](pre-launch-intent-runthrough-checklist.md)
- 推演结果与代码验证见 [pre-launch-runthrough-results.md](pre-launch-runthrough-results.md)
- 本清单侧重 **UI 表现**（按钮状态、提示、跳转、异常兜底），可与推演结果表配合使用：推演通过 + 本清单打勾 = 上线前 UI 达标。

---

## 执行结果（代码验证 + 修复）

**执行日期**：按本次推演记录。

### 一、核心交互按钮

| 功能 | 代码验证 | 备注 |
|------|----------|------|
| Message seller | ✅ | ChatButton：disabled={loading}、toast 错误；商品详情 useProductDetailActions：messageSellerLoading + disabled + loading 文案（本次新增）；帖子/个人页按 canChat/canMessageSeller 显隐 |
| Buy Now | ✅ | disabled={actions.buying \|\| !capabilities.canBuy}，失败 showError；结账页 disabled={loading} |
| Send message | ✅ | ChatWindow disabled={loading}，handleError(data?.error)；handleSend 开头 if (loading) return |
| Subscribe / Cancel | ✅ | 订阅页走 create-pending/create-payment，失败有 API 错误；useSellerGuard 查订阅后重定向 |
| Publish / Delete Post | ✅ | useAuthGuard；删除后 invalidateQueries；点赞/关注 23505 忽略 |

### 二、权限相关 UI

| 检查项 | 代码验证 | 修复 |
|--------|----------|------|
| 被拉黑：Message seller 隐藏或禁用 | ✅ | **已修复**：帖子详情页增加 capabilities.canChat（含 !isBlockedByAuthor），仅 canChat 时渲染 ChatButton；商品详情 capabilities.canMessageSeller 为 false 时不渲染咨询卖家按钮；个人页 canChat 控制 |
| 被拉黑：发消息不可用/提示 | ✅ | /api/messages 返回 403 + message，ChatWindow handleError 展示 |
| 非卖家：编辑/下架/删除隐藏 | ✅ | Sidebar 仅 isSeller 时展示卖家中心/商品/订单入口；卖家页 useSellerGuard 非卖家重定向 |
| 未订阅：专属功能提示不报错 | ✅ | 卖家中心入口仅在有有效 seller 订阅时显示；直链访问由 useSellerGuard 重定向 |

### 三、异常 / 边界状态

| 场景 | 代码验证 |
|------|----------|
| 网络/超时/API 错误/权限异常 | handleError、toast、EmptyState（post 详情 unavailable、edit 无权限）；criticalFetch 超时提示 |
| 会话不存在/商品下架/库存不足 | 帖子/编辑 EmptyState；商品详情仅 status=active 展示否则 notFound；Buy Now 前 validate-product，失败 showError |
| 页面刷新/关闭 | 支付依赖 Webhook 幂等；未提交可重试 |

### 四、状态变化与跳转

| 场景 | 代码验证 |
|------|----------|
| 未读数/订阅生效/支付完成/登录登出 | ChatWindow mark read 后 invalidate；useSellerGuard 查 subscriptions；支付完成回站由 Stripe 跳转；AuthProvider onAuthStateChange 刷新 |
| Message seller → 聊天页 / Buy Now → 结账 / 支付完成 → 回站 | openChat navigate；buyNow router.push('/checkout')；Stripe return_url |

### 五、上线 Gate 红线

- **所有核心动作有 loading + 错误反馈**：✅ 已覆盖（含本次商品详情咨询卖家 loading）
- **权限相关按钮不误导**：✅ 被拉黑/非卖家/未订阅均隐藏或重定向
- **任意异常不白屏不卡死**：✅ EmptyState、handleError、toast
- **核心跳转不中断**：✅ 失败有 toast/fallback，不“点击没反应”

**本次修改文件**：`src/lib/post-detail/types.ts`（canChat）、`src/lib/hooks/usePostPage.ts`（canChat）、`src/app/[locale]/(main)/post/[id]/page.tsx`（ChatButton 按 canChat 显隐）、`src/lib/product-card/useProductDetailActions.ts`（messageSellerLoading）、`src/components/ecommerce/product-detail/ProductDetailView.tsx`（咨询卖家 disabled + loading 文案）。
