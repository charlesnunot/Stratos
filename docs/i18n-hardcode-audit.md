# 国际化硬编码审计（上线前检查）

本文档列出项目中尚未国际化的硬编码字符串，按优先级分类，便于上线前逐项处理。

---

## 一、高优先级（建议上线前修复）

### 1. 全局 / 错误页
| 文件 | 硬编码内容 | 建议 |
|------|------------|------|
| `src/app/error.tsx` | "发生错误，请重试"、"发生了未知错误" | 使用 `useTranslations` + common/error 键 |
| `src/app/global-error.tsx` | "发生错误，请重试"、"发生了严重错误" | 同上（或 getTranslations 服务端） |
| `src/app/[locale]/(main)/error.tsx` | 同上 | 与 error.tsx 统一 |
| `src/app/[locale]/(main)/loading.tsx` | "加载中..." | common.loading |

### 2. 布局与导航
| 文件 | 硬编码内容 | 建议 |
|------|------------|------|
| `src/components/layout/Sidebar.tsx` | "管理后台"、"社区运营"、fallback "用户" | 使用 admin / navigation 命名空间 |

### 3. 管理员相关（部分已国际化，以下为遗漏）
| 文件 | 硬编码内容 | 建议 |
|------|------------|------|
| `src/components/admin/CommissionManagement.tsx` | toast: "成功"、"佣金已结算"、"错误"、"结算失败" | 已存在 t/tCommon，替换为 t() |
| `src/components/admin/ReportManagement.tsx` | showError('客户端未初始化') 一处 | 使用 t('clientNotInitialized') |
| `src/app/.../admin/seller-debts/AdminSellerDebtsClient.tsx` | "选择状态"、"搜索卖家ID"、"待偿还"、"已扣除"、"筛选"、"创建时间" | admin 键 + t() |
| `src/app/.../admin/seller-debts/SellerDebtDetailsClient.tsx` | "返回"、"待偿还债务"、"已扣除债务"、"创建时间" | admin 键 + t() |
| `src/app/.../admin/platform-fees/AdminPlatformFeesClient.tsx` | "取消"、"收取服务费"、"输入用户ID"、"输入收费原因"、"处理中..."、"创建支付"、"搜索用户ID"、"平台服务费"、"加载中..."、"创建时间" | admin/common 键 |
| `src/app/.../admin/platform-payment-accounts/PlatformPaymentAccountsClient.tsx` | "支付宝"、"微信支付"、"已启用"、"已停用"、"已验证"、"编辑"、"创建时间" | admin 键（支付方式名可保留或加 key） |
| `src/app/.../admin/payment-accounts/AdminPaymentAccountsClient.tsx` | "支付宝"、"微信支付"、"银行转账"、"未连接"、"未设置"、"输入验证备注..."、"加载中..."、"已验证" | admin 键 |
| `src/app/.../admin/dashboard/page.tsx` | "待审核帖子"、"待审核商品"、"待审核评论"、"待审核商品讨论"、"待处理举报"、"待结算佣金"、"待审核资料"、"待审核用户资料" | admin 键 |
| `src/app/.../admin/community/page.tsx` | "待处理举报"、"返回管理后台" | admin 键 |
| `src/app/.../admin/reports/page.tsx` | "返回首页" | common/admin |
| `src/app/.../admin/identity-verification/page.tsx` | "返回管理后台" | admin.backToDashboard |
| `src/app/.../admin/profile-review/page.tsx` | "返回管理后台" | admin.backToDashboard |

### 4. 用户端高频页面
| 文件 | 硬编码内容 | 建议 |
|------|------------|------|
| `src/app/[locale]/(main)/profile/addresses/page.tsx` | toast "已设置默认地址"、"设置失败"、"地址已删除"、"删除失败"、"地址已更新"、"更新失败"、"信息有误"；"请先登录"、"返回结算"、"编辑地址"、"保存"、"设为默认"、confirm "确定要删除这个地址吗？"、placeholder "例如：家庭、工作、其他" | addresses / common 键 |
| `src/app/[locale]/(main)/settings/page.tsx` | "仅支持邮箱账号修改密码"、confirm "注销"、"保存中..."、"提交中..." | settings / common |
| `src/app/[locale]/(main)/subscription/success/page.tsx` | "检查订阅状态时出错"、"未找到订阅记录..."、"卖家"、"带货者"、"打赏功能"、"返回首页" | subscription / common |
| `src/app/[locale]/(main)/orders/[id]/pay/page.tsx` | "无权访问此订单"、"加载支付方式..."、"请使用微信扫描下方二维码完成支付"；placeholder "请输入收货人姓名"、"请输入联系电话"、"请输入国家/地区" 等；"请输入您使用的银行名称"、"请输入转账金额"、"请输入银行交易流水号"；alt "微信支付二维码"、"凭证预览" | orders/checkout / common |
| `src/app/[locale]/(main)/seller/dashboard/page.tsx` | "加载统计数据失败"、"待处理订单"、StatsChart title "近7天销售额" | seller / admin |
| `src/components/ecommerce/CheckoutForm.tsx` | option "请选择支付方式" | checkout / common |

### 5. 社交 / 帖子 / 商品交互（toast / 提示）
| 文件 | 硬编码内容 | 建议 |
|------|------------|------|
| `src/lib/product-card/useProductCardActions.ts` | "请先登录后再私聊"、"商品不存在或已被删除"、"商品已下架，无法加入购物车"、"商品库存不足..."、"验证失败，请重试"、"请先登录后再举报"、"链接已复制到剪贴板"、"操作过于频繁，请稍后再试"、"复制链接失败"、"请先登录后再转发"、"已转发给..."、"转发失败，请重试" | product/orders/common 键 |
| `src/components/social/PostCard.tsx` | "请先登录后再举报"、"已取消关注"、"请先登录后再转发"、"转发失败"、"链接已复制"、"操作过于频繁"、"复制链接失败"、"您没有权限删除此帖子" | 同上 |
| `src/components/social/ReportDialog.tsx` | "请先登录"、"请选择举报原因"、"客户端未初始化" | common / admin |
| `src/components/social/ShareDialog.tsx` | "操作过于频繁，请稍后再试"、"链接已复制到剪贴板"、"复制失败，请稍后重试" | common |
| `src/components/social/CommentLikeButton.tsx` | "操作过于频繁，请稍后再试"、"操作失败，请重试" | common |
| `src/app/[locale]/(main)/topics/[topic]/page.tsx` | "请先登录后再关注"、"已取消关注话题"、"已关注话题"、"操作失败，请重试"、"取消关注"、"关注话题"、"加载更多" | topics / common |
| `src/components/ecommerce/ProductReviewForm.tsx` | "请先登录后再评价"、"当前账号没有可评价的订单"、"请先选择星级评分"、"评价已提交" | product/review / common |
| `src/lib/providers/AuthProvider.tsx` | "您的登录已过期，请重新登录" | auth / common |

### 6. 地址与表单校验
| 文件 | 硬编码内容 | 建议 |
|------|------------|------|
| `src/lib/utils/address-validation.ts` | "收货人姓名为必填"、"联系电话为必填"、"国家/地区为必填"、"详细地址为必填" 等全部错误文案 | addresses 命名空间，校验函数接收 t 或返回 key |

### 7. 上传与图片组件
| 文件 | 硬编码内容 | 建议 |
|------|------------|------|
| `src/components/ui/ImageUpload.tsx` | "警告"、"最多只能上传 X 张图片"、"不是有效的图片格式"、"超过 5MB 限制" | common / upload 键 |
| `src/components/settings/IdCardImageUpload.tsx` | "格式不支持"、"请上传 JPG、PNG 或 WebP"、"文件过大"、"请上传 5MB 以内"、"上传失败"、"请重试"、"上传中..."、"重新上传"、"上传" | common / settings |

### 8. 收藏与备注
| 文件 | 硬编码内容 | 建议 |
|------|------------|------|
| `src/components/favorites/FavoriteNotesDialog.tsx` | "编辑备注"、placeholder "输入备注..." | favorites |
| `src/components/favorites/FavoriteItem.tsx` | title "添加备注" | favorites |

---

## 二、中优先级（API / 服务端返回给前端的文案）

以下 API 或服务端返回的错误/成功信息可能直接展示给用户，建议改为错误码或 key，由前端根据 locale 翻译。

| 文件 | 硬编码内容 | 建议 |
|------|------------|------|
| `src/app/api/auth/logout/route.ts` | "登出失败，请重试"、"登出时发生错误" | 返回 code，前端 t(`auth.logout.${code}`) |
| `src/app/api/auth/validate-password/route.ts` | "密码不能为空"、"密码至少需要 X 个字符"、"建议包含小写/大写/数字/特殊字符"、"密码验证失败，请重试" | 返回 codes，前端 t() |
| `src/app/api/account/deletion-request/route.ts` | "注销"、"Please type \"DELETE\" or \"注销\" to confirm" | 保留关键词，提示文案走 i18n |
| `src/app/api/admin/identity-verification/[userId]/review/route.ts` | 通知 title/body "实名认证已通过/未通过" 等 | 通知存 type，前端/邮件模板用 t() |
| `src/app/api/admin/monitoring/dashboard/route.ts` | health issues "有 X 个过期订单待处理" 等 | 返回 count + type，前端 t('admin.issuesCount', { count, type }) |
| `src/app/api/admin/platform-fees/charge/route.ts` | subject "平台服务费: X"、message "银行转账需要手动处理..." | 邮件/通知用 key 或后端按 locale 选文案 |
| `src/app/api/orders/[id]/cancel/route.ts` | 通知 title/content "订单已取消并退款" 等 | 通知 type + 参数，前端 t() |
| `src/app/api/payments/wechat/create-order/route.ts` | description "订单 X"、error "订单暂时无法支付，请联系卖家" | 返回 code，前端 t() |
| `src/app/api/subscriptions/create-payment/route.ts` | subject "卖家订阅"、"带货者订阅"、"打赏功能订阅"、"订阅" | 订阅类型 key，前端 t() |
| `src/lib/api/rate-limit.ts` | error "请求过于频繁，请稍后再试" | 返回 429 + code，前端 t('rateLimit') |
| `src/lib/api/logger.ts` | 同上 | 同上 |

---

## 三、低优先级（可按需处理）

| 类别 | 文件/位置 | 说明 |
|------|-----------|------|
| 数字占位 | 多处 placeholder="0.00"、placeholder="0" | 可保留或统一 common.placeholderAmount |
| 图片 alt | alt="微信支付二维码"、alt="凭证预览"、alt="更多操作" | 可增加 common/admin 的 alt 键 |
| 后端专用 | `src/app/api/cloudinary/migrate-*.ts` 返回的 message | 多为管理员或日志，可延后 |
| AI 提示词 | `src/lib/ai/prompts.ts`、`translate-server.ts` | 面向模型，非直接用户界面，可保留中文或按需多语言 |
| 配置 | `src/i18n/config.ts` nativeName: "中文" | 已是语言名，保留 |

---

## 四、数据/存储中的中文（不改为 i18n）

- `src/app/.../admin/violation-penalties/AdminViolationPenaltiesClient.tsx` 中 `.contains('metadata', { deduction_reason: '违规扣款' })` 为**后端已有数据约定**，仅作查询键，不改为翻译键。
- 若后续希望展示“违规扣款”等给用户，可单独用 t() 显示，查询值仍保留与历史数据一致。

---

## 五、建议执行顺序

1. **立即**：修复全局 error/loading、Sidebar、CommissionManagement 与 ReportManagement 剩余一处。
2. **上线前**：完成「一、高优先级」中管理员 dashboard/community/reports/identity-verification/profile-review、seller-debts、platform-fees、platform-payment-accounts、payment-accounts；以及用户端 address、settings、subscription success、orders pay、seller dashboard、CheckoutForm。
3. **同步**：社交与商品相关 toast（PostCard、useProductCardActions、ReportDialog、ShareDialog、CommentLikeButton、topics、ProductReviewForm、AuthProvider）。
4. **随后**：地址校验、ImageUpload、IdCardImageUpload、FavoriteNotesDialog/FavoriteItem。
5. **迭代**：API 返回文案改为 code + 前端 t()；低优先级 alt/placeholder 按需补全。

---

## 六、翻译键命名建议

- 通用：`common.loading`、`common.error`、`common.retry`、`common.confirm`、`common.cancel` 等。
- 错误页：`common.errorOccurred`、`common.errorUnknown`。
- 模块：`admin.*`、`seller.*`、`addresses.*`、`settings.*`、`subscription.*`、`orders.*`、`topics.*`、`favorites.*`。
- 行为/结果：`auth.loginExpired`、`product.addToCartFailed`、`product.outOfStock`、`report.pleaseSelectReason` 等，便于复用与维护。

完成上述高优先级项后，可显著减少上线后用户看到单一语言或中英混杂的情况。
