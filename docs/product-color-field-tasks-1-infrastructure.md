# 商品颜色字段实施任务列表 - 第一部分：基础设施层

## 项目分析总结

### 当前状态
1. **数据库层面**：
   - `products` 表在编辑页面中已有 `color_options` 字段（JSONB数组格式）
   - 但未找到对应的数据库迁移文件，需要确认数据库是否已有该字段
   - `order_items` 表没有颜色字段，无法记录订单中的颜色选择

2. **类型定义**：
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

## 注意事项

1. **向后兼容性**：
   - 确保现有没有颜色选项的商品仍能正常工作
   - 所有颜色字段应为可选（nullable）

2. **数据一致性**：
   - 确保颜色选项的格式与编辑页面中的格式一致
   - 颜色选项格式：`[{name: string, image_url: string | null, image_from_index: number | null}]`

3. **迁移文件命名**：
   - 使用时间戳格式：`YYYYMMDDHHMMSS_add_product_color_options.sql`
   - 确保迁移文件按顺序执行

---

## 预计工作量

- **数据库层**：2-4小时
- **类型定义层**：2-3小时
- **总计**：4-7小时

---

## 完成标准

- [ ] 数据库迁移文件已创建并测试
- [ ] 所有类型定义已更新
- [ ] TypeScript 编译无错误
- [ ] 数据库字段已成功添加
