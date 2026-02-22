'use client'

import { Search, Filter, Plus, Menu, Check, FileText, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState, useEffect } from 'react'
import { useRouter, usePathname, Link } from '@/i18n/navigation'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Sidebar } from './Sidebar'
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function TopBar() {
  const [searchQuery, setSearchQuery] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const supabase = createClient()
  const t = useTranslations('common')
  const tSearch = useTranslations('search')
  const tPosts = useTranslations('posts')
  const tSeller = useTranslations('seller')

  const { data: sellerStatus } = useQuery({
    queryKey: ['sellerStatus', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data: profile } = await supabase
        .from('profiles')
        .select('seller_type')
        .eq('id', user.id)
        .single()
      if ((profile as { seller_type?: string } | null)?.seller_type === 'direct') return { direct: true }
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .eq('subscription_type', 'seller')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .limit(1)
        .maybeSingle()
      return sub ? { direct: false } : null
    },
    enabled: !!user,
  })
  const isSeller = !!sellerStatus

  // 阶段3：搜索页时从 URL 同步 q 到顶部栏输入框
  useEffect(() => {
    if (pathname === '/search') {
      const q = searchParams.get('q') ?? ''
      setSearchQuery(q)
    }
  }, [pathname, searchParams])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  const isFeed = pathname === '/feed'
  const isProducts = pathname === '/products'
  const isHome = !isFeed && !isProducts

  return (
    <>
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 w-full">
        <div className="flex h-14 md:h-16 items-center gap-2 md:gap-4 px-3 md:px-6 max-w-full overflow-x-hidden">
          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden flex-shrink-0"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="flex-1 relative min-w-0">
            <Search className="absolute left-2 md:left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={tSearch('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-full border border-input bg-background pl-8 md:pl-10 pr-3 md:pr-4 py-1.5 md:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </form>

          {/* Action Buttons */}
          <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
            <DropdownMenu open={filterOpen} onOpenChange={setFilterOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden sm:flex"
                  aria-haspopup="true"
                  aria-expanded={filterOpen}
                  aria-label={t('filter')}
                >
                  <Filter className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" role="menu">
                <DropdownMenuItem
                  onClick={() => {
                    router.push('/feed')
                    setFilterOpen(false)
                  }}
                  className={isFeed ? 'bg-accent' : ''}
                >
                  {isFeed && <Check className="mr-2 h-4 w-4" />}
                  <span className={isFeed ? '' : 'ml-6'}>{t('filterFeed')}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    router.push('/products')
                    setFilterOpen(false)
                  }}
                  className={isProducts ? 'bg-accent' : ''}
                >
                  {isProducts && <Check className="mr-2 h-4 w-4" />}
                  <span className={isProducts ? '' : 'ml-6'}>{t('filterProducts')}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    router.push('/')
                    setFilterOpen(false)
                  }}
                  className={isHome ? 'bg-accent' : ''}
                >
                  {isHome && <Check className="mr-2 h-4 w-4" />}
                  <span className={isHome ? '' : 'ml-6'}>{t('filterHome')}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <LanguageSwitcher />
            <DropdownMenu open={createMenuOpen} onOpenChange={setCreateMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="default"
                  aria-haspopup="true"
                  aria-expanded={createMenuOpen}
                  aria-label={tPosts('createPost')}
                >
                  <Plus className="h-4 w-4 md:h-5 md:w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" role="menu">
                <DropdownMenuItem asChild>
                  <Link href="/post/create" onClick={() => setCreateMenuOpen(false)}>
                    <FileText className="mr-2 h-4 w-4" />
                    {tPosts('createPost')}
                  </Link>
                </DropdownMenuItem>
                {isSeller && (
                  <DropdownMenuItem asChild>
                    <Link href="/seller/products/create" onClick={() => setCreateMenuOpen(false)}>
                      <Package className="mr-2 h-4 w-4" />
                      {tSeller('createProduct')}
                    </Link>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed left-0 top-0 h-full z-50 md:hidden">
            <Sidebar isMobile={true} onClose={() => setMobileMenuOpen(false)} />
          </div>
        </>
      )}
    </>
  )
}
