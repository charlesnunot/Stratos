## 问题分析

**当前问题**：Checkout 页面的订单详情中商品价格没有正确处理多币种，硬编码了人民币符号 `¥`，没有进行汇率转换。

**具体表现**：
- 代码中直接使用 `¥{item.price.toFixed(2)}` 格式化价格
- 没有考虑用户的本地货币偏好
- 没有进行汇率转换
- 在英文环境下显示人民币符号不合适

## 解决方案

### 1. 导入必要的货币处理工具

在 `checkout/page.tsx` 文件中导入：
- `formatPriceWithConversion` 函数：处理价格格式化和汇率转换
- `detectCurrency` 函数：检测用户的本地货币
- `useLocale` 钩子：获取当前语言环境
- `Currency` 类型：类型定义

### 2. 检测用户的本地货币

使用 `useLocale` 和 `detectCurrency` 函数检测用户的本地货币：

```typescript
const locale = useLocale()
const userCurrency = useMemo(() => detectCurrency({ browserLocale: locale }), [locale])
```

### 3. 修改商品价格显示

**问题**：购物车项目可能没有包含货币信息

**解决方案**：
- 从产品详情中获取每个商品的货币信息
- 使用 `formatPriceWithConversion` 函数格式化每个商品的价格
- 确保订单总额也使用正确的货币格式

### 4. 修改订单详情显示逻辑

**当前代码**：
```typescript
<p className="text-sm text-muted-foreground">
  {t('quantity')}: {item.quantity} × ¥{item.price.toFixed(2)}
</p>
<p className="font-semibold">
  ¥{(item.price * item.quantity).toFixed(2)}
</p>
```

**修改后**：
```typescript
const priceDisplay = formatPriceWithConversion(item.price, item.currency || 'CNY', userCurrency)
<p className="text-sm text-muted-foreground">
  {t('quantity')}: {item.quantity} × {priceDisplay.main}
</p>
<p className="font-semibold">
  {formatPriceWithConversion(item.price * item.quantity, item.currency || 'CNY', userCurrency).main}
</p>
```

### 5. 修改订单总额显示

**当前代码**：
```typescript
<span className="text-xl font-bold">¥{totalAmount.toFixed(2)}</span>
```

**修改后**：
```typescript
const totalDisplay = formatPriceWithConversion(totalAmount, 'CNY', userCurrency)
<span className="text-xl font-bold">{totalDisplay.main}</span>
```

### 6. 确保购物车数据包含货币信息

**检查购物车存储**：
- 检查 `cartStore.ts` 中的购物车项目结构
- 如果缺少货币信息，需要从产品详情中获取

**修改购物车项目类型**：
- 确保每个购物车项目包含 `currency` 字段
- 在添加商品到购物车时保存货币信息

## 实施步骤

1. **修改 CheckoutPage 组件**：
   - 导入必要的函数和钩子
   - 检测用户货币
   - 修改价格显示逻辑

2. **检查购物车数据结构**：
   - 确保购物车项目包含货币信息
   - 如果不包含，需要从产品详情中获取

3. **测试多币种场景**：
   - 测试英文环境（USD）
   - 测试中文环境（CNY）
   - 测试其他语言环境

4. **确保订单创建时使用正确的货币**：
   - 检查订单创建 API 调用
   - 确保传递正确的货币信息

## 预期效果

- Checkout 页面会根据用户的语言环境显示正确的货币符号
- 商品价格会自动进行汇率转换
- 订单总额会使用与商品价格相同的货币格式
- 英文环境下显示 USD，中文环境下显示 CNY，其他语言环境显示相应的货币

## 技术要点

- 使用现有的货币处理工具函数
- 确保货币转换的准确性
- 保持代码的可维护性
- 确保与项目的国际化策略一致