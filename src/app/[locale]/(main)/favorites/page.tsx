'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useFavorites, type FavoriteItemType } from '@/lib/hooks/useFavorites'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Star, Trash2, CheckSquare, Square } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { FavoriteItem } from '@/components/favorites/FavoriteItem'
import { showSuccess, showError } from '@/lib/utils/toast'

export default function FavoritesPage() {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const t = useTranslations('favorites')
  const tCommon = useTranslations('common')
  const [selectedType, setSelectedType] = useState<FavoriteItemType | undefined>(undefined)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { data: favorites, isLoading } = useFavorites(selectedType)

  const batchDeleteMutation = useMutation({
    mutationFn: async (favoriteIds: string[]) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('favorites')
        .delete()
        .in('id', favoriteIds)
        .eq('user_id', user.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites', user?.id] })
      setSelectedIds(new Set())
      showSuccess(t('removed'))
    },
    onError: () => {
      showError(tCommon('error'))
    },
  })

  const handleSelectAll = () => {
    if (selectedIds.size === favorites?.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(favorites?.map(f => f.id) || []))
    }
  }

  const handleToggleSelect = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 个收藏吗？`)) return
    batchDeleteMutation.mutate(Array.from(selectedIds))
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-7xl px-2 sm:px-4 py-12 text-center">
        <Card className="p-8">
          <p className="text-muted-foreground">{t('pleaseLogin')}</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-4">
      <div className="mb-6 flex items-center gap-2">
        <Star className="h-6 w-6" />
        <h1 className="text-2xl font-bold">{t('pageTitle')}</h1>
      </div>

      <Tabs value={selectedType || 'all'} onValueChange={(value) => {
        setSelectedType(value === 'all' ? undefined : value as FavoriteItemType)
        setSelectedIds(new Set()) // Clear selection when switching tabs
      }}>
        <TabsList className="mb-6">
          <TabsTrigger value="all">{t('filterAll')}</TabsTrigger>
          <TabsTrigger value="post">{t('filterPosts')}</TabsTrigger>
          <TabsTrigger value="product">{t('filterProducts')}</TabsTrigger>
          <TabsTrigger value="user">{t('filterUsers')}</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedType || 'all'}>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !favorites || favorites.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="mb-4 text-muted-foreground">
                {selectedType ? t('noFavoritesForType') : t('noFavorites')}
              </p>
              {!selectedType && (
                <p className="text-sm text-muted-foreground">
                  {t('discoverMessage')}
                </p>
              )}
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Batch Actions Bar */}
              {favorites && favorites.length > 0 && (
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSelectAll}
                      >
                        {selectedIds.size === favorites.length ? (
                          <CheckSquare className="h-4 w-4 mr-2" />
                        ) : (
                          <Square className="h-4 w-4 mr-2" />
                        )}
                        {selectedIds.size === favorites.length ? '取消全选' : '全选'}
                      </Button>
                      {selectedIds.size > 0 && (
                        <span className="text-sm text-muted-foreground">
                          已选择 {selectedIds.size} 项
                        </span>
                      )}
                    </div>
                    {selectedIds.size > 0 && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleBatchDelete}
                        disabled={batchDeleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        批量删除 ({selectedIds.size})
                      </Button>
                    )}
                  </div>
                </Card>
              )}

              {/* Favorites List */}
              <div className="space-y-4">
                {favorites.map((favorite) => (
                  <FavoriteItem
                    key={favorite.id}
                    favorite={favorite}
                    selected={selectedIds.has(favorite.id)}
                    onSelect={() => handleToggleSelect(favorite.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
