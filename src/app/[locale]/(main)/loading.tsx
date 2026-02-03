import { Loader2 } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

export default async function Loading() {
  const t = await getTranslations('common')
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      </div>
    </div>
  )
}
