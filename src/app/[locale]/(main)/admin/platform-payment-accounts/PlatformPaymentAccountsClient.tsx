/**
 * Platform payment accounts management – client UI.
 * Auth enforced by Server Component wrapper.
 */

'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/lib/hooks/useToast'
import {
  CreditCard,
  Wallet,
  Smartphone,
  Edit,
  Trash2,
  Loader2,
  CheckCircle,
  Power,
  XCircle,
} from 'lucide-react'
import { PlatformPaymentAccountForm } from '@/components/payments/PlatformPaymentAccountForm'

interface PlatformPaymentAccount {
  id: string
  account_type: 'stripe' | 'paypal' | 'alipay' | 'wechat'
  account_name: string | null
  account_info: any
  currency: string
  supported_currencies: string[]
  is_verified: boolean
  status: 'active' | 'disabled'
  disabled_at?: string
  disabled_by?: string
  enabled_at?: string
  enabled_by?: string
  created_at: string
}

const ACCOUNT_TYPE_INFO: Record<string, { nameKey?: string; name?: string; icon: any }> = {
  stripe: { name: 'Stripe', icon: CreditCard },
  paypal: { name: 'PayPal', icon: Wallet },
  alipay: { nameKey: 'providerAlipay', icon: Smartphone },
  wechat: { nameKey: 'providerWechat', icon: Smartphone },
}

export function PlatformPaymentAccountsClient() {
  const t = useTranslations('admin')
  const tCommon = useTranslations('common')
  const { toast } = useToast()
  const [accounts, setAccounts] = useState<PlatformPaymentAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingAccount, setEditingAccount] = useState<PlatformPaymentAccount | null>(null)
  const [selectedAccountType, setSelectedAccountType] = useState<'stripe' | 'paypal' | 'alipay' | 'wechat' | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  useEffect(() => {
    loadAccounts()
  }, [])

  const loadAccounts = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/platform-payment-accounts')
      if (!response.ok) throw new Error('Failed to load platform accounts')
      const data = await response.json()
      setAccounts(data.accounts || [])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('loadPlatformAccountsFailed')
      toast({ variant: 'destructive', title: tCommon('error'), description: msg })
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = (accountType: 'stripe' | 'paypal' | 'alipay' | 'wechat') => {
    setSelectedAccountType(accountType)
    setEditingAccount(null)
    setShowForm(true)
  }

  const handleEdit = (account: PlatformPaymentAccount) => {
    setEditingAccount(account)
    setSelectedAccountType(account.account_type)
    setShowForm(true)
  }

  const handleToggleStatus = async (account: PlatformPaymentAccount) => {
    const newStatus = account.status === 'active' ? 'disabled' : 'active'
    const action = newStatus === 'disabled' ? t('disable') : t('enable')
    const confirmMsg = newStatus === 'disabled' ? t('confirmDisablePlatformAccount') : t('confirmEnablePlatformAccount')
    if (!confirm(confirmMsg)) return
    setTogglingId(account.id)
    try {
      const response = await fetch(`/api/admin/platform-payment-accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || action)
      }
      toast({ variant: 'success', title: tCommon('success'), description: t('platformAccountUpdated', { action }) })
      loadAccounts()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : action
      toast({ variant: 'destructive', title: tCommon('error'), description: msg })
    } finally {
      setTogglingId(null)
    }
  }

  const handleFormSuccess = () => {
    setShowForm(false)
    setEditingAccount(null)
    setSelectedAccountType(null)
    loadAccounts()
  }

  const handleFormCancel = () => {
    setShowForm(false)
    setEditingAccount(null)
    setSelectedAccountType(null)
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (showForm && selectedAccountType) {
    return (
      <div className="mx-auto max-w-4xl">
        <PlatformPaymentAccountForm
          accountType={selectedAccountType}
          initialData={
            editingAccount
              ? {
                  id: editingAccount.id,
                  accountName: editingAccount.account_name || undefined,
                  accountInfo: editingAccount.account_info,
                  currency: editingAccount.currency,
                  supportedCurrencies: editingAccount.supported_currencies,
                }
              : undefined
          }
          onSuccess={handleFormSuccess}
          onCancel={handleFormCancel}
        />
      </div>
    )
  }

  const existingAccountTypes = accounts.filter((a) => a.status === 'active').map((a) => a.account_type)

  const getAccountTypeName = (type: string) => {
    const Info = ACCOUNT_TYPE_INFO[type]
    if (!Info) return type
    return Info.nameKey ? t(Info.nameKey) : (Info.name ?? type)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('platformPaymentAccounts')}</h1>
          <p className="mt-2 text-muted-foreground">{t('platformPaymentAccountsCardDesc')}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('addPlatformAccount')}</CardTitle>
          <CardDescription>{t('addPlatformAccountDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {(['stripe', 'paypal', 'alipay', 'wechat'] as const).map((type) => {
              const Info = ACCOUNT_TYPE_INFO[type]
              const Icon = Info.icon
              const exists = existingAccountTypes.includes(type)
              const name = getAccountTypeName(type)
              return (
                <Button
                  key={type}
                  variant={exists ? 'outline' : 'default'}
                  className="h-auto flex-col gap-2 py-6"
                  onClick={() => handleCreate(type)}
                  disabled={exists}
                >
                  <Icon className="h-6 w-6" />
                  <span>{name}</span>
                  {exists && (
                    <Badge variant="secondary" className="text-xs">
                      {t('configured')}
                    </Badge>
                  )}
                </Button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t('noPlatformAccounts')}</p>
            <p className="mt-2 text-sm text-muted-foreground">{t('addPlatformAccountHint')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {accounts.map((account) => {
            const Info = ACCOUNT_TYPE_INFO[account.account_type]
            const Icon = Info?.icon
            const name = getAccountTypeName(account.account_type)
            return (
              <Card key={account.id} className={account.status === 'disabled' ? 'opacity-60' : ''}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        {Icon && <Icon className="h-5 w-5" />}
                      </div>
                      <div>
                        <CardTitle>{account.account_name || name}</CardTitle>
                        <CardDescription>
                          {name} • {account.currency}
                          {account.supported_currencies.length > 1 && (
                            <span className="ml-2">({account.supported_currencies.join(', ')})</span>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {account.status === 'active' ? (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle className="h-3 w-3" />{t('statusEnabled')}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <XCircle className="h-3 w-3" />{t('statusDisabled')}
                        </Badge>
                      )}
                      {account.is_verified && account.status === 'active' && (
                        <Badge variant="outline" className="gap-1">
                          <CheckCircle className="h-3 w-3" />{t('verified')}
                        </Badge>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(account)}
                        disabled={account.status === 'disabled'}
                      >
                        <Edit className="mr-2 h-4 w-4" />{t('editLabel')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleStatus(account)}
                        disabled={togglingId === account.id}
                      >
                        {togglingId === account.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : account.status === 'active' ? (
                          <>
                            <Power className="mr-2 h-4 w-4" />{t('disable')}
                          </>
                        ) : (
                          <>
                            <Power className="mr-2 h-4 w-4" />{t('enable')}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    <p>{t('createdAtLabel')}: {new Date(account.created_at).toLocaleString()}</p>
                    <p className="mt-1">{t('accountType')}: {account.account_type}</p>
                    {account.status === 'disabled' && account.disabled_at && (
                      <p className="mt-1 text-orange-600">{t('disabledAt')}: {new Date(account.disabled_at).toLocaleString()}</p>
                    )}
                    {account.status === 'active' && account.enabled_at && (
                      <p className="mt-1 text-green-600">{t('enabledAt')}: {new Date(account.enabled_at).toLocaleString()}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
