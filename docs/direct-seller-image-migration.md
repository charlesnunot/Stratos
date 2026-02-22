# 直营卖家图片落库与迁移

## 概述

直营卖家在创建/编辑商品时可填写**外链图片 URL**（每行一个，最多 9 张）。提交时系统会：

1. 拉取这些外链图片
2. 上传到 Supabase Storage（`products` 桶，路径 `products/{seller_id}/...`）
3. 将商品 `images` 保存为 Supabase 的公开 URL

这样商品图片统一落在平台存储，便于后续 CDN、迁移与合规。

## 日常流程（无需迁移）

- **新建商品**：在「或填写图片链接」框中粘贴外链，提交后自动落库。
- **编辑商品**：同样在框中粘贴外链，保存后自动落库；已有 Supabase URL 的图片会保留，仅新增的外链会被抓取并替换为落库 URL。

无需人工迁移。

## 历史数据迁移（可选）

若直营卖家在**上线本能力之前**已创建商品，且 `products.images` 中仍为外链（非 Supabase URL），可通过管理员接口一次性迁移：

### 接口

- **POST** `/api/admin/migrate-direct-seller-images`
- **权限**：仅管理员（`profiles.role === 'admin'`）

### 行为

1. 查出所有 `profiles.seller_type === 'direct'` 的卖家及其商品。
2. 对每个商品：若 `images` 中存在非 Supabase 的 http(s) URL，则拉取并上传到 Storage，再更新该商品的 `images` 为落库后的 URL。
3. 返回 `{ migrated, failed, errors? }`。

### 调用示例

```bash
# 需携带管理员登录态 Cookie 或 Authorization
curl -X POST https://<your-domain>/api/admin/migrate-direct-seller-images
```

### 注意

- 仅处理**直营卖家**的商品；外链需可公网访问且为图片类型（jpeg/png/gif/webp），单张 ≤ 5MB。
- 迁移失败的商品会在 `errors` 中逐条列出，可据此排查后重试或手动在编辑页重新保存以触发落库。

## 相关实现

- 落库逻辑：`src/lib/products/upload-images-from-urls.ts`（`uploadImagesFromUrls`）
- 卖家端 API：`POST /api/seller/upload-images-from-urls`
- 管理员迁移 API：`POST /api/admin/migrate-direct-seller-images`
- 创建/编辑页在提交前调用卖家端 API，将外链与本地上传的图片合并为落库 URL 后再写入 `products.images`。
