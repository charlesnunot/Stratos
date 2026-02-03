'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import { createClient } from '@/lib/supabase/client'
import { PostCard } from '@/components/social/PostCard'
import { ProductCard } from '@/components/ecommerce/ProductCard'
import { Card } from '@/components/ui/card'
import { useTranslations } from 'next-intl'
import { sanitizeSearchQuery } from '@/lib/utils/search'

export default function SearchPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const qFromUrl = searchParams.get('q') ?? ''

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{
    posts: any[]
    products: any[]
    users: any[]
  }>({ posts: [], products: [], users: [] })
  const [loading, setLoading] = useState(false)
  const t = useTranslations('search')

  const doSearch = useCallback(async (safe: string) => {
    const client = createClient()
    setLoading(true)
    try {
      const { data: posts } = await client
          .from('posts')
          .select('*, user:profiles!posts_user_id_fkey(username, display_name, avatar_url)')
          .eq('status', 'approved')
          .ilike('content', `%${safe}%`)
        .limit(10)

      const { data: products } = await client
        .from('products')
          .select('*, seller:profiles!products_seller_id_fkey(username, display_name)')
          .eq('status', 'active')
        .or(`name.ilike.%${safe}%,description.ilike.%${safe}%`)
        .limit(10)

      const { data: users } = await client
        .from('profiles')
          .select('id, username, display_name, avatar_url')
        .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
        .limit(10)

      setResults({
        posts: posts || [],
        products: products || [],
        users: users || [],
      })
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setQuery(qFromUrl)
    const safe = sanitizeSearchQuery(qFromUrl)
    if (safe) doSearch(safe)
  }, [qFromUrl, doSearch])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    router.replace(`/search?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{t('pageTitle')}</h1>
      <form onSubmit={handleSearch} className="mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPostsProductsUsers')}
          className="w-full rounded-md border border-input bg-background px-4 py-2"
        />
      </form>

      {loading && <p>{t('searching')}</p>}

      {results.posts.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 text-xl font-semibold">{t('posts')}</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {results.posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </div>
      )}

      {results.products.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 text-xl font-semibold">{t('products')}</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {results.products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      )}

      {results.users.length > 0 && (
        <div>
          <h2 className="mb-4 text-xl font-semibold">{t('users')}</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {results.users.map((user) => (
              <Card key={user.id} className="p-4">
                <h3 className="font-semibold">{user.display_name}</h3>
                <p className="text-sm text-muted-foreground">@{user.username}</p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
