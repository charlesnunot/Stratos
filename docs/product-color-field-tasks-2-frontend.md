# 商品颜色字段实施任务列表 - 第二部分：前端开发层

## 项目分析总结

### 当前状态
1. **前端层面**：
   - ✅ 商品编辑页面 (`src/app/[locale]/(main)/seller/products/[id]/edit/page.tsx`) 已实现 `color_options` 字段
   - ❌ 商品创建页面 (`src/app/[locale]/(main)/seller/products/create/page.tsx`) 缺少颜色字段
   - ❌ 商品详情页面未显示颜色选项
   - ❌ 购物车未处理颜色信息
   - ❌ 订单页面未显示颜色信息

---

## 具体执行任务列表

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

## 注意事项

1. **用户体验**：
   - 颜色选择应该是可选的，不应该强制用户选择
   - 如果商品只有一个颜色选项，可以考虑自动选择
   - 颜色选择器应该清晰易用，支持图片预览

2. **UI/UX 设计**：
   - 颜色选择器应该与现有设计风格一致
   - 颜色选项图片应该使用懒加载
   - 避免在商品列表页面加载所有颜色选项图片

3. **参考实现**：
   - 商品编辑页面已有颜色选项的实现，可以参考其代码结构
   - 确保新实现与编辑页面的功能保持一致

4. **响应式设计**：
   - 确保颜色选择器在移动端和桌面端都能正常显示
   - 颜色选项图片应该适配不同屏幕尺寸

---

## 预计工作量

- **商品创建页面**：2-3小时
- **商品详情页面**：3-4小时
- **购物车页面**：1-2小时
- **结算页面**：1-2小时
- **商品详情标签页**：1小时
- **国际化**：1小时
- **总计**：9-13小时

---

## 完成标准

- [ ] 商品创建页面可以添加颜色选项
- [ ] 商品详情页面显示颜色选择器
- [ ] 购物车显示颜色信息
- [ ] 结算页面显示颜色信息
- [ ] 所有页面支持中英文切换
- [ ] UI 响应式设计正常
- [ ] 无控制台错误
