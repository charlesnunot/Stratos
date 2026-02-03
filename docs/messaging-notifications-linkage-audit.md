# 推演任务 9 — 消息与通知链路审计报告

**任务名称**: Messaging & Notifications Linkage Test  
**审计日期**: 2026-01-31  
**审计状态**: ✅ 通过（已修复所有问题）

---

## 一、验证结果摘要

| 验证点 | 状态 | 说明 |
|--------|------|------|
| 私聊/群聊消息 | ✅ | RLS 限制正确，消息写入正确 |
| 群组操作 | ✅ | 权限校验 + 通知完整 |
| 系统通知 | ✅ | 关键事件均触发通知 |
| Cron 通知 | ✅ | 订阅/保证金/佣金/纠纷事件触发通知 |

---

## 二、发现并修复的问题

### 1. 群组通知硬编码中文 ✅ 已修复
**文件**: `src/app/api/groups/create/route.ts`, `src/app/api/groups/[id]/members/route.ts`

**问题**: 
- "加入群组" 通知硬编码中文
- related_type 错误 (应为 'conversation')
- link 错误 (应为 `/messages/${id}` 进入群聊)

**修复**:
- 将通知改为英文 + content_key + content_params
- related_type 改为 'conversation'
- link 改为 `/messages/${group.id}`

### 2. 群组移除成员缺少通知 ✅ 已修复
**文件**: `src/app/api/groups/[id]/members/route.ts`

**问题**: 
- 用户被踢出群组时未收到通知

**修复**:
- 添加 `group_member_removed` 通知给被移除成员

### 3. 订单创建通知硬编码中文 ✅ 已修复
**文件**: `src/app/api/orders/create/route.ts`

**问题**: 
- "新订单待支付" 通知硬编码中文
- content_key 错误 (order_paid 应为 order_pending_payment)

**修复**:
- 将通知改为英文
- content_key 改为 `order_pending_payment`
- 添加 content_params

### 4. Admin 相关通知硬编码中文 ✅ 已修复
**文件**: 
- `src/app/api/admin/payment-accounts/[id]/verify/route.ts`
- `src/app/api/admin/disputes/route.ts`
- `src/app/api/admin/violation-penalties/deduct/route.ts`

**修复**:
- 支付账户验证/拒绝通知国际化
- 纠纷解决通知国际化
- 违规扣款通知国际化
- 违规扣款响应消息 "违规扣款已成功扣除" → 英文

### 5. 消息组件硬编码中文 ✅ 已修复
**文件**: 
- `src/components/chat/ChatWindow.tsx`
- `src/components/chat/CreateConversation.tsx`
- `src/components/chat/CreateGroup.tsx`
- `src/components/social/ChatButton.tsx`

**修复**:
- 使用 t() / tCommon() 替代硬编码
- 新增 sendFailed, createGroupFailed, chatFailed 等翻译键
- common 新增 notice 键

---

## 三、链路追踪

### 1. 私聊消息流程
```
用户访问 /messages/[conversationId]
  → ChatWindow 组件
  → 发送消息: supabase.from('messages').insert(...)
  → RLS: 校验 sender_id = auth.uid() 且用户属于会话
  → Realtime 订阅: 对方收到新消息推送
```

### 2. 群聊消息流程
```
群聊使用同一 messages 表
  → conversation_type = 'group'
  → group_members 校验成员资格
  → RLS: 群成员可查看和发送消息
```

### 3. 群组操作流程
```
POST /api/groups/create
  → 创建 conversations (type: group)
  → 创建 group_members (owner + 其他成员)
  → 通知新成员 (content_key: group_invite)
  → logAudit('group_create')

POST /api/groups/[id]/members
  → 校验 owner/admin 权限
  → 添加成员到 group_members
  → 通知新成员 (content_key: group_joined)
  → logAudit('group_add_member')

DELETE /api/groups/[id]/members
  → 校验 owner/admin 或本人退群
  → 删除成员
  → 通知被移除成员 (content_key: group_member_removed)
  → logAudit('group_remove_member')
```

### 4. 系统通知触发点
| 事件 | 触发位置 | content_key | 接收者 |
|------|----------|-------------|--------|
| 订单创建 | orders/create | order_pending_payment | 卖家 |
| 订单支付 | process-order-payment | order_paid, seller_new_order | 买家、卖家、affiliate |
| 订单发货 | orders/[id]/ship | order_shipped | 买家 |
| 纠纷解决 | admin/disputes | dispute_resolved | 买家、卖家 |
| 佣金结算 | admin/commissions/settle | commission_settled | affiliate |
| 打赏 | process-tip-payment | tip_received | 被打赏用户 |
| 用户打赏 | process-user-tip-payment | user_tip_received | 被打赏用户 |
| 保证金退款 | process-deposit-refund | deposit_refund_completed | 卖家 |
| 群组加入 | groups/create, members | group_invite, group_joined | 新成员 |
| 群组移除 | groups/members DELETE | group_member_removed | 被移除成员 |
| 支付账户验证 | admin/payment-accounts/verify | payment_account_verified/rejected | 卖家 |
| 违规扣款 | admin/violation-penalties/deduct | violation_penalty | 卖家 |
| 佣金惩罚 | penalty-manager | commission_penalty_applied | 卖家 |
| 惩罚解除 | resolve-penalty | commission_penalty_resolved | 卖家 |

### 5. Cron 触发通知
| Cron 任务 | 通知触发 |
|-----------|----------|
| subscription-lifecycle | 同步 profile，无直接通知 |
| subscription-expiry-reminders | 数据库函数发送到期提醒 |
| check-subscription-downgrade | subscription_tier_exceeded |
| update-deposit-lots-status | 状态更新，无直接通知 |
| check-overdue-commissions | commission_penalty_applied |
| deduct-overdue-commissions | commission_penalty_resolved |

---

## 四、权限校验验证

### 群组操作
| 操作 | 权限要求 | 状态 |
|------|----------|------|
| 添加成员 | owner 或 admin | ✅ |
| 移除成员 | owner 或 admin 或本人退群 | ✅ |
| 不能移除群主 | targetMember.role !== 'owner' | ✅ |

### 消息发送
| 检查项 | RLS 策略 | 状态 |
|--------|----------|------|
| 私聊 | participant1_id 或 participant2_id = auth.uid() | ✅ |
| 群聊 | group_members 中存在 | ✅ |

---

## 五、修改文件清单

1. `src/app/api/groups/create/route.ts` - 国际化通知、related_type、link
2. `src/app/api/groups/[id]/members/route.ts` - 国际化通知、related_type、link、移除成员通知
3. `src/app/api/orders/create/route.ts` - 国际化通知、content_key
4. `src/app/api/admin/payment-accounts/[id]/verify/route.ts` - 国际化通知
5. `src/app/api/admin/disputes/route.ts` - 国际化通知
6. `src/app/api/admin/violation-penalties/deduct/route.ts` - 国际化通知、content_params
7. `src/components/chat/ChatWindow.tsx` - 国际化消息
8. `src/components/chat/CreateConversation.tsx` - 国际化消息
9. `src/components/chat/CreateGroup.tsx` - 国际化消息
10. `src/components/social/ChatButton.tsx` - 国际化消息
11. `src/messages/zh.json` - 新增翻译键
12. `src/messages/en.json` - 新增翻译键
13. `docs/messaging-notifications-linkage-audit.md` - 审计报告

---

## 六、结论

消息与通知链路审计完成，所有验证点均通过：

1. **私聊/群聊消息** - RLS 限制正确，消息写入数据库正确
2. **群组操作** - 权限校验正确，通知触发完整，被移除成员收到通知
3. **系统通知** - 所有关键事件均触发通知，content_key 与 content_params 正确
4. **Cron 通知** - 订阅/保证金/佣金/纠纷事件触发通知
5. **国际化** - 所有硬编码中文已替换

链路完整，消息与通知端到端可追溯，无安全漏洞。
