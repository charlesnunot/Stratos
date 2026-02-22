# 商品颜色字段实施任务列表

## 项目分析总结

### 当前状态
1. **数据库层面**：
   - `products` 表在编辑页面中已有 `color_options` 字段（JSONB数组格式）
   - 但未找到对应的数据库迁移文件，需要确认数据库是否已有该字段
   - `order_items` 表没有颜色字段，无法记录订单中的颜色选择

2. **前端层面**：
   - ✅ 商品编辑页面 (`src/app/[locale]/(main)/seller/products/[id]/edit/page.tsx`) 已实现 `color_options` 字段
   - ❌ 商品创建页面 (`src/app/[locale]/(main)/seller/products/create/page.tsx`) 缺少颜色字段
   - ❌ 商品详情页面未显示颜色选项
   - ❌ 购物车未处理颜色信息
   - ❌ 订单页面未显示颜色信息

3. **类型定义**：
   - ❌ `src/types/database.ts` 中 products 类型缺少 color_options
   - ❌ `src/lib/types/api.ts` 中 Product 接口缺少 color_options
   - ❌ `src/lib/hooks/useProducts.ts` 中 Product 接口缺少 color_options
   - ❌ `src/store/cartStore.ts` 中 CartItem 接口缺少 color 字段

---

## 具体执行任务列表

### 阶段一：数据库层（Database Layer）

#### 任务 1.1：确认并创建 color_options 字段迁移
**文件**: `supabase/migrations/XXX_add_product_color_options.sql`
- [ ] 检查 products 表是否已有 color_options 字段
- [ ] 如果没有，创建迁移文件添加字段：
  ```sql
  ALTER TABLE products 
  ADD COLUMN IF NOT EXISTS color_options JSONB DEFAULT '[]';
  
  COMMENT ON COLUMN products.color_options IS '商品颜色选项，格式：[{name: string, image_url: string | null, image_from_index: number | null}]';
  ```

#### 任务 1.2：为 order_items 表添加颜色字段
**文件**: `supabase/migrations/XXX_add_order_item_color.sql`
- [ ] 创建迁移文件为 order_items 表添加颜色字段：
  ```sql
  ALTER TABLE order_items 
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS size TEXT;
  
  COMMENT ON COLUMN order_items.color IS '订单项选择的颜色';
  COMMENT ON COLUMN order_items.size IS '订单项选择的尺寸';
  ```

---

### 阶段二：类型定义层（Type Definitions）

#### 任务 2.1：更新数据库类型定义
**文件**: `src/types/database.ts`
- [ ] 在 `products.Row` 接口中添加：
  ```typescript
  color_options?: Json | null
  ```
- [ ] 在 `products.Insert` 接口中添加：
  ```typescript
  color_options?: Json | null
  ```
- [ ] 在 `products.Update` 接口中添加：
  ```typescript
  color_options?: Json | null
  ```

#### 任务 2.2：更新 order_items 类型定义
**文件**: `src/types/database.ts`
- [ ] 在 `order_items.Row` 接口中添加：
  ```typescript
  color?: string | null
  size?: string | null
  ```
- [ ] 在 `order_items.Insert` 接口中添加：
  ```typescript
  color?: string | null
  size?: string | null
  ```
- [ ] 在 `order_items.Update` 接口中添加：
  ```typescript
  color?: string | null
  size?: string | null
  ```

#### 任务 2.3：更新 API 类型定义
**文件**: `src/lib/types/api.ts`
- [ ] 在 `Product` 接口中添加：
  ```typescript
  color_options?: Array<{ name: string; image_url: string | null; image_from_index: number | null }> | null
  ```

#### 任务 2.4：更新 hooks 中的 Product 接口
**文件**: `src/lib/hooks/useProducts.ts`
- [ ] 在 `Product` 接口中添加：
  ```typescript
  color_options?: Array<{ name: string; image_url: string | null; image_from_index: number | null }> | null
  ```

#### 任务 2.5：更新购物车类型定义
**文件**: `src/store/cartStore.ts`
- [ ] 在 `CartItem` 接口中添加：
  ```typescript
  color?: string | null
  size?: string | null
  ```

---

### 阶段三：商品创建页面（Product Creation）

#### 任务 3.1：添加颜色选项表单字段
**文件**: `src/app/[locale]/(main)/seller/products/create/page.tsx`
- [ ] 在 `formData` state 中添加：
  ```typescript
  color_options: [] as Array<{ name: string; image_url: string | null; image_from_index: number | null }>
  ```
- [ ] 添加颜色选项的 UI 组件（参考编辑页面的实现）
- [ ] 在 `handleSubmit` 函数中添加 `color_options` 到 `productData`
- [ ] 添加颜色选项的验证逻辑（可选）

---

### 阶段四：商品详情页面（Product Detail Page）

#### 任务 4.1：显示颜色选择器
**文件**: `src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx`
- [ ] 添加颜色选择状态管理
- [ ] 创建颜色选择器 UI 组件
- [ ] 显示商品的颜色选项（如果有）
- [ ] 处理颜色选择变化
- [ ] 根据选择的颜色更新商品图片显示（如果有对应图片）

#### 任务 4.2：更新加入购物车逻辑
**文件**: `src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx`
- [ ] 在 `handleAddToCart` 函数中添加颜色信息：
  ```typescript
  addItem({
    product_id: product.id,
    quantity: 1,
    price: currentProduct.price,
    name: product.name,
    image: product.images?.[0] || '',
    color: selectedColor, // 新增
  })
  ```

#### 任务 4.3：更新立即购买逻辑
**文件**: `src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx`
- [ ] 在 `handleBuyNow` 函数中传递颜色信息到结算页面

---

### 阶段五：购物车页面（Shopping Cart）

#### 任务 5.1：显示商品颜色信息
**文件**: `src/components/ecommerce/ShoppingCart.tsx`
- [ ] 在购物车商品列表中显示颜色信息
- [ ] 如果商品有颜色选项，允许在购物车中修改颜色（可选）

#### 任务 5.2：更新购物车验证逻辑
**文件**: `src/store/cartStore.ts`
- [ ] 确保颜色信息在验证过程中被保留

---

### 阶段六：结算页面（Checkout Page）

#### 任务 6.1：显示和确认颜色信息
**文件**: `src/app/[locale]/(main)/checkout/page.tsx`
- [ ] 在订单确认区域显示每个商品的颜色信息
- [ ] 允许在结算页面修改颜色（可选）

---

### 阶段七：订单创建 API（Order Creation API）

#### 任务 7.1：处理颜色信息
**文件**: `src/app/api/orders/create/route.ts`
- [ ] 在订单项验证中添加颜色字段检查
- [ ] 在创建 `order_items` 时保存颜色信息：
  ```typescript
  {
    order_id: order.id,
    product_id: item.product_id,
    quantity: item.quantity,
    price: item.price,
    color: item.color || null, // 新增
    size: item.size || null,   // 新增（如果支持尺寸）
  }
  ```

---

### 阶段八：订单详情页面（Order Detail Page）

#### 任务 8.1：显示订单中的颜色信息
**文件**: `src/app/[locale]/(main)/orders/[id]/page.tsx`
- [ ] 在订单商品列表中显示颜色信息
- [ ] 确保颜色信息正确从 order_items 中读取

#### 任务 8.2：更新订单类型定义
**文件**: `src/lib/types/api.ts`
- [ ] 在 `Order` 接口中添加订单项信息（如果还没有）：
  ```typescript
  items?: Array<{
    product_id: string
    quantity: number
    price: number
    color?: string | null
    size?: string | null
  }>
  ```

---

### 阶段九：卖家订单管理（Seller Order Management）

#### 任务 9.1：显示订单中的颜色信息
**文件**: `src/app/[locale]/(main)/seller/orders/page.tsx`
- [ ] 在卖家订单列表中显示颜色信息
- [ ] 确保颜色信息在订单详情中可见

---

### 阶段十：商品详情标签页（Product Details Tabs）

#### 任务 10.1：在详情页显示颜色选项
**文件**: `src/components/ecommerce/ProductDetailsTabs.tsx`
- [ ] 添加颜色选项显示（如果需要在详情标签页中显示）
- [ ] 或者确保颜色选择器在商品主页面中可见

---

### 阶段十一：国际化（i18n）

#### 任务 11.1：添加翻译文本
**文件**: `src/messages/zh.json` 和 `src/messages/en.json`
- [ ] 添加颜色相关翻译：
  ```json
  {
    "color": "颜色",
    "selectColor": "选择颜色",
    "colorOptions": "颜色选项",
    "noColorSelected": "未选择颜色"
  }
  ```

---

### 阶段十二：测试和验证

#### 任务 12.1：功能测试
- [ ] 测试商品创建时添加颜色选项
- [ ] 测试商品编辑时修改颜色选项
- [ ] 测试商品详情页显示颜色选择器
- [ ] 测试加入购物车时保存颜色信息
- [ ] 测试订单创建时保存颜色信息
- [ ] 测试订单详情页显示颜色信息
- [ ] 测试卖家订单管理页面显示颜色信息

#### 任务 12.2：边界情况测试
- [ ] 测试没有颜色选项的商品
- [ ] 测试颜色选项为空数组的情况
- [ ] 测试颜色图片URL无效的情况
- [ ] 测试订单中颜色信息缺失的兼容性

---

## 实施优先级建议

### 高优先级（核心功能）
1. 阶段一：数据库层
2. 阶段二：类型定义层
3. 阶段三：商品创建页面
4. 阶段四：商品详情页面
5. 阶段七：订单创建 API

### 中优先级（用户体验）
6. 阶段五：购物车页面
7. 阶段六：结算页面
8. 阶段八：订单详情页面
9. 阶段九：卖家订单管理

### 低优先级（优化）
10. 阶段十：商品详情标签页
11. 阶段十一：国际化
12. 阶段十二：测试和验证

---

## 注意事项

1. **向后兼容性**：
   - 确保现有没有颜色选项的商品仍能正常工作
   - 订单中的颜色字段应为可选（nullable）

2. **数据一致性**：
   - 确保颜色选项的格式与编辑页面中的格式一致
   - 颜色名称应该与商品详情中显示的一致

3. **用户体验**：
   - 颜色选择应该是可选的，不应该强制用户选择
   - 如果商品只有一个颜色选项，可以考虑自动选择

4. **性能考虑**：
   - 颜色选项图片应该使用懒加载
   - 避免在商品列表页面加载所有颜色选项图片

---

## 预计工作量

- **数据库层**：2-4小时
- **类型定义层**：2-3小时
- **前端页面开发**：8-12小时
- **API开发**：2-3小时
- **测试和调试**：4-6小时
- **总计**：18-28小时
