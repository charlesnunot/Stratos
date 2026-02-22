# Admin 收款账户审核数据修复方案

## 问题概述

### 问题1：Admin 看不到收款账户审核数据
- **现象**：在 `/seller/payment-accounts` 绑定收款账户后，`/admin/payment-accounts` 页面没有显示待审核数据
- **根因**：`payment_accounts` 表的 RLS (Row Level Security) 策略限制了 Admin 查看所有记录

### 问题2：翻译错误 `common.errorTitle`
- **现象**：页面报错 `MISSING_MESSAGE: Could not resolve common.errorTitle`
- **根因**：`messages/zh.json` 和 `messages/en.json` 缺少 `common.errorTitle` 翻译键

---

## 修复步骤

### 步骤1：修复 RLS 策略（核心修复）

**执行环境**：Supabase Dashboard SQL Editor

#### 1.1 检查当前 RLS 状态

```sql
-- 查看表是否启用 RLS
SELECT relname, relrowsecurity 
FROM pg_class 
WHERE relname = 'payment_accounts';

-- 查看现有 RLS 策略
SELECT policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'payment_accounts';
```

#### 1.2 添加 Admin 查询策略

```sql
-- 允许 Admin 和 Support 角色查看所有 payment_accounts
CREATE POLICY "Admin view all payment accounts" 
ON public.payment_accounts 
FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role IN ('admin', 'support')
  )
);
```

#### 1.3 验证策略已生效

```sql
-- 确认策略已创建
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'payment_accounts';
```

**预期输出**：
```
policyname                    | cmd  | qual
------------------------------|------|-----
Admin view all payment accounts | SELECT | EXISTS (...)
```

---

### 步骤2：修复翻译错误

#### 2.1 修改中文翻译

**文件**：`src/messages/zh.json`

找到 `common` 对象（约第1-50行），添加以下键：

```json
{
  "common": {
    "loading": "加载中...",
    "error": "错误",
    "errorTitle": "错误",
    "successTitle": "成功",
    "cancel": "取消",
    "save": "保存",
    "delete": "删除",
    "edit": "编辑",
    "create": "创建",
    "submit": "提交",
    "close": "关闭",
    "confirm": "确认",
    "back": "返回",
    "next": "下一步",
    "search": "搜索",
    "filter": "筛选",
    "sort": "排序",
    "refresh": "刷新",
    "copy": "复制",
    "share": "分享",
    "download": "下载",
    "upload": "上传",
    "preview": "预览",
    "view": "查看",
    "details": "详情",
    "settings": "设置",
    "profile": "个人资料",
    "account": "账户",
    "logout": "退出登录",
    "login": "登录",
    "register": "注册",
    "forgotPassword": "忘记密码",
    "resetPassword": "重置密码",
    "verifyEmail": "验证邮箱",
    "resend": "重新发送",
    "sending": "发送中...",
    "sent": "已发送",
    "saveChanges": "保存更改",
    "discardChanges": "放弃更改",
    "unsavedChanges": "您有未保存的更改",
    "deleteConfirm": "确定要删除吗？此操作不可恢复。",
    "noData": "暂无数据",
    "loadMore": "加载更多",
    "loadingMore": "加载中...",
    "retry": "重试",
    "errorRetry": "加载失败，点击重试",
    "saving": "保存中...",
    "saved": "已保存"
  }
}
```

#### 2.2 修改英文翻译

**文件**：`src/messages/en.json`

找到 `common` 对象，添加以下键：

```json
{
  "common": {
    "loading": "Loading...",
    "error": "Error",
    "errorTitle": "Error",
    "successTitle": "Success",
    "cancel": "Cancel",
    "save": "Save",
    "delete": "Delete",
    "edit": "Edit",
    "create": "Create",
    "submit": "Submit",
    "close": "Close",
    "confirm": "Confirm",
    "back": "Back",
    "next": "Next",
    "search": "Search",
    "filter": "Filter",
    "sort": "Sort",
    "refresh": "Refresh",
    "copy": "Copy",
    "share": "Share",
    "download": "Download",
    "upload": "Upload",
    "preview": "Preview",
    "view": "View",
    "details": "Details",
    "settings": "Settings",
    "profile": "Profile",
    "account": "Account",
    "logout": "Logout",
    "login": "Login",
    "register": "Register",
    "forgotPassword": "Forgot Password",
    "resetPassword": "Reset Password",
    "verifyEmail": "Verify Email",
    "resend": "Resend",
    "sending": "Sending...",
    "sent": "Sent",
    "saveChanges": "Save Changes",
    "discardChanges": "Discard Changes",
    "unsavedChanges": "You have unsaved changes",
    "deleteConfirm": "Are you sure you want to delete? This action cannot be undone.",
    "noData": "No data available",
    "loadMore": "Load More",
    "loadingMore": "Loading...",
    "retry": "Retry",
    "errorRetry": "Failed to load, click to retry",
    "saving": "Saving...",
    "saved": "Saved"
  }
}
```

---

### 步骤3：验证修复

#### 3.1 验证 RLS 策略

执行 SQL 查询：

```sql
-- 查看所有策略
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'payment_accounts';
```

**预期结果**：
- 至少有一条策略 `Admin view all payment accounts`
- `cmd` 列显示 `SELECT`
- `qual` 列包含 `EXISTS (...)` 判断

#### 3.2 验证数据可见性

执行 SQL 查询（模拟 Admin 用户）：

```sql
-- 检查 payment_accounts 数据
SELECT 
  id,
  seller_id,
  account_type,
  account_name,
  verification_status,
  is_platform_account,
  created_at
FROM payment_accounts 
ORDER BY created_at DESC;
```

**预期结果**：
- 能看到之前绑定的 PayPal 账户
- `verification_status` = 'pending'

#### 3.3 验证 Admin 页面

1. **访问页面**：`http://localhost:3001/en/admin/payment-accounts`
2. **检查"待验证"标签页**：
   - 应显示 1 条记录
   - 账户类型：PayPal
   - 邮箱：sb-bviby29570150@personal.example.com
   - 状态：待验证

3. **检查"全部"标签页**：
   - 应显示所有记录

4. **检查控制台**：
   - 不应再有 `common.errorTitle` 错误

---

## 备选方案（如果 RLS 策略不生效）

如果添加 RLS 策略后 Admin 仍看不到数据，可以使用 **API 路由方式**绕过 RLS：

### 方案 B：创建 Admin API 路由

**文件**：`src/app/api/admin/payment-accounts/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { requireAdminOrSupport } from '@/lib/auth/require-admin'

export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const adminCheck = await requireAdminOrSupport()
    if (!adminCheck.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // 使用 service_role 绕过 RLS
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: accounts, error } = await supabaseAdmin
      .from('payment_accounts')
      .select(`
        *,
        profiles!payment_accounts_seller_id_fkey(id, username, display_name, seller_type)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch payment accounts:', error)
      return NextResponse.json(
        { error: 'Failed to fetch payment accounts' },
        { status: 500 }
      )
    }

    return NextResponse.json({ accounts })
  } catch (error: any) {
    console.error('Admin payment accounts API error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
```

### 修改 Admin 客户端使用 API

**文件**：`src/app/[locale]/(main)/admin/payment-accounts/AdminPaymentAccountsClient.tsx`

修改 `loadAccounts` 函数：

```typescript
const loadAccounts = async () => {
  setLoading(true)
  try {
    // 使用 API 路由而不是直接查询
    const res = await fetch('/api/admin/payment-accounts')
    if (!res.ok) {
      throw new Error('Failed to fetch accounts')
    }
    const data = await res.json()
    setAccounts(data.accounts || [])
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '加载支付账户失败'
    toast({ variant: 'destructive', title: '错误', description: msg })
  } finally {
    setLoading(false)
  }
}
```

---

## 常见问题

### Q1: 为什么需要 RLS 策略？

**A**: Supabase 默认启用 RLS 保护数据安全。没有策略时，即使 Admin 用户也无法查看其他用户的数据。

### Q2: 添加策略后会影响普通用户吗？

**A**: 不会。新策略只给 Admin/Support 角色额外的查询权限，不影响现有用户的权限。

### Q3: 如何确认我是 Admin 角色？

**A**: 执行 SQL：
```sql
SELECT id, username, role 
FROM profiles 
WHERE id = '你的用户ID';
```
确保 `role` = 'admin'

### Q4: 如果策略添加失败怎么办？

**A**: 
1. 检查策略名是否已存在：`SELECT * FROM pg_policies WHERE policyname = 'Admin view all payment accounts'`
2. 如果存在，先删除：`DROP POLICY "Admin view all payment accounts" ON payment_accounts;`
3. 重新创建策略

### Q5: 翻译文件修改后需要重启吗？

**A**: 不需要。Next.js 开发服务器会自动热重载翻译文件。生产环境需要重新构建部署。

---

## 验证清单

- [ ] RLS 策略已添加到数据库
- [ ] 策略显示在 `pg_policies` 查询结果中
- [ ] `messages/zh.json` 添加了 `common.errorTitle` 和 `common.successTitle`
- [ ] `messages/en.json` 添加了 `common.errorTitle` 和 `common.successTitle`
- [ ] JSON 文件语法正确（无逗号错误）
- [ ] Admin 页面能看到 payment_accounts 数据
- [ ] "待验证"标签页显示待审核账户
- [ ] 控制台无 `common.errorTitle` 错误

---

## 回滚方案

如果需要回滚：

### 回滚 RLS 策略

```sql
-- 删除策略
DROP POLICY IF EXISTS "Admin view all payment accounts" ON payment_accounts;
```

### 回滚翻译修改

从 `messages/zh.json` 和 `messages/en.json` 中删除添加的键。

---

**修复完成！** 按照以上步骤操作后，Admin 应该能正常看到收款账户审核数据。
