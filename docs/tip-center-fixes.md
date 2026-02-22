# 打赏中心页面修复方案

## 概述

本文档详细描述了打赏中心页面的优化修复方案，包括代码重构、功能完善和用户体验改进。

## 问题清单

1. **未使用新建的 Hooks** - 页面内直接使用了 `useQuery`，而不是已创建的 `useTipStats` 和 `useTipRecords`
2. **硬编码增长率** - 第4个统计卡片显示固定的 `+12.5%`，不是真实数据
3. **设置区域未实现** - 设置按钮只是占位，没有实际功能
4. **货币符号硬编码** - 所有金额都使用 `$`，没有根据 locale 切换为 `¥`

---

## 方案 1：使用新建的 Hooks（P0 - 10分钟）

### 目标
重构代码，使用已创建的 `useTipStats` 和 `useTipRecords` Hooks，保持代码一致性和可维护性。

### 实施步骤

#### 1. 修改导入

文件：`src/app/[locale]/(main)/tip-center/page.tsx`

```typescript
// 在现有导入后添加
import { useTipStats } from '@/lib/hooks/useTipStats'
import { useTipRecords } from '@/lib/hooks/useTipRecords'
```

#### 2. 替换数据获取逻辑

**删除（第26-83行）：**
```typescript
// 获取打赏统计数据
const { data: tipStats } = useQuery({
  queryKey: ['tipStats', user?.id],
  queryFn: async () => {
    // ... 查询逻辑
  },
  enabled: !!user,
})

// 获取打赏记录
const { data: tipRecords } = useQuery({
  queryKey: ['tipRecords', user?.id],
  queryFn: async () => {
    // ... 查询逻辑
  },
  enabled: !!user,
})
```

**替换为（第26-27行）：**
```typescript
// 使用新建的 Hooks
const { data: tipStats } = useTipStats(user?.id)
const { data: tipRecords } = useTipRecords(user?.id)
```

### 验证
- [ ] 页面正常加载
- [ ] 统计数据正确显示
- [ ] 记录列表正确显示

---

## 方案 2：修复硬编码增长率（P1 - 15分钟）

### 目标
移除硬编码的 `+12.5%` 增长率，改为显示真实数据或移除该卡片。

### 选项 A：实现真实的环比增长率（推荐）

#### 1. 修改 useTipStats Hook

文件：`src/lib/hooks/useTipStats.ts`

**在 return 语句前添加增长率计算：**

```typescript
export function useTipStats(userId?: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['tipStats', userId],
    queryFn: async () => {
      if (!userId) return null

      const now = new Date()
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)

      // ... 现有的收到和发出打赏查询 ...

      // 本月收到的打赏
      const { data: receivedThisMonth } = await supabase
        .from('tips')
        .select('amount')
        .eq('recipient_id', userId)
        .eq('payment_status', 'completed')
        .gte('created_at', thisMonth.toISOString())

      // 上月收到的打赏
      const { data: receivedLastMonth } = await supabase
        .from('tips')
        .select('amount')
        .eq('recipient_id', userId)
        .eq('payment_status', 'completed')
        .gte('created_at', lastMonth.toISOString())
        .lt('created_at', thisMonth.toISOString())

      const thisMonthTotal = receivedThisMonth?.reduce((sum, tip) => sum + parseFloat(tip.amount), 0) || 0
      const lastMonthTotal = receivedLastMonth?.reduce((sum, tip) => sum + parseFloat(tip.amount), 0) || 0
      
      // 计算增长率
      let growthRate = 0
      if (lastMonthTotal > 0) {
        growthRate = ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100
      }

      return {
        receivedTotal: receivedTips?.reduce((sum, tip) => sum + parseFloat(tip.amount), 0) || 0,
        givenTotal: givenTips?.reduce((sum, tip) => sum + parseFloat(tip.amount), 0) || 0,
        receivedCount: receivedTips?.length || 0,
        givenCount: givenTips?.length || 0,
        growthRate: parseFloat(growthRate.toFixed(1)), // 新增
        thisMonthTotal,
        lastMonthTotal,
      }
    },
    enabled: !!userId,
    refetchInterval: 60000,
  })
}
```

#### 2. 修改页面显示

文件：`src/app/[locale]/(main)/tip-center/page.tsx`

**第152行修改为：**

```typescript
<p className="text-2xl font-bold">
  {tipStats?.growthRate > 0 ? '+' : ''}{tipStats?.growthRate || 0}%
</p>
```

### 选项 B：移除增长率卡片（简单方案）

如果不想实现增长率功能，可以直接删除该卡片。

#### 1. 删除卡片代码

**删除第148-161行：**

```typescript
// 删除整个 Growth 卡片
<Card className="p-6">
  <div className="flex items-center justify-between">
    <div>
      <p className="text-sm text-muted-foreground">{t('growth')}</p>
      <p className="text-2xl font-bold">+12.5%</p>
    </div>
    <div className="p-2 rounded-full bg-green-100">
      <TrendingUp className="h-6 w-6 text-green-600" />
    </div>
  </div>
  <p className="text-xs text-muted-foreground mt-2">
    {t('vsLastMonth')}
  </p>
</Card>
```

#### 2. 修改网格布局

**第96行修改为：**

```typescript
<div className="grid gap-4 md:grid-cols-3">
```

### 验证
- [ ] 增长率显示正确（选项A）或卡片已移除（选项B）
- [ ] 页面布局正常

---

## 方案 3：实现设置区域功能（P2 - 2小时）

### 目标
让设置区域的按钮真正可用，实现开启/关闭打赏和设置感谢语功能。

### 实施步骤

#### 1. 创建 API 端点

**新建文件：** `src/app/api/tip/settings/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 获取设置
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tip_enabled, tip_thank_you_message')
      .eq('id', user.id)
      .single()

    return NextResponse.json({
      enabled: profile?.tip_enabled ?? false,
      thankYouMessage: profile?.tip_thank_you_message || '',
    })
  } catch (error) {
    console.error('Error fetching tip settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// 更新设置
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { enabled, thankYouMessage } = body

    const { error } = await supabase
      .from('profiles')
      .update({
        tip_enabled: enabled,
        tip_thank_you_message: thankYouMessage,
      })
      .eq('id', user.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating tip settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

#### 2. 创建 Hook

**新建文件：** `src/lib/hooks/useTipSettings.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface TipSettings {
  enabled: boolean
  thankYouMessage: string
}

export function useTipSettings() {
  const queryClient = useQueryClient()

  const { data: settings, isLoading } = useQuery({
    queryKey: ['tipSettings'],
    queryFn: async (): Promise<TipSettings> => {
      const response = await fetch('/api/tip/settings')
      if (!response.ok) throw new Error('Failed to fetch settings')
      return response.json()
    },
  })

  const mutation = useMutation({
    mutationFn: async (newSettings: TipSettings) => {
      const response = await fetch('/api/tip/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      })
      if (!response.ok) throw new Error('Failed to update settings')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tipSettings'] })
    },
  })

  return {
    settings,
    isLoading,
    updateSettings: mutation.mutate,
    isUpdating: mutation.isPending,
  }
}
```

#### 3. 确保数据库字段存在

需要在 `profiles` 表中添加字段（如果尚未存在）：

```sql
-- 检查字段是否存在
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN ('tip_enabled', 'tip_thank_you_message');

-- 如果不存在，添加字段
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS tip_thank_you_message TEXT;
```

#### 4. 修改页面添加设置对话框

**文件：** `src/app/[locale]/(main)/tip-center/page.tsx`

**添加导入：**

```typescript
import { useState } from 'react'
import { useTipSettings } from '@/lib/hooks/useTipSettings'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
```

**在组件内添加状态和逻辑：**

```typescript
export default function TipCenterPage() {
  // ... 现有代码
  
  const { settings, isLoading: settingsLoading, updateSettings } = useTipSettings()
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [localSettings, setLocalSettings] = useState({
    enabled: true,
    thankYouMessage: '',
  })

  // 打开设置对话框
  const handleOpenSettings = () => {
    if (settings) {
      setLocalSettings({
        enabled: settings.enabled,
        thankYouMessage: settings.thankYouMessage,
      })
    }
    setShowSettingsDialog(true)
  }

  // 保存设置
  const handleSaveSettings = () => {
    updateSettings(localSettings)
    setShowSettingsDialog(false)
  }

  // ... 其他代码
}
```

**修改设置区域的按钮（第251行）：**

```typescript
<Button variant="ghost" onClick={handleOpenSettings}>
  <ChevronRight className="h-5 w-5" />
</Button>
```

**在 return 语句末尾添加对话框（在最后一个 `</Card>` 之后）：**

```typescript
<Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{t('tipSettings')}</DialogTitle>
    </DialogHeader>
    
    <div className="space-y-4 py-4">
      {/* 开启/关闭打赏 */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{t('enableTips')}</p>
          <p className="text-sm text-muted-foreground">{t('enableTipsDesc')}</p>
        </div>
        <Switch
          checked={localSettings.enabled}
          onCheckedChange={(checked) => 
            setLocalSettings(prev => ({ ...prev, enabled: checked }))
          }
        />
      </div>
      
      {/* 感谢语设置 */}
      <div className="space-y-2">
        <p className="font-medium">{t('thankYouMessage')}</p>
        <p className="text-sm text-muted-foreground">{t('thankYouMessageDesc')}</p>
        <Textarea
          value={localSettings.thankYouMessage}
          onChange={(e) => setLocalSettings(prev => ({ 
            ...prev, 
            thankYouMessage: e.target.value 
          }))}
          placeholder={t('thankYouPlaceholder')}
          rows={3}
        />
      </div>
    </div>
    
    <DialogFooter>
      <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>
        {tCommon('cancel')}
      </Button>
      <Button onClick={handleSaveSettings} disabled={isUpdating}>
        {isUpdating ? tCommon('saving') : tCommon('save')}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

#### 5. 添加翻译

**en.json：**

```json
{
  "tipCenter": {
    // ... 现有翻译
    "tipSettings": "Tip Settings",
    "thankYouPlaceholder": "Thank you for your support! It means a lot to me.",
    "settingsSaved": "Settings saved successfully"
  }
}
```

**zh.json：**

```json
{
  "tipCenter": {
    // ... 现有翻译
    "tipSettings": "打赏设置",
    "thankYouPlaceholder": "感谢您的支持！这对我意义重大。",
    "settingsSaved": "设置保存成功"
  }
}
```

### 验证
- [ ] 点击设置按钮打开对话框
- [ ] 可以开启/关闭打赏功能
- [ ] 可以设置感谢语
- [ ] 保存后设置生效
- [ ] 刷新页面后设置保持

---

## 方案 4：支持多货币显示（P0 - 15分钟）

### 目标
根据用户 locale 动态显示货币符号（中文显示 ¥，英文显示 $）。

### 实施步骤

#### 1. 添加辅助函数

**文件：** `src/app/[locale]/(main)/tip-center/page.tsx`

**在组件内添加（第16行后）：**

```typescript
// 获取货币符号
const getCurrencySymbol = (locale: string) => {
  return locale === 'zh' ? '¥' : '$'
}

// 格式化金额
const formatAmount = (amount: number) => {
  const symbol = getCurrencySymbol(locale)
  return `${symbol}${(amount || 0).toFixed(2)}`
}
```

#### 2. 替换所有金额显示

**第102行（收到总额）：**

```typescript
// 从：
<p className="text-2xl font-bold">
  ${tipStats?.receivedTotal?.toFixed(2) || '0.00'}
</p>

// 改为：
<p className="text-2xl font-bold">
  {formatAmount(tipStats?.receivedTotal)}
</p>
```

**第118行（发出总额）：**

```typescript
// 从：
<p className="text-2xl font-bold">
  ${tipStats?.givenTotal?.toFixed(2) || '0.00'}
</p>

// 改为：
<p className="text-2xl font-bold">
  {formatAmount(tipStats?.givenTotal)}
</p>
```

**第144行（总交易金额）：**

```typescript
// 从：
<p className="text-xs text-muted-foreground mt-2">
  {t('totalAmount')} ${(tipStats?.receivedTotal + tipStats?.givenTotal || 0).toFixed(2)}
</p>

// 改为：
<p className="text-xs text-muted-foreground mt-2">
  {t('totalAmount')} {formatAmount((tipStats?.receivedTotal || 0) + (tipStats?.givenTotal || 0))}
</p>
```

**第190行（收到的打赏记录）：**

```typescript
// 从：
<p className="font-medium">+${parseFloat(tip.amount).toFixed(2)}</p>

// 改为：
<p className="font-medium">+{formatAmount(parseFloat(tip.amount))}</p>
```

**第226行（发出的打赏记录）：**

```typescript
// 从：
<p className="font-medium">-${parseFloat(tip.amount).toFixed(2)}</p>

// 改为：
<p className="font-medium">-{formatAmount(parseFloat(tip.amount))}</p>
```

### 验证
- [ ] 中文环境显示 ¥ 符号
- [ ] 英文环境显示 $ 符号
- [ ] 所有金额都使用正确的符号

---

## 实施优先级建议

### 立即实施（P0）
1. **方案 1：使用 Hooks** - 10分钟
2. **方案 4：多货币显示** - 15分钟

### 后续优化（P1/P2）
3. **方案 2：修复增长率** - 15-20分钟
4. **方案 3：实现设置功能** - 2小时

### 预计总时间
- **最小可行版本（P0）**：25分钟
- **完整版本（P0+P1+P2）**：约2.5小时

---

## 验收标准

### 功能验收
- [ ] 使用 Hooks 后页面正常工作
- [ ] 增长率显示正确或已移除
- [ ] 设置功能可用（如实现）
- [ ] 多货币显示正确

### 代码验收
- [ ] 代码符合项目规范
- [ ] TypeScript 无错误
- [ ] 响应式设计正常
- [ ] 国际化完整

### 性能验收
- [ ] 页面加载时间 < 2秒
- [ ] 数据自动刷新正常
- [ ] 无内存泄漏

---

## 注意事项

1. **数据库字段**：实施方案 3 前，确保 `profiles` 表有 `tip_thank_you_message` 字段
2. **权限设置**：API 端点需要正确的权限验证
3. **错误处理**：所有异步操作都要有错误处理
4. **加载状态**：长时间操作要显示 loading 状态

---

## 附录

### 常用翻译键参考

```json
{
  "common": {
    "loading": "加载中...",
    "save": "保存",
    "cancel": "取消",
    "saving": "保存中..."
  }
}
```

### 相关文件清单

- `src/app/[locale]/(main)/tip-center/page.tsx` - 打赏中心页面
- `src/lib/hooks/useTipStats.ts` - 打赏统计 Hook
- `src/lib/hooks/useTipRecords.ts` - 打赏记录 Hook
- `src/lib/hooks/useTipSettings.ts` - 打赏设置 Hook（新建）
- `src/app/api/tip/settings/route.ts` - 设置 API（新建）
- `src/messages/en.json` - 英文翻译
- `src/messages/zh.json` - 中文翻译
