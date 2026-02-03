# 用户设置与地址管理 — 审计报告

**审计范围**：用户设置（/main/settings、个人资料编辑）、地址管理（/profile/addresses、checkout 地址选择）、权限与安全、数据一致性、异常处理  
**审计日期**：2025-01-31  
**结论**：按检查点输出问题描述、风险等级与修复建议；已修复项已落地。

---

## 1. 用户设置

**页面与接口**：`/main/settings`（占位页）、`/profile/[id]/edit`（个人资料编辑）。

### 1.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 用户只能修改自己的信息 | **通过**：/profile/[id]/edit 在加载后校验 `user.id === profile.id`，非本人重定向到 `/profile/[id]`；提交时 `.eq('id', user.id)` 更新；RLS “Users can update own profile” 限制为本人。 | 通过 | 无。 |
| 修改邮箱、密码、个人资料等操作有校验 | **部分**：个人资料编辑有必填与用户名唯一性校验；/main/settings 为占位页（“设置页面正在开发中”），无邮箱/密码修改入口；邮箱/密码变更若存在，应由 Supabase Auth 或独立流程处理。 | 通过 | 无。 |
| 异常输入是否有验证（格式、长度） | **已修复**：原无 display_name、username、bio、location 长度限制。已增加：display_name ≤ 50、username ≤ 30、bio ≤ 500、location ≤ 200，超限时 setErrors 并阻止提交；文案使用 t('displayNameTooLong') 等。 | ~~低~~ 已修复 | 无。 |

### 1.2 已实施修复（用户设置）

- **`src/app/[locale]/(main)/profile/[id]/edit/page.tsx`**：handleSubmit 中增加 MAX_DISPLAY_NAME/MAX_USERNAME/MAX_BIO/MAX_LOCATION 校验，超限时 setErrors 并 return；使用 dn/un 等已 trim 变量写入。
- **`src/messages/zh.json`、`src/messages/en.json`**：profile 下增加 displayNameTooLong、usernameTooLong、bioTooLong、locationTooLong。

---

## 2. 地址管理

**页面与接口**：`/profile/addresses`、checkout 页内 `AddressSelector`（添加/选择地址）；无独立地址 API，均经 Supabase + RLS。

### 2.1 检查点汇总

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 用户只能操作自己的地址（添加、编辑、删除、设默认） | **通过**：列表与所有 mutation 均 `.eq('user_id', user.id)`；RLS “Users can view/insert/update/delete their own addresses” 为 `user_id = auth.uid()`；orders/create 使用 shipping_address_id 时 `.eq('user_id', user.id)` 校验归属。 | 通过 | 无。 |
| 地址格式校验正确 | **已修复**：原仅校验必填（姓名、电话、地址、国家），无长度与格式限制。已增加 `validateAddressFields`：label≤50、recipient_name≤100、phone≤30、country/state/city≤100、street_address≤500、postal_code≤20；地址页编辑与 AddressSelector 添加均使用该校验。 | ~~低~~ 已修复 | 无。 |
| 默认地址逻辑正确，删除时回退机制正常 | **已修复**：DB 触发器 `ensure_single_default_address` 保证每用户仅一个默认；原删除默认地址后不自动设其他为默认。已改为：deleteMutation 接收 `{ addressId, wasDefault }`，删除后若 wasDefault 且仍有剩余地址，则将第一个剩余地址设为默认。 | ~~低~~ 已修复 | 无。 |

### 2.2 已实施修复（地址管理）

- **`src/lib/utils/address-validation.ts`**（新建）：ADDRESS_FIELD_LIMITS、validateAddressFields（必填 + 长度），返回 valid 与 errors。
- **`src/app/[locale]/(main)/profile/addresses/page.tsx`**：handleSaveEdit 使用 validateAddressFields，不通过则 toast 首条错误；deleteMutation 改为 `({ addressId, wasDefault })`，删除后若 wasDefault 且 addresses.length > 1，将 remaining[0] 设为默认。
- **`src/components/ecommerce/AddressSelector.tsx`**：handleAddAddress 使用 validateAddressFields，不通过则 toast 首条错误。

---

## 3. 权限与安全

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 用户无法访问或修改他人的设置或地址 | **通过**：资料编辑页非本人重定向；地址表 RLS 与前端查询/mutation 均限定 user_id；无开放 API 可越权读写他人地址或资料。 | 通过 | 无。 |
| 后端接口是否严格校验权限 | **通过**：订单创建使用 shipping_address_id 时，supabase（RLS）查询 `.eq('id', shipping_address_id).eq('user_id', user.id)`，地址不存在或非本人则 404。 | 通过 | 无。 |

---

## 4. 数据一致性与日志

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 修改操作是否同步更新数据库 | **通过**：资料与地址的增删改均通过 Supabase 客户端写库，成功后 invalidateQueries 刷新；默认地址由 DB 触发器保证唯一。 | 通过 | 无。 |
| 日志记录操作，但不泄露敏感信息 | **部分**：资料/地址修改无统一 logAudit；错误路径有 console.error 或 toast，未记录详细地址或密码。 | 低 | 可选：对资料提交、地址添加/编辑/删除做 logAudit（仅 action + resourceId，不记录详细地址或 PII）。 |

---

## 5. 异常处理

| 检查点 | 问题描述 | 风险等级 | 修复建议 / 状态 |
|--------|----------|----------|-----------------|
| 前端错误或 API 异常是否有提示 | **通过**：资料编辑 catch 后 toast(description: error.message)；地址 mutation onError 时 toast destructive；校验不通过时 toast 或 setErrors。 | 通过 | 无。 |
| 异常操作是否被正确回滚 | **通过**：单次 mutation 失败不写库，无局部提交；删除默认地址后设新默认为单独 update，若失败仅影响“默认”状态，可用户再次点击“设为默认”修正。 | 通过 | 无。 |

---

## 6. 汇总表（按风险等级）

| 序号 | 检查项 | 问题简述 | 风险等级 | 状态 |
|------|--------|----------|----------|------|
| 1 | 个人资料无长度校验 | display_name/username/bio/location 无上限，可超长写入 | ~~低~~ | **已修复**：50/30/500/200 字符限制 + 文案 |
| 2 | 地址无长度与格式校验 | 仅必填，无长度限制，易异常或超长 | ~~低~~ | **已修复**：validateAddressFields + 地址页与 AddressSelector 使用 |
| 3 | 删除默认地址无回退 | 删除默认后未自动将其他地址设为默认 | ~~低~~ | **已修复**：删除后若仍有剩余则设第一个为默认 |

---

## 7. 已采用的正确实践（无需修改）

- **设置页**：/main/settings 为占位，实际资料编辑在 /profile/[id]/edit，权限与 RLS 一致。
- **地址 RLS**：user_addresses 的 SELECT/INSERT/UPDATE/DELETE 均为 `user_id = auth.uid()`。
- **订单地址**：orders/create 使用 shipping_address_id 时严格 `.eq('user_id', user.id)`，防止越权。
- **默认地址**：DB 触发器 ensure_single_default_address 保证每用户仅一个 is_default = true。

---

## 8. 可选后续优化

- 对个人资料提交、地址添加/编辑/删除做 logAudit（action + resourceId，不记录详细地址或 PII）。
- /main/settings 若后续增加邮箱/密码修改，需服务端或 Supabase Auth 校验并限流。
- 地址电话可增加格式校验（如仅数字与少量符号、长度区间），按业务需求补充。
