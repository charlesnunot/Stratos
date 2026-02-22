## 问题根因

tip-center 页面闪烁的根因是 **加载状态的无限循环切换**：

1. SubscriptionContext 获取数据时 `isLoading: true`
2. useTipGuard 返回 `loading: true`，页面显示加载动画
3. SubscriptionContext 完成，`isLoading: false`
4. useTipGuard 返回 `loading: false`，页面检查权限
5. 但 usePaymentAccount 可能还在加载，导致 `allowed` 判断不稳定
6. 同时其他 effect 触发，导致 SubscriptionContext 重新加载
7. 回到步骤 1，形成无限循环

## 修复方案

### 方案 1：稳定加载状态（推荐）
修改 tip-center 页面，确保所有依赖都加载完成后再渲染：

```typescript
// 等待所有相关加载状态完成
if (authLoading || guardLoading || paymentAccountLoading) {
  return <Loading />
}
```

### 方案 2：移除 usePaymentAccount 的独立查询
将收款账户信息也整合到 SubscriptionContext 中，避免多个独立查询导致的状态不同步。

### 方案 3：添加防抖
在 useTipGuard 中添加防抖，避免快速切换 loading 状态。

## 建议实施方案

采用 **方案 1 + 方案 2** 的组合：
1. 先修改 tip-center 页面，添加 `paymentAccountLoading` 检查
2. 长期考虑将 `usePaymentAccount` 整合到 SubscriptionContext，减少查询次数

需要我实施修复吗？