'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/lib/hooks/useToast'
import { UserPlus, Loader2, Users, Store, KeyRound } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useTranslations } from 'next-intl'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface InternalProfile {
  id: string
  username: string | null
  display_name: string | null
  user_origin: string | null
  role: string | null
  seller_type: string | null
  internal_tip_enabled?: boolean
  internal_affiliate_enabled?: boolean
  created_at: string
  email?: string | null
}

export function AdminInternalUsersClient() {
  const { toast } = useToast()
  const t = useTranslations('admin')
  const [profiles, setProfiles] = useState<InternalProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<'user' | 'seller'>('user')
  const [sellerType, setSellerType] = useState<'direct' | 'external'>('direct')
  const [loginEmail, setLoginEmail] = useState('')
  const [initialPassword, setInitialPassword] = useState('')
  const [settingSellerId, setSettingSellerId] = useState<string | null>(null)
  const [tipAffiliateUpdating, setTipAffiliateUpdating] = useState<string | null>(null)
  const [setPasswordUserId, setSetPasswordUserId] = useState<string | null>(null)
  const [setPasswordValue, setSetPasswordValue] = useState('')
  const [setPasswordLoading, setSetPasswordLoading] = useState(false)

  const handleTipAffiliate = async (profileId: string, internal_tip_enabled?: boolean, internal_affiliate_enabled?: boolean) => {
    setTipAffiliateUpdating(profileId)
    try {
      const res = await fetch(`/api/admin/internal-users/${profileId}/tip-affiliate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internal_tip_enabled, internal_affiliate_enabled }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update')
      toast({ title: t('successTitle'), description: t('internalUsersTipAffiliateUpdated') })
      load()
    } catch (e) {
      toast({ variant: 'destructive', title: t('errorTitle'), description: e instanceof Error ? e.message : 'Failed to update' })
    } finally {
      setTipAffiliateUpdating(null)
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/internal-users')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('internalUsersLoadFailed'))
      setProfiles(Array.isArray(data) ? data : [])
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: t('internalUsersLoadFailed'), description: e instanceof Error ? e.message : t('internalUsersLoadFailed') })
      setProfiles([])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleCreate = async () => {
    if (!displayName.trim()) {
      toast({ variant: 'destructive', title: t('errorTitle'), description: t('internalUsersFormRequired') })
      return
    }
    const hasEmail = !!loginEmail.trim()
    const hasPassword = !!initialPassword
    if (hasEmail !== hasPassword) {
      toast({ variant: 'destructive', title: t('errorTitle'), description: t('internalUsersEmailPasswordRequired') })
      return
    }
    if (hasPassword && initialPassword.length < 8) {
      toast({ variant: 'destructive', title: t('errorTitle'), description: t('internalUsersEmailPasswordRequired') })
      return
    }
    setCreating(true)
    try {
      const body: Record<string, unknown> = {
        display_name: displayName.trim(),
        role: role === 'seller' ? 'seller' : 'user',
        seller_type: role === 'seller' ? sellerType : undefined,
        intent: 'cold_start',
      }
      if (hasEmail) {
        body.email = loginEmail.trim()
        body.password = initialPassword
      }
      const res = await fetch('/api/admin/internal-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('internalUsersCreateFailed'))
      toast({ title: t('successTitle'), description: hasEmail ? t('internalUsersCreatedWithLogin') : t('internalUsersCreated') })
      setDialogOpen(false)
      setDisplayName('')
      setRole('user')
      setSellerType('direct')
      setLoginEmail('')
      setInitialPassword('')
      load()
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: t('errorTitle'), description: e instanceof Error ? e.message : t('internalUsersCreateFailed') })
    } finally {
      setCreating(false)
    }
  }

  const handleSetPassword = async () => {
    if (!setPasswordUserId || setPasswordValue.length < 8) {
      toast({ variant: 'destructive', title: t('errorTitle'), description: t('internalUsersEmailPasswordRequired') })
      return
    }
    setSetPasswordLoading(true)
    try {
      const res = await fetch(`/api/admin/internal-users/${setPasswordUserId}/set-password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: setPasswordValue }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('internalUsersSetPasswordFailed'))
      toast({ title: t('successTitle'), description: t('internalUsersSetPasswordSuccess') })
      setSetPasswordUserId(null)
      setSetPasswordValue('')
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: t('errorTitle'), description: e instanceof Error ? e.message : t('internalUsersSetPasswordFailed') })
    } finally {
      setSetPasswordLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('internalUsersTitle')}</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              {t('internalUsersCreateButton')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('internalUsersCreateTitle')}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div>
                <Label htmlFor="display_name">{t('internalUsersDisplayName')}</Label>
                <Input
                  id="display_name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('internalUsersDisplayNamePlaceholder')}
                />
              </div>
              <div>
                <Label>{t('internalUsersRole')}</Label>
                <Select value={role} onValueChange={(v) => setRole(v as 'user' | 'seller')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">{t('internalUsersRoleUser')}</SelectItem>
                    <SelectItem value="seller">{t('internalUsersRoleSeller')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {role === 'seller' && (
                <div>
                  <Label>{t('internalUsersSellerType')}</Label>
                  <Select value={sellerType} onValueChange={(v) => setSellerType(v as 'direct' | 'external')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="direct">{t('internalUsersSellerTypeDirect')}</SelectItem>
                      <SelectItem value="external">{t('internalUsersSellerTypeExternal')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label htmlFor="login_email">{t('internalUsersLoginEmail')}</Label>
                <Input
                  id="login_email"
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder={t('internalUsersLoginEmailPlaceholder')}
                />
              </div>
              <div>
                <Label htmlFor="initial_password">{t('internalUsersInitialPassword')}</Label>
                <Input
                  id="initial_password"
                  type="password"
                  autoComplete="new-password"
                  value={initialPassword}
                  onChange={(e) => setInitialPassword(e.target.value)}
                  placeholder={t('internalUsersInitialPasswordPlaceholder')}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {t('internalUsersDescription')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('internalUsersEnableLoginHint')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('internalUsersUsernameAutoGenerated')}
              </p>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('internalUsersCreateConfirm')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!setPasswordUserId} onOpenChange={(open) => { if (!open) { setSetPasswordUserId(null); setSetPasswordValue('') } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('internalUsersSetPassword')}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div>
                <Label htmlFor="set_password_input">{t('internalUsersInitialPassword')}</Label>
                <Input
                  id="set_password_input"
                  type="password"
                  autoComplete="new-password"
                  value={setPasswordValue}
                  onChange={(e) => setSetPasswordValue(e.target.value)}
                  placeholder={t('internalUsersInitialPasswordPlaceholder')}
                />
              </div>
              <Button onClick={handleSetPassword} disabled={setPasswordLoading || setPasswordValue.length < 8}>
                {setPasswordLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('internalUsersSetPassword')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('internalUsersListTitle')}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t('internalUsersListDescription')}
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">{t('internalUsersLoading')}</p>
          ) : profiles.length === 0 ? (
            <p className="text-muted-foreground">{t('internalUsersEmpty')}</p>
          ) : (
            <ul className="space-y-3">
              {profiles.map((p) => {
                const isDirectSeller = p.role === 'seller' && p.seller_type === 'direct'
                return (
                  <li key={p.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <span className="font-medium">{p.display_name || p.username || p.id}</span>
                      {p.username && (
                        <span className="ml-2 text-muted-foreground">@{p.username}</span>
                      )}
                      <div className="flex gap-2 mt-1">
                        <Badge variant="secondary">内部</Badge>
                        {p.role && <Badge variant="outline">{p.role}</Badge>}
                        {p.seller_type && <Badge variant="outline">{p.seller_type}</Badge>}
                      </div>
                      {p.email && (
                        <p className="text-xs text-muted-foreground mt-1">{t('internalUsersLoginEmail')}: {p.email}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setSetPasswordUserId(p.id); setSetPasswordValue('') }}
                      >
                        <KeyRound className="h-4 w-4" />
                        {t('internalUsersSetPassword')}
                      </Button>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 text-sm">
                          <input
                            type="checkbox"
                            checked={!!p.internal_tip_enabled}
                            disabled={tipAffiliateUpdating === p.id}
                            onChange={(e) => handleTipAffiliate(p.id, e.target.checked, !!p.internal_affiliate_enabled)}
                          />
                          {t('internalUsersTip')}
                        </label>
                        <label className="flex items-center gap-1.5 text-sm">
                          <input
                            type="checkbox"
                            checked={!!p.internal_affiliate_enabled}
                            disabled={tipAffiliateUpdating === p.id}
                            onChange={(e) => handleTipAffiliate(p.id, !!p.internal_tip_enabled, e.target.checked)}
                          />
                          {t('internalUsersAffiliate')}
                        </label>
                      </div>
                      {!isDirectSeller && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!!settingSellerId}
                          onClick={async () => {
                            setSettingSellerId(p.id)
                            try {
                              const res = await fetch(`/api/admin/internal-users/${p.id}/set-direct-seller`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                              })
                              const data = await res.json()
                              if (!res.ok) throw new Error(data.error || t('internalUsersSetDirectSellerFailed'))
                              toast({ title: t('successTitle'), description: t('internalUsersSetDirectSellerSuccess') })
                              load()
                            } catch (e) {
                              toast({ variant: 'destructive', title: t('errorTitle'), description: e instanceof Error ? e.message : t('internalUsersSetDirectSellerFailed') })
                            } finally {
                              setSettingSellerId(null)
                            }
                          }}
                        >
                          {settingSellerId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
                          {t('internalUsersSetDirectSeller')}
                        </Button>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
