/**
 * Permission Dictionary & RBAC Configuration
 * 权限字典与 RBAC 配置
 * 
 * 定义系统中所有权限和角色，作为前后端权限判断的唯一真相源
 * 
 * 使用原则:
 * 1. 所有权限标识符在此定义，不允许硬编码在业务逻辑中
 * 2. 角色权限映射在此配置，便于统一管理
 * 3. 新增权限必须先在此注册，否则视为无效权限
 */

/**
 * 权限命名规范: resource.action[.scope]
 * 示例:
 * - user.read          读取用户信息
 * - user.update.own    更新自己的信息
 * - user.update.any    更新任意用户信息
 * - admin.user.ban     管理员封禁用户
 */

// ============================================================================
// 权限标识符定义
// ============================================================================

/**
 * 用户基础权限
 */
export const UserPermissions = {
  // 个人资料
  PROFILE_READ: 'profile.read',
  PROFILE_UPDATE: 'profile.update',
  PROFILE_DELETE: 'profile.delete',
  
  // 账户安全
  PASSWORD_CHANGE: 'password.change',
  EMAIL_CHANGE: 'email.change',
  MFA_SETUP: 'mfa.setup',
  
  // 偏好设置
  SETTINGS_READ: 'settings.read',
  SETTINGS_UPDATE: 'settings.update',
} as const

/**
 * 卖家权限
 */
export const SellerPermissions = {
  // 店铺管理
  SHOP_READ: 'shop.read',
  SHOP_UPDATE: 'shop.update',
  
  // 商品管理
  PRODUCT_CREATE: 'product.create',
  PRODUCT_READ: 'product.read',
  PRODUCT_UPDATE: 'product.update',
  PRODUCT_DELETE: 'product.delete',
  
  // 订单管理
  ORDER_READ: 'order.read',
  ORDER_UPDATE: 'order.update',
  ORDER_SHIP: 'order.ship',
  ORDER_REFUND: 'order.refund',
  
  // 库存管理
  INVENTORY_READ: 'inventory.read',
  INVENTORY_UPDATE: 'inventory.update',
  
  // 数据分析
  ANALYTICS_READ: 'analytics.read',
  
  // 营销工具
  COUPON_CREATE: 'coupon.create',
  COUPON_MANAGE: 'coupon.manage',
  PROMOTION_CREATE: 'promotion.create',
} as const

/**
 * 带货员权限
 */
export const AffiliatePermissions = {
  // 选品中心
  PRODUCT_BROWSE: 'affiliate.product.browse',
  PRODUCT_PROMOTE: 'affiliate.product.promote',
  
  // 推广管理
  PROMOTION_READ: 'affiliate.promotion.read',
  PROMOTION_CREATE: 'affiliate.promotion.create',
  PROMOTION_DELETE: 'affiliate.promotion.delete',
  
  // 佣金管理
  COMMISSION_READ: 'affiliate.commission.read',
  COMMISSION_WITHDRAW: 'affiliate.commission.withdraw',
  
  // 数据分析
  AFFILIATE_ANALYTICS: 'affiliate.analytics.read',
} as const

/**
 * 打赏权限
 */
export const TipPermissions = {
  // 打赏功能
  TIP_CREATE: 'tip.create',
  TIP_READ: 'tip.read',
  TIP_SETTINGS: 'tip.settings',
  TIP_WITHDRAW: 'tip.withdraw',
} as const

/**
 * 客服权限
 */
export const SupportPermissions = {
  // 工单管理
  TICKET_READ: 'ticket.read',
  TICKET_CREATE: 'ticket.create',
  TICKET_UPDATE: 'ticket.update',
  TICKET_ASSIGN: 'ticket.assign',
  TICKET_CLOSE: 'ticket.close',
  TICKET_ESCALATE: 'ticket.escalate',
  
  // 用户管理（受限）
  USER_READ: 'support.user.read',
  USER_BAN: 'support.user.ban',
  USER_UNBAN: 'support.user.unban',
  
  // 内容审核（受限）
  CONTENT_REVIEW: 'support.content.review',
  CONTENT_APPROVE: 'support.content.approve',
  CONTENT_REJECT: 'support.content.reject',
} as const

/**
 * 管理员权限
 * 管理员拥有所有权限，用通配符表示
 */
export const AdminPermissions = {
  // 系统管理
  SYSTEM_CONFIG: 'admin.system.config',
  SYSTEM_MAINTENANCE: 'admin.system.maintenance',
  
  // 用户管理
  USER_CREATE: 'admin.user.create',
  USER_READ: 'admin.user.read',
  USER_UPDATE: 'admin.user.update',
  USER_DELETE: 'admin.user.delete',
  USER_IMPERSONATE: 'admin.user.impersonate',
  
  // 角色管理
  ROLE_ASSIGN: 'admin.role.assign',
  ROLE_REVOKE: 'admin.role.revoke',
  
  // 订阅管理
  SUBSCRIPTION_READ: 'admin.subscription.read',
  SUBSCRIPTION_CREATE: 'admin.subscription.create',
  SUBSCRIPTION_UPDATE: 'admin.subscription.update',
  SUBSCRIPTION_SYNC: 'admin.subscription.sync',
  SUBSCRIPTION_CONSISTENCY_CHECK: 'admin.subscription.consistency.check',
  
  // 财务管理
  COMPENSATION_PROCESS: 'admin.compensation.process',
  REFUND_PROCESS: 'admin.refund.process',
  TRANSFER_RETRY: 'admin.transfer.retry',
  PLATFORM_FEE_CHARGE: 'admin.platform.fee.charge',
  
  // 支付账户管理
  PAYMENT_ACCOUNT_VERIFY: 'admin.payment.account.verify',
  PLATFORM_PAYMENT_ACCOUNT_MANAGE: 'admin.platform.payment.account.manage',
  
  // 争议处理
  DISPUTE_RESOLVE: 'admin.dispute.resolve',
  
  // 内部用户管理
  INTERNAL_USER_CREATE: 'admin.internal.user.create',
  INTERNAL_USER_MANAGE: 'admin.internal.user.manage',
  
  // 账户删除请求
  DELETION_REQUEST_APPROVE: 'admin.deletion.approve',
  DELETION_REQUEST_REJECT: 'admin.deletion.reject',
  
  // 违规处罚
  VIOLATION_PENALTY: 'admin.violation.penalty',
  
  // 报告管理
  REPORT_MANAGE: 'admin.report.manage',
  REPORT_NOTIFY: 'admin.report.notify',
  
  // 佣金结算
  COMMISSION_SETTLE: 'admin.commission.settle',
  
  // 卖家债务
  SELLER_DEBT_MANAGE: 'admin.seller.debt.manage',
  
  // 身份验证审核
  IDENTITY_VERIFY: 'admin.identity.verify',
  
  // 监控面板
  MONITORING_DASHBOARD: 'admin.monitoring.dashboard',
  
  // 数据迁移
  DATA_MIGRATION: 'admin.data.migration',
} as const

/**
 * 所有权限集合
 */
export const AllPermissions = {
  ...UserPermissions,
  ...SellerPermissions,
  ...AffiliatePermissions,
  ...TipPermissions,
  ...SupportPermissions,
  ...AdminPermissions,
} as const

/**
 * 权限类型 - 使用联合类型以支持所有权限值
 */
export type Permission = 
  | typeof UserPermissions[keyof typeof UserPermissions]
  | typeof SellerPermissions[keyof typeof SellerPermissions]
  | typeof AffiliatePermissions[keyof typeof AffiliatePermissions]
  | typeof TipPermissions[keyof typeof TipPermissions]
  | typeof SupportPermissions[keyof typeof SupportPermissions]
  | typeof AdminPermissions[keyof typeof AdminPermissions]

// ============================================================================
// 角色定义
// ============================================================================

/**
 * 系统角色
 */
export const Roles = {
  USER: 'user',
  SELLER: 'seller',
  AFFILIATE: 'affiliate',
  SUPPORT: 'support',
  ADMIN: 'admin',
} as const

export type Role = typeof Roles[keyof typeof Roles]

// ============================================================================
// 角色权限映射
// ============================================================================

const UserRolePermissions: Permission[] = [
  UserPermissions.PROFILE_READ,
  UserPermissions.PROFILE_UPDATE,
  UserPermissions.PASSWORD_CHANGE,
  UserPermissions.EMAIL_CHANGE,
  UserPermissions.MFA_SETUP,
  UserPermissions.SETTINGS_READ,
  UserPermissions.SETTINGS_UPDATE,
]

/**
 * 角色权限映射表
 * 定义每个角色拥有的权限
 */
export const RolePermissions: Record<Role, Permission[]> = {
  // 普通用户
  [Roles.USER]: UserRolePermissions,
  
  // 卖家 = 普通用户 + 卖家权限
  [Roles.SELLER]: [
    ...UserRolePermissions,
    SellerPermissions.SHOP_READ,
    SellerPermissions.SHOP_UPDATE,
    SellerPermissions.PRODUCT_CREATE,
    SellerPermissions.PRODUCT_READ,
    SellerPermissions.PRODUCT_UPDATE,
    SellerPermissions.PRODUCT_DELETE,
    SellerPermissions.ORDER_READ,
    SellerPermissions.ORDER_UPDATE,
    SellerPermissions.ORDER_SHIP,
    SellerPermissions.ORDER_REFUND,
    SellerPermissions.INVENTORY_READ,
    SellerPermissions.INVENTORY_UPDATE,
    SellerPermissions.ANALYTICS_READ,
    SellerPermissions.COUPON_CREATE,
    SellerPermissions.COUPON_MANAGE,
    SellerPermissions.PROMOTION_CREATE,
  ],
  
  // 带货员 = 普通用户 + 带货权限
  [Roles.AFFILIATE]: [
    ...UserRolePermissions,
    AffiliatePermissions.PRODUCT_BROWSE,
    AffiliatePermissions.PRODUCT_PROMOTE,
    AffiliatePermissions.PROMOTION_READ,
    AffiliatePermissions.PROMOTION_CREATE,
    AffiliatePermissions.PROMOTION_DELETE,
    AffiliatePermissions.COMMISSION_READ,
    AffiliatePermissions.COMMISSION_WITHDRAW,
    AffiliatePermissions.AFFILIATE_ANALYTICS,
  ],
  
  // 客服 = 普通用户 + 客服权限
  [Roles.SUPPORT]: [
    ...UserRolePermissions,
    SupportPermissions.TICKET_READ,
    SupportPermissions.TICKET_CREATE,
    SupportPermissions.TICKET_UPDATE,
    SupportPermissions.TICKET_ASSIGN,
    SupportPermissions.TICKET_CLOSE,
    SupportPermissions.TICKET_ESCALATE,
    SupportPermissions.USER_READ,
    SupportPermissions.USER_BAN,
    SupportPermissions.USER_UNBAN,
    SupportPermissions.CONTENT_REVIEW,
    SupportPermissions.CONTENT_APPROVE,
    SupportPermissions.CONTENT_REJECT,
  ],
  
  // 管理员 = 所有权限
  [Roles.ADMIN]: Object.values(AllPermissions),
}

// ============================================================================
// 权限检查函数
// ============================================================================

/**
 * 检查角色是否具有指定权限
 * @param role - 用户角色
 * @param permission - 权限标识
 * @returns boolean
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = RolePermissions[role] || []
  return permissions.includes(permission) || permissions.includes('*' as Permission)
}

/**
 * 检查角色是否具有所有指定权限
 * @param role - 用户角色
 * @param permissions - 权限标识数组
 * @returns boolean
 */
export function hasAllPermissions(role: Role, permissions: Permission[]): boolean {
  return permissions.every(p => hasPermission(role, p))
}

/**
 * 检查角色是否具有任意一个指定权限
 * @param role - 用户角色
 * @param permissions - 权限标识数组
 * @returns boolean
 */
export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(role, p))
}

/**
 * 获取角色的所有权限
 * @param role - 用户角色
 * @returns Permission[]
 */
export function getRolePermissions(role: Role): Permission[] {
  return RolePermissions[role] || []
}

/**
 * 获取用户的能力列表（用于前端）
 * @param role - 用户角色
 * @returns string[] 能力标识数组
 */
export function getUserCapabilities(role: Role): string[] {
  return getRolePermissions(role)
}

// ============================================================================
// API 权限映射（用于后端路由保护）
// ============================================================================

/**
 * API 路由权限映射
 * 定义每个 API 端点需要的权限
 */
export const ApiRoutePermissions: Record<string, Permission | Permission[]> = {
  // Admin 路由
  'GET /api/admin/account-managers': AdminPermissions.INTERNAL_USER_MANAGE,
  'POST /api/admin/account-managers': AdminPermissions.INTERNAL_USER_CREATE,
  'POST /api/admin/account-managers/:id/assign': AdminPermissions.INTERNAL_USER_MANAGE,
  
  'GET /api/admin/compensations': AdminPermissions.COMPENSATION_PROCESS,
  'POST /api/admin/compensations': AdminPermissions.COMPENSATION_PROCESS,
  
  'GET /api/admin/deletion-requests': [SupportPermissions.TICKET_READ, AdminPermissions.DELETION_REQUEST_APPROVE],
  'POST /api/admin/deletion-requests/:id/approve': AdminPermissions.DELETION_REQUEST_APPROVE,
  'POST /api/admin/deletion-requests/:id/reject': AdminPermissions.DELETION_REQUEST_REJECT,
  
  'GET /api/admin/disputes': [SupportPermissions.TICKET_READ, AdminPermissions.DISPUTE_RESOLVE],
  'POST /api/admin/disputes': AdminPermissions.DISPUTE_RESOLVE,
  
  'GET /api/admin/subscriptions': AdminPermissions.SUBSCRIPTION_READ,
  'GET /api/admin/subscription-consistency': AdminPermissions.SUBSCRIPTION_CONSISTENCY_CHECK,
  'POST /api/admin/subscription-consistency': AdminPermissions.SUBSCRIPTION_CONSISTENCY_CHECK,
  'GET /api/admin/sync-subscriptions': AdminPermissions.SUBSCRIPTION_SYNC,
  'POST /api/admin/sync-subscriptions': AdminPermissions.SUBSCRIPTION_SYNC,
  
  'GET /api/admin/internal-users': AdminPermissions.INTERNAL_USER_MANAGE,
  'POST /api/admin/internal-users': AdminPermissions.INTERNAL_USER_CREATE,
  'POST /api/admin/internal-users/:id/set-password': AdminPermissions.INTERNAL_USER_MANAGE,
  'POST /api/admin/internal-users/:id/set-direct-seller': AdminPermissions.INTERNAL_USER_MANAGE,
  'POST /api/admin/internal-users/:id/tip-affiliate': AdminPermissions.INTERNAL_USER_MANAGE,
  
  'GET /api/admin/payment-accounts/:id/verify': AdminPermissions.PAYMENT_ACCOUNT_VERIFY,
  'GET /api/admin/platform-payment-accounts': AdminPermissions.PLATFORM_PAYMENT_ACCOUNT_MANAGE,
  'POST /api/admin/platform-payment-accounts': AdminPermissions.PLATFORM_PAYMENT_ACCOUNT_MANAGE,
  'PUT /api/admin/platform-payment-accounts/:id': AdminPermissions.PLATFORM_PAYMENT_ACCOUNT_MANAGE,
  'DELETE /api/admin/platform-payment-accounts/:id': AdminPermissions.PLATFORM_PAYMENT_ACCOUNT_MANAGE,
  
  'GET /api/admin/platform-fees/charge': AdminPermissions.PLATFORM_FEE_CHARGE,
  'POST /api/admin/platform-fees/charge': AdminPermissions.PLATFORM_FEE_CHARGE,
  
  'POST /api/admin/profiles/:id/approve-profile': SupportPermissions.CONTENT_APPROVE,
  'POST /api/admin/profiles/:id/reject-profile': SupportPermissions.CONTENT_REJECT,
  'POST /api/admin/profiles/:id/ban': SupportPermissions.USER_BAN,
  'POST /api/admin/profiles/:id/unban': SupportPermissions.USER_UNBAN,
  'POST /api/admin/profiles/:id/restore': AdminPermissions.USER_UPDATE,
  'POST /api/admin/profiles/:id/seller-type': AdminPermissions.ROLE_ASSIGN,
  
  'POST /api/admin/refunds/process': AdminPermissions.REFUND_PROCESS,
  
  'POST /api/admin/reports/:id/send-result-notification': AdminPermissions.REPORT_NOTIFY,
  
  'GET /api/admin/seller-debts': AdminPermissions.SELLER_DEBT_MANAGE,
  'GET /api/admin/seller-debts/:sellerId': AdminPermissions.SELLER_DEBT_MANAGE,
  
  'POST /api/admin/transfers/retry': AdminPermissions.TRANSFER_RETRY,
  
  'GET /api/admin/support/tickets': [SupportPermissions.TICKET_READ, AdminPermissions.USER_READ],
  'GET /api/admin/support/tickets/priority': [SupportPermissions.TICKET_READ, AdminPermissions.USER_READ],
  'POST /api/admin/support/tickets/:id/assign': SupportPermissions.TICKET_ASSIGN,
  'POST /api/admin/support/tickets/:id/close': SupportPermissions.TICKET_CLOSE,
  'POST /api/admin/support/tickets/:id/escalate': SupportPermissions.TICKET_ESCALATE,
  'POST /api/admin/support/tickets/:id/respond': SupportPermissions.TICKET_UPDATE,
  'POST /api/admin/support/tickets/:id/update-status': SupportPermissions.TICKET_UPDATE,
  
  'POST /api/admin/violation-penalties/deduct': AdminPermissions.VIOLATION_PENALTY,
  
  'GET /api/admin/monitoring/dashboard': AdminPermissions.MONITORING_DASHBOARD,
  
  'POST /api/admin/commissions/:id/settle': AdminPermissions.COMMISSION_SETTLE,
  
  'POST /api/admin/content-review/:id/approve': SupportPermissions.CONTENT_APPROVE,
  'POST /api/admin/content-review/:id/reject': SupportPermissions.CONTENT_REJECT,
  
  'POST /api/admin/deposits/:lotId/process-refund': AdminPermissions.REFUND_PROCESS,
  
  'GET /api/admin/identity-verification': AdminPermissions.IDENTITY_VERIFY,
  'POST /api/admin/identity-verification/:userId/review': AdminPermissions.IDENTITY_VERIFY,
  
  'POST /api/admin/fix-color-images-migration': AdminPermissions.DATA_MIGRATION,
}

// ============================================================================
// 导出便捷函数
// ============================================================================

/**
 * 检查用户是否有权限访问指定 API
 * @param role - 用户角色
 * @param method - HTTP 方法
 * @param path - API 路径
 * @returns boolean
 */
export function canAccessApi(role: Role, method: string, path: string): boolean {
  const key = `${method} ${path}`
  const required = ApiRoutePermissions[key]
  
  if (!required) {
    // 未定义的 API 默认允许访问（或者可以改为默认拒绝）
    return true
  }
  
  if (Array.isArray(required)) {
    return hasAnyPermission(role, required)
  }
  
  return hasPermission(role, required)
}
