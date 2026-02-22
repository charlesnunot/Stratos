# 商品图片轮播缩略图点击联动修复方案

## 问题描述

商品详情页的图片展示存在以下问题：
- 点击商品缩略图时，主图区域没有切换到对应的图片
- 主图始终显示第一张图片，无法通过缩略图切换
- 缺乏当前选中图片的视觉反馈

**问题页面**: `http://localhost:3000/en/product/72a0466d-d3a5-47fc-a420-b680ab8357fb`

---

## 🔍 根因分析

### 当前代码问题

**文件**: `src/app/[locale]/(main)/product/[id]/ProductPageClient.tsx`

**第352-377行代码**:
```tsx
{product.images && product.images.length > 0 ? (
  <>
    {/* 主图区域 - 始终显示第一张图片 */}
    <div className="relative aspect-square w-full overflow-hidden rounded-lg">
      <img
        src={product.images[0]}  // ❌ 硬编码显示第一张
        alt={displayName}
        className="h-full w-full object-cover max-w-full"
      />
    </div>
    
    {/* 缩略图区域 - 显示第2-5张图片 */}
    {product.images.length > 1 && (
      <div className="grid grid-cols-4 gap-2 w-full">
        {product.images.slice(1, 5).map((image: string, index: number) => (
          <div
            key={index}
            className="relative aspect-square overflow-hidden rounded-lg"
          >
            <img
              src={image}
              alt={`${displayName} ${index + 2}`}
              className="h-full w-full object-cover"
            />
          </div>
        ))}
      </div>
    )}
  </>
)}
```

### 问题总结

1. **❌ 主图硬编码**: `src={product.images[0]}` 始终显示第一张图片
2. **❌ 无点击事件**: 缩略图没有 `onClick` 处理函数
3. **❌ 无状态管理**: 没有跟踪当前显示图片的索引状态
4. **❌ 缩略图切片**: `slice(1, 5)` 跳过了第一张图，但用户可能想看到所有图片

---

## 📝 修复方案

### 完整修复：添加图片切换功能

#### 步骤1：添加当前图片索引状态

**文件**: `ProductPageClient.tsx`

**位置**: 在组件状态定义区域（其他 useState 附近，大约第61-69行）

**当前代码**:
```typescript
const [selectedColor, setSelectedColor] = useState<string | null>(null)
const [selectedColorImage, setSelectedColorImage] = useState<string | null>(null)
const [selectedSize, setSelectedSize] = useState<string | null>(null)
```

**添加新状态**:
```typescript
const [selectedColor, setSelectedColor] = useState<string | null>(null)
const [selectedColorImage, setSelectedColorImage] = useState<string | null>(null)
const [selectedSize, setSelectedSize] = useState<string | null>(null)
// ✅ 添加：当前显示图片的索引
const [currentImageIndex, setCurrentImageIndex] = useState(0)
```

---

#### 步骤2：修改主图显示逻辑

**位置**: 第354-360行

**当前代码**:
```tsx
<div className="relative aspect-square w-full overflow-hidden rounded-lg">
  <img
    src={product.images[0]}
    alt={displayName}
    className="h-full w-full object-cover max-w-full"
  />
</div>
```

**修改为**:
```tsx
<div className="relative aspect-square w-full overflow-hidden rounded-lg">
  <img
    src={product.images[currentImageIndex]}  // ✅ 使用当前索引
    alt={displayName}
    className="h-full w-full object-cover max-w-full cursor-pointer"
    onClick={() => {
      // ✅ 可选：点击主图可以切换到下一页
      if (product.images.length > 1) {
        setCurrentImageIndex((prev) => (prev + 1) % product.images.length)
      }
    }}
  />
</div>
```

---

#### 步骤3：修改缩略图显示和点击逻辑

**位置**: 第361-376行

**当前代码**:
```tsx
{product.images.length > 1 && (
  <div className="grid grid-cols-4 gap-2 w-full">
    {product.images.slice(1, 5).map((image: string, index: number) => (
      <div
        key={index}
        className="relative aspect-square overflow-hidden rounded-lg"
      >
        <img
          src={image}
          alt={`${displayName} ${index + 2}`}
          className="h-full w-full object-cover"
        />
      </div>
    ))}
  </div>
)}
```

**修改为**:
```tsx
{product.images.length > 1 && (
  <div className="grid grid-cols-4 gap-2 w-full">
    {product.images.map((image: string, index: number) => (
      <div
        key={index}
        onClick={() => setCurrentImageIndex(index)}  // ✅ 点击切换图片
        className={`
          relative aspect-square overflow-hidden rounded-lg cursor-pointer
          border-2 transition-all duration-200
          ${currentImageIndex === index 
            ? 'border-primary ring-2 ring-primary/20'  // ✅ 选中状态样式
            : 'border-transparent hover:border-gray-300'
          }
        `}
      >
        <img
          src={image}
          alt={`${displayName} ${index + 1}`}
          className="h-full w-full object-cover"
        />
        {/* ✅ 选中指示器 */}
        {currentImageIndex === index && (
          <div className="absolute inset-0 bg-primary/10 pointer-events-none" />
        )}
      </div>
    ))}
  </div>
)}
```

**关键修改说明**:
1. 移除 `slice(1, 5)` - 显示所有图片而不仅是第2-5张
2. 添加 `onClick` 事件 - 点击切换当前图片
3. 添加动态 `className` - 根据选中状态显示不同边框
4. 添加选中遮罩 - 视觉反馈当前选中项

---

#### 步骤4：处理颜色选项图片联动（可选增强）

如果选择了颜色选项，应该同步更新图片：

**位置**: 颜色选项的 onClick 处理函数（大约第448-458行）

**当前代码**:
```typescript
onClick={() => {
  setSelectedColor(colorOption.name);
  // Set color image if available
  if (colorOption.image_url) {
    setSelectedColorImage(colorOption.image_url);
  } else if (colorOption.image_from_index !== null && product.images && product.images[colorOption.image_from_index]) {
    setSelectedColorImage(product.images[colorOption.image_from_index]);
  } else {
    setSelectedColorImage(null);
  }
}}
```

**增强版本**:
```typescript
onClick={() => {
  setSelectedColor(colorOption.name);
  // Set color image if available
  if (colorOption.image_url) {
    setSelectedColorImage(colorOption.image_url);
  } else if (colorOption.image_from_index !== null && product.images && product.images[colorOption.image_from_index]) {
    setSelectedColorImage(product.images[colorOption.image_from_index]);
    // ✅ 同步更新图片索引
    setCurrentImageIndex(colorOption.image_from_index);
  } else {
    setSelectedColorImage(null);
  }
}}
```

---

## 📋 完整修复代码（整合版）

### 1. 状态定义区域

```typescript
const [selectedColor, setSelectedColor] = useState<string | null>(null)
const [selectedColorImage, setSelectedColorImage] = useState<string | null>(null)
const [selectedSize, setSelectedSize] = useState<string | null>(null)
const { user } = useAuth()
const supabase = createClient()
const t = useTranslations('seller')
const locale = useLocale()
// ✅ 添加图片索引状态
const [currentImageIndex, setCurrentImageIndex] = useState(0)
```

### 2. 图片展示区域

```tsx
{/* Product Images */}
<div className="space-y-4 w-full overflow-x-hidden">
  {/* 主图 - 显示当前选中的图片 */}
  <div className="relative aspect-square w-full overflow-hidden rounded-lg">
    <img
      src={
        selectedColorImage ||  // 优先显示选中的颜色图片
        (product.images && product.images[currentImageIndex]) ||  // 否则按索引显示
        ''
      }
      alt={displayName}
      className="h-full w-full object-cover max-w-full cursor-pointer"
      onClick={() => {
        // 点击主图切换到下一页
        if (product.images && product.images.length > 1 && !selectedColorImage) {
          setCurrentImageIndex((prev) => (prev + 1) % product.images.length)
        }
      }}
    />
  </div>
  
  {/* 缩略图 - 显示所有图片并可点击切换 */}
  {product.images && product.images.length > 1 && !selectedColorImage && (
    <div className="grid grid-cols-4 gap-2 w-full">
      {product.images.map((image: string, index: number) => (
        <div
          key={index}
          onClick={() => setCurrentImageIndex(index)}
          className={`
            relative aspect-square overflow-hidden rounded-lg cursor-pointer
            border-2 transition-all duration-200
            ${currentImageIndex === index 
              ? 'border-primary ring-2 ring-primary/20' 
              : 'border-transparent hover:border-gray-300'
            }
          `}
        >
          <img
            src={image}
            alt={`${displayName} ${index + 1}`}
            className="h-full w-full object-cover"
          />
          {currentImageIndex === index && (
            <div className="absolute inset-0 bg-primary/10 pointer-events-none" />
          )}
        </div>
      ))}
    </div>
  )}
</div>
```

---

## ✅ 修复效果

### 修复前
- 主图始终显示第一张
- 缩略图无法点击
- 无法切换图片
- 没有选中状态反馈

### 修复后
- ✅ 点击缩略图，主图实时切换
- ✅ 选中缩略图有高亮边框
- ✅ 点击主图可以循环浏览
- ✅ 颜色选项选择时同步切换图片
- ✅ 支持无限循环浏览

---

## 🎯 可选增强功能

### 1. 添加键盘导航

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!product.images || product.images.length <= 1) return
    
    if (e.key === 'ArrowLeft') {
      setCurrentImageIndex((prev) => 
        prev === 0 ? product.images.length - 1 : prev - 1
      )
    } else if (e.key === 'ArrowRight') {
      setCurrentImageIndex((prev) => 
        (prev + 1) % product.images.length
      )
    }
  }
  
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [product.images])
```

### 2. 添加触摸滑动支持（移动端）

使用 touch 事件监听左右滑动来切换图片。

### 3. 添加图片放大查看

点击主图可以打开 Lightbox 模态框查看大图。

---

## 📋 实施检查清单

- [ ] 步骤1: 添加 `currentImageIndex` useState
- [ ] 步骤2: 修改主图 `src` 使用 `product.images[currentImageIndex]`
- [ ] 步骤3: 修改缩略图添加 `onClick` 和选中样式
- [ ] 步骤4（可选）: 颜色选项联动更新图片索引
- [ ] 测试: 点击缩略图主图是否正确切换
- [ ] 测试: 选中缩略图是否有高亮边框
- [ ] 测试: 点击主图是否可以循环浏览
- [ ] 测试: 选择颜色选项是否同步切换图片

---

## 🔧 实施顺序建议

| 顺序 | 步骤 | 难度 | 时间 |
|------|------|------|------|
| 1 | 添加 useState | ⭐ | 1分钟 |
| 2 | 修改主图显示 | ⭐ | 2分钟 |
| 3 | 修改缩略图点击 | ⭐⭐ | 5分钟 |
| 4 | 颜色选项联动（可选） | ⭐⭐ | 3分钟 |
| **总计** | | | **11分钟** |

---

## ⚠️ 注意事项

1. **颜色图片优先**: 当选择了颜色选项并设置了 `selectedColorImage` 时，应该优先显示颜色图片，隐藏缩略图导航

2. **空状态处理**: 确保 `product.images` 存在且不为空

3. **性能优化**: 使用 `useMemo` 缓存图片列表计算（如果图片很多）

4. **可访问性**: 为缩略图添加 `aria-label` 和 `role="button"`

```tsx
<div
  role="button"
  aria-label={`查看图片 ${index + 1}`}
  tabIndex={0}
  onClick={() => setCurrentImageIndex(index)}
  onKeyDown={(e) => e.key === 'Enter' && setCurrentImageIndex(index)}
>
```

---

*文档创建时间*: 2026-02-08
*适用版本*: Stratos v0.1.1
*预计修复时间*: 11分钟
*状态*: 待实施
