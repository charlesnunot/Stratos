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
