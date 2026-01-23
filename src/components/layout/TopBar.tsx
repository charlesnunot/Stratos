'use client'

import { Search, Filter, Plus, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { Sidebar } from './Sidebar'
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher'

export function TopBar() {
  const [searchQuery, setSearchQuery] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const router = useRouter()
  const t = useTranslations('common')
  const tSearch = useTranslations('search')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

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
            <Button variant="ghost" size="icon" className="hidden sm:flex">
              <Filter className="h-5 w-5" />
            </Button>
            <LanguageSwitcher />
            <Button size="icon" onClick={() => router.push('/post/create')}>
              <Plus className="h-4 w-4 md:h-5 md:w-5" />
            </Button>
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
