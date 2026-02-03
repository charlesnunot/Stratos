'use client'

import { Link } from '@/i18n/navigation'
import { usePathname } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/hooks/useAuth'
import { useProfile } from '@/lib/hooks/useProfile'
import { 
  Home, 
  Clock, 
  Users, 
  BarChart3, 
  MessageSquare, 
  Bell,
  User,
  LogOut,
  ShoppingBag,
  ShoppingCart,
  X,
  ChevronRight,
  MoreVertical,
  HelpCircle,
  Settings,
  Info,
  Store,
  Package,
  Shield
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from '@/i18n/navigation'
import { useEffect, useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { WelcomeCard } from './WelcomeCard'
import { useCartStore } from '@/store/cartStore'

interface SidebarProps {
  isMobile?: boolean
  onClose?: () => void
}

// 格式化最后上线日期（使用 common 的 time* 键）
function formatLastSeen(
  date: Date | null,
  t: (key: string, values?: Record<string, number>) => string
): string {
  if (!date) return t('timeNeverOnline')

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return t('timeJustNowOnline')
  if (diffMins < 60) return t('timeMinutesAgo', { count: diffMins })
  if (diffHours < 24) return t('timeHoursAgo', { count: diffHours })
  if (diffDays === 1) return t('yesterday')
  if (diffDays < 7) return t('timeDaysAgo', { count: diffDays })

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function Sidebar({ isMobile = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations('navigation')
  const tCommon = useTranslations('common')
  const tAuth = useTranslations('auth')
  const tProfile = useTranslations('profile')
  const tMenu = useTranslations('menu')
  const tAdmin = useTranslations('admin')
  
  // 获取用户资料
  const { data: profileResult } = useProfile(user?.id || '')
  const profile = profileResult?.profile

  // 卖家身份以 subscriptions 为准（与首页、useSellerGuard 一致），不依赖 profile.subscription_type
  const { data: sellerSubscription } = useQuery({
    queryKey: ['sellerSubscription', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .eq('subscription_type', 'seller')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .limit(1)
        .maybeSingle()
      return data
    },
    enabled: !!user,
  })
  
  // 获取最后登录时间
  const [lastSeen, setLastSeen] = useState<Date | null>(null)
  
  // 未读通知数量
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0)
  
  // 购物车商品数量
  const cartItems = useCartStore((state) => state.items)
  const cartItemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)
  
  // 更多菜单状态
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)
  
  useEffect(() => {
    if (!user) return
    
    let mounted = true
    
    supabase.auth.getUser()
      .then(({ data, error }) => {
        if (!mounted) return
        
        // 忽略 AbortError
        if (error) {
          const errorMessage = error.message || ''
          const errorName = (error as any)?.name || ''
          
          if (
            errorName === 'AbortError' ||
            errorMessage.includes('aborted') ||
            errorMessage.includes('cancelled') ||
            errorMessage === 'signal is aborted without reason'
          ) {
            return
          }
          
          console.error('getUser error:', error)
          return
        }
        
        if (data.user?.last_sign_in_at) {
          setLastSeen(new Date(data.user.last_sign_in_at))
        }
      })
      .catch((err: any) => {
        if (!mounted) return
        
        // 忽略 AbortError
        if (
          err?.name === 'AbortError' ||
          err?.message?.includes('aborted') ||
          err?.message?.includes('cancelled') ||
          err?.message === 'signal is aborted without reason'
        ) {
          return
        }
        
        console.error('getUser catch error:', err)
      })
    
    return () => {
      mounted = false
    }
  }, [user, supabase])

  // 加载和订阅未读通知数量
  useEffect(() => {
    if (!user) return

    const loadUnreadCount = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)

      setUnreadNotificationCount(count || 0)
    }

    loadUnreadCount()

    // Subscribe to notification updates
    const channel = supabase
      .channel(`sidebar-notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadUnreadCount()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, supabase])

  // 计算菜单位置
  useEffect(() => {
    if (isMoreMenuOpen && moreMenuRef.current) {
      const updatePosition = () => {
        if (moreMenuRef.current) {
          const rect = moreMenuRef.current.getBoundingClientRect()
          const viewportHeight = window.innerHeight
          const viewportWidth = window.innerWidth
          
          // 估算菜单高度（5个菜单项，每个约40px，加上padding约220px）
          const estimatedMenuHeight = 220
          const menuWidth = 200
          
          let top = rect.top
          let left = rect.right + 8
          
          // 检查是否会溢出底部
          const wouldOverflowBottom = top + estimatedMenuHeight > viewportHeight
          
          // 检查右侧空间是否足够
          const wouldOverflowRight = left + menuWidth > viewportWidth
          
          if (wouldOverflowBottom) {
            // 如果会溢出底部，尝试显示在按钮上方
            const spaceAbove = rect.top
            if (spaceAbove >= estimatedMenuHeight) {
              // 上方空间足够，显示在上方
              top = rect.top - estimatedMenuHeight
            } else {
              // 上方空间不足，显示在侧边栏内部（按钮左侧）
              top = rect.top
              left = rect.left - menuWidth - 8
              // 如果左侧也会溢出，则显示在按钮上方，但限制最大高度
              if (left < 0) {
                left = rect.right + 8
                top = Math.max(8, viewportHeight - estimatedMenuHeight - 8)
              }
            }
          } else if (wouldOverflowRight) {
            // 如果右侧空间不足，显示在侧边栏内部（按钮左侧）
            left = rect.left - menuWidth - 8
            // 如果左侧也会溢出，则尽量靠右显示
            if (left < 0) {
              left = Math.max(8, viewportWidth - menuWidth - 8)
            }
          }
          
          setMenuPosition({
            top,
            left,
          })
        }
      }

      updatePosition()
      window.addEventListener('resize', updatePosition)
      window.addEventListener('scroll', updatePosition, true)

      return () => {
        window.removeEventListener('resize', updatePosition)
        window.removeEventListener('scroll', updatePosition, true)
      }
    } else {
      setMenuPosition(null)
    }
  }, [isMoreMenuOpen])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
    if (onClose) onClose()
  }

  const handleLinkClick = () => {
    if (isMobile && onClose) {
      onClose()
    }
  }

  // 检查是否为卖家（有效 seller 订阅，与 useSellerGuard / 首页一致）
  const isSeller = !!sellerSubscription

  // 检查是否为管理员或支持人员
  const isAdmin = profile?.role === 'admin' || profile?.role === 'support'
  
  // 基础导航项
  const navItems = [
    { href: '/', icon: Home, label: t('home') },
    { href: '/feed', icon: Clock, label: t('feed') },
    { href: '/products', icon: ShoppingBag, label: t('products') },
    { href: '/cart', icon: ShoppingCart, label: t('cart') },
    { href: '/following', icon: Users, label: t('following') },
    { href: '/groups', icon: Users, label: t('groups') },
    { href: '/insights', icon: BarChart3, label: t('insights') },
    { href: '/messages', icon: MessageSquare, label: t('messages') },
    { href: '/notifications', icon: Bell, label: t('notifications') },
  ]
  
  if (isAdmin) {
    navItems.push(
      { href: '/admin/dashboard', icon: Shield, label: tAdmin('sidebarLabel') },
      { href: '/admin/community', icon: Users, label: tAdmin('communityOps') }
    )
  }
  
  // 如果是卖家，添加卖家相关导航
  if (isSeller) {
    navItems.push(
      { href: '/seller/dashboard', icon: Store, label: tProfile('sellerCenter') },
      { href: '/seller/products', icon: Package, label: tProfile('myProducts') },
      { href: '/seller/orders', icon: ShoppingCart, label: tProfile('myOrders') }
    )
  }

  return (
    <aside className={`${isMobile ? 'flex' : 'hidden md:flex'} fixed left-0 top-0 h-screen w-64 bg-background p-4 z-50`}>
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="mb-8 flex items-center justify-between gap-2">
          <Link
            href="/"
            onClick={handleLinkClick}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity min-w-0"
            aria-label="Stratos Home"
          >
            {/* 再 ×1.3：128px→166px，426px→554px */}
            <img
              src="/logo.png"
              alt="Stratos"
              className="h-[166px] w-auto max-w-[554px] object-contain"
            />
          </Link>
          {isMobile && onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="md:hidden"
            >
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            const isNotification = item.href === '/notifications'
            const isCart = item.href === '/cart'
            const showNotificationBadge = isNotification && unreadNotificationCount > 0
            const showCartBadge = isCart && cartItemCount > 0
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleLinkClick}
                className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-colors relative ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
                {showNotificationBadge && (
                  <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                    {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                  </span>
                )}
                {showCartBadge && (
                  <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                    {cartItemCount > 9 ? '9+' : cartItemCount}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* User Profile */}
        {user && (
          <div className="pt-4">
            <Link
              href={`/profile/${user.id}`}
              onClick={handleLinkClick}
              className="flex items-center gap-3 rounded-lg px-4 py-3 hover:bg-accent"
            >
              {/* 左侧圆形头像 */}
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name || profile.username || tCommon('user')}
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <span className="text-sm font-semibold">
                    {profile?.display_name?.[0] || profile?.username?.[0] || 'U'}
                  </span>
                </div>
              )}
              
              {/* 中间两行文字 */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {profile?.display_name || profile?.username || tCommon('user')}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {formatLastSeen(lastSeen, (k, v) => tCommon(k, v as Record<string, number>))}
                </p>
              </div>
              
              {/* 右侧箭头图标 */}
              <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            </Link>
          </div>
        )}

        {/* Welcome Card for Guest Users */}
        {!user && <WelcomeCard />}

        {/* 更多菜单 */}
        <div className="pt-2">
          <div className="relative" ref={moreMenuRef}>
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
            >
              <MoreVertical className="mr-2 h-4 w-4" />
              {tMenu('more')}
            </Button>

            {isMoreMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-[90]"
                  onClick={() => setIsMoreMenuOpen(false)}
                />
                {menuPosition && (
                  <Card 
                    className="fixed z-[100] min-w-[200px] p-2 shadow-lg"
                    style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
                  >
                    <div className="space-y-1">
                      {/* 关于Stratos */}
                      <Link
                        href="/about"
                        onClick={() => {
                          setIsMoreMenuOpen(false)
                          handleLinkClick()
                        }}
                        className="flex items-center justify-between w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                      >
                        <div className="flex items-center gap-2">
                          <Info className="h-4 w-4" />
                          <span>{tMenu('about')}</span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </Link>

                      {/* 隐私政策 */}
                      <Link
                        href="/privacy"
                        onClick={() => {
                          setIsMoreMenuOpen(false)
                          handleLinkClick()
                        }}
                        className="flex items-center justify-between w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                      >
                        <div className="flex items-center gap-2">
                          <Info className="h-4 w-4" />
                          <span>{tMenu('privacyPolicy')}</span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </Link>

                      {/* 平台政策 */}
                      <Link
                        href="/policies"
                        onClick={() => {
                          setIsMoreMenuOpen(false)
                          handleLinkClick()
                        }}
                        className="flex items-center justify-between w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                      >
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          <span>{tMenu('platformPolicies')}</span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </Link>

                      {/* 帮助与客服 */}
                      <Link
                        href="/help"
                        onClick={() => {
                          setIsMoreMenuOpen(false)
                          handleLinkClick()
                        }}
                        className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                      >
                        <HelpCircle className="mr-2 h-4 w-4" />
                        <span>{tMenu('help')}</span>
                      </Link>

                      {/* 客服工单 */}
                      <Link
                        href="/support/tickets"
                        onClick={() => {
                          setIsMoreMenuOpen(false)
                          handleLinkClick()
                        }}
                        className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                      >
                        <MessageSquare className="mr-2 h-4 w-4" />
                        <span>{tMenu('supportTickets')}</span>
                      </Link>

                      {/* 设置 */}
                      <Link
                        href="/settings"
                        onClick={() => {
                          setIsMoreMenuOpen(false)
                          handleLinkClick()
                        }}
                        className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                      >
                        <Settings className="mr-2 h-4 w-4" />
                        <span>{tMenu('settings')}</span>
                      </Link>

                      {/* 退出登录（如果已登录）或登录/注册（如果未登录） */}
                      {user ? (
                        <button
                          onClick={() => {
                            setIsMoreMenuOpen(false)
                            handleLogout()
                          }}
                          className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent text-destructive"
                        >
                          <LogOut className="mr-2 h-4 w-4" />
                          <span>{tAuth('logout')}</span>
                        </button>
                      ) : (
                        <Link
                          href={
                            pathname &&
                            !pathname.startsWith('/login') &&
                            !pathname.startsWith('/register')
                              ? `/login?redirect=${encodeURIComponent(pathname)}`
                              : '/login'
                          }
                          onClick={() => {
                            setIsMoreMenuOpen(false)
                            handleLinkClick()
                          }}
                          className="flex items-center w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
                        >
                          <User className="mr-2 h-4 w-4" />
                          <span>{tMenu('loginOrRegister')}</span>
                        </Link>
                      )}
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
