'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Link } from '@/i18n/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Users, Plus } from 'lucide-react'
import { useAuth } from '@/lib/hooks/useAuth'
import { useTranslations } from 'next-intl'

export default function GroupsPage() {
  const supabase = createClient()
  const { user } = useAuth()
  const t = useTranslations('groups')

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['communityGroups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_groups')
        .select('id, name, slug, description, member_count, cover_url')
        .order('member_count', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        {user && (
          <Link href="/groups/create">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t('createGroup')}
            </Button>
          </Link>
        )}
      </div>
      <p className="text-muted-foreground">{t('description')}</p>
      {groups.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          {t('noGroups')}
          {user && (
            <Link href="/groups/create" className="mt-4 inline-block">
              <Button variant="outline">{t('createFirst')}</Button>
            </Link>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <Link key={g.id} href={`/groups/${g.slug}`}>
              <Card className="overflow-hidden transition-shadow hover:shadow-lg">
                {g.cover_url ? (
                  <div className="aspect-video bg-muted">
                    <img src={g.cover_url} alt={g.name} className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-muted">
                    <Users className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}
                <div className="p-4">
                  <h3 className="font-semibold">{g.name}</h3>
                  {g.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{g.description}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">{g.member_count ?? 0} {t('members')}</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
