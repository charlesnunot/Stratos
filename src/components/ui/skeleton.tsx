import { cn } from '@/lib/utils'
import { Card } from './card'

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  )
}

// 帖子卡片骨架屏
export function PostCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      {/* 图片骨架（如果帖子有图片） */}
      <Skeleton className="h-auto w-full aspect-video mb-0" />
      
      {/* 内容骨架 */}
      <div className="p-3 md:p-4">
        {/* 文本内容 */}
        <Skeleton className="h-4 w-full mb-1" />
        <Skeleton className="h-4 w-3/4 mb-3" />
        
        {/* 话题标签（可选） */}
        <div className="flex gap-2 mb-3">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        
        {/* 操作按钮 */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
    </Card>
  )
}

// 商品卡片骨架屏（与 ProductCard 网格布局一致）
export function ProductCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="h-auto w-full aspect-square mb-0" />
      <div className="p-3 md:p-4">
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-4/5 mb-3" />
        <Skeleton className="h-6 w-20 mb-2" />
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
    </Card>
  )
}

// 购物车单条骨架屏（与 ShoppingCart 单条 Card 布局一致）
export function CartItemSkeleton() {
  return (
    <Card className="p-3 md:p-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
        <div className="pt-1 sm:pt-0">
          <Skeleton className="h-4 w-4 rounded" />
        </div>
        <Skeleton className="h-16 w-16 rounded flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-4 w-full max-w-[180px]" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-4 w-6" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>
    </Card>
  )
}
