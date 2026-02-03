'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useTranslations } from 'next-intl'
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { Link } from '@/i18n/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  User,
  MapPin,
  Bell,
  Shield,
  HelpCircle,
  MessageSquare,
  ChevronRight,
  Languages,
  Lock,
  BadgeCheck,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { IdCardImageUpload } from '@/components/settings/IdCardImageUpload'
import type { UserSettings } from '@/app/api/settings/route'

const DEFAULT_SETTINGS: UserSettings = {
  profile_visibility: 'public',
  who_can_message: 'everyone',
  who_can_comment: 'everyone',
  email_messages: true,
  email_likes: true,
  email_comments: true,
  email_follows: true,
  email_orders: true,
  email_marketing: false,
}

export default function SettingsPage() {
  const t = useTranslations('settings')
  const tMenu = useTranslations('menu')
  const tCommon = useTranslations('common')
  const tAuth = useTranslations('auth')
  const { user } = useAuth()
  const { toast } = useToast()
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [privacyDirty, setPrivacyDirty] = useState(false)
  const [notifDirty, setNotifDirty] = useState(false)

  // Password form
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  // Identity verification
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'verified' | 'rejected' | null>(null)
  const [verificationLoading, setVerificationLoading] = useState(true)
  const [realName, setRealName] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [idCardFrontPath, setIdCardFrontPath] = useState<string | null>(null)
  const [idCardBackPath, setIdCardBackPath] = useState<string | null>(null)
  const [submitVerificationLoading, setSubmitVerificationLoading] = useState(false)
  const [verificationError, setVerificationError] = useState<string | null>(null)

  // Delete account (deletion request flow)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deletionRequest, setDeletionRequest] = useState<{
    id: string
    status: string
    blocking_summary?: Record<string, unknown>
    rejected_reason?: string | null
    reviewed_at?: string | null
    created_at: string
  } | null>(null)
  const [deletionRequestLoading, setDeletionRequestLoading] = useState(false)

  const loadSettings = useCallback(async () => {
    if (!user) return
    setSettingsLoading(true)
    try {
      const res = await fetch('/api/settings')
      if (res.ok) {
        const data = await res.json()
        setSettings(data)
      } else {
        setSettings(DEFAULT_SETTINGS)
      }
    } catch {
      setSettings(DEFAULT_SETTINGS)
    } finally {
      setSettingsLoading(false)
    }
  }, [user])

  const loadVerification = useCallback(async () => {
    if (!user) return
    setVerificationLoading(true)
    try {
      const res = await fetch('/api/identity-verification')
      if (res.ok) {
        const data = await res.json()
        setVerificationStatus(data.status ?? null)
        if (data.verification?.realName) setRealName(data.verification.realName)
      }
    } catch {
      setVerificationStatus(null)
    } finally {
      setVerificationLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  useEffect(() => {
    loadVerification()
  }, [loadVerification])

  const handleSavePrivacyAndNotif = async () => {
    if (!user) return
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to save')
      }
      setPrivacyDirty(false)
      setNotifDirty(false)
      toast({ title: t('saved') })
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('saveFailed'),
        description: e instanceof Error ? e.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  const handlePrivacyChange = (key: keyof UserSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    setPrivacyDirty(true)
  }

  const handleNotifChange = (key: keyof UserSettings, value: boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    setNotifDirty(true)
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError(null)
    if (newPassword !== confirmPassword) {
      setPasswordError(tAuth('passwordMismatch'))
      return
    }
    if (!user?.email) {
      setPasswordError('仅支持邮箱账号修改密码')
      return
    }
    setPasswordLoading(true)
    try {
      const supabase = createClient()
      if (currentPassword.trim()) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        })
        if (signInError) {
          setPasswordError(tAuth('invalidCredentials') || signInError.message)
          setPasswordLoading(false)
          return
        }
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      toast({ title: t('passwordUpdated') })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : t('saveFailed'))
    } finally {
      setPasswordLoading(false)
    }
  }

  const handleSubmitVerification = async (e: React.FormEvent) => {
    e.preventDefault()
    setVerificationError(null)
    if (!realName.trim()) {
      setVerificationError(t('realName') + ' is required')
      return
    }
    const idTrim = idNumber.trim().replace(/\s/g, '')
    if (idTrim.length !== 15 && idTrim.length !== 18) {
      setVerificationError(t('idNumber') + ' must be 15 or 18 digits')
      return
    }
    if (!idCardFrontPath || !idCardBackPath) {
      setVerificationError(t('idCardFront') + ' / ' + t('idCardBack') + ' required')
      return
    }
    setSubmitVerificationLoading(true)
    try {
      const res = await fetch('/api/identity-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          real_name: realName.trim(),
          id_number: idTrim,
          id_card_front_path: idCardFrontPath,
          id_card_back_path: idCardBackPath,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to submit')
      setVerificationStatus('pending')
      toast({ title: t('submitVerification'), description: t('verificationPending') })
    } catch (err: unknown) {
      setVerificationError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSubmitVerificationLoading(false)
    }
  }

  const loadDeletionRequest = useCallback(async () => {
    if (!user) return
    setDeletionRequestLoading(true)
    try {
      const res = await fetch('/api/account/deletion-request')
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.request) setDeletionRequest(data.request)
      else setDeletionRequest(null)
    } catch {
      setDeletionRequest(null)
    } finally {
      setDeletionRequestLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (user) loadDeletionRequest()
  }, [user, loadDeletionRequest])

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setDeleteError(null)
    if (!deletePassword.trim()) {
      setDeleteError(tAuth('password') + ' is required')
      return
    }
    const confirmLower = deleteConfirm.trim().toLowerCase()
    if (confirmLower !== 'delete' && deleteConfirm.trim() !== '注销') {
      setDeleteError(t('deleteAccountConfirmLabel'))
      return
    }
    setDeleteLoading(true)
    try {
      const res = await fetch('/api/account/deletion-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: deletePassword,
          confirm: deleteConfirm.trim(),
          reason: deleteReason.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed')
      toast({
        title: t('deleteAccountSubmitSuccess'),
        description: t('deleteAccountPendingReview'),
      })
      setDeleteDialogOpen(false)
      setDeletePassword('')
      setDeleteConfirm('')
      setDeleteReason('')
      loadDeletionRequest()
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setDeleteLoading(false)
    }
  }

  const accountLinks = [
    {
      href: user ? `/profile/${user.id}/edit` : '/login',
      label: t('profile'),
      description: t('profileDescription'),
      icon: User,
    },
    {
      href: user ? '/profile/addresses' : '/login',
      label: t('addresses'),
      description: t('addressesDescription'),
      icon: MapPin,
    },
    {
      href: user ? '/notifications' : '/login',
      label: t('notifications'),
      description: t('notificationsDescription'),
      icon: Bell,
    },
  ]

  const otherLinks = [
    { href: '/privacy', label: t('privacy'), description: t('privacyDescription'), icon: Shield },
    { href: '/help', label: t('help'), description: t('helpDescription'), icon: HelpCircle },
    {
      href: '/support/tickets',
      label: t('supportTickets'),
      description: t('supportTicketsDescription'),
      icon: MessageSquare,
    },
  ]

  return (
    <div className="mx-auto max-w-3xl px-2 sm:px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold">{t('title')}</h1>

      {/* Language */}
      <Card className="mb-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Languages className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="font-semibold">{t('language')}</h2>
              <p className="text-sm text-muted-foreground">{t('languageDescription')}</p>
            </div>
          </div>
          <LanguageSwitcher />
        </div>
      </Card>

      {/* Privacy & Notification (only when logged in) */}
      {user && (
        <>
          <h2 className="mb-3 text-lg font-semibold">{t('privacySettings')}</h2>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">{t('privacySettings')}</CardTitle>
              <CardDescription>{t('privacySettingsDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {settingsLoading ? (
                <p className="text-sm text-muted-foreground">{tCommon('loading')}</p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>{t('profileVisibility')}</Label>
                    <p className="text-xs text-muted-foreground">{t('profileVisibilityDescription')}</p>
                    <Select
                      value={settings.profile_visibility}
                      onValueChange={(v) => handlePrivacyChange('profile_visibility', v)}
                    >
                      <SelectTrigger className="w-full max-w-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="public">{t('profileVisibilityPublic')}</SelectItem>
                        <SelectItem value="followers">{t('profileVisibilityFollowers')}</SelectItem>
                        <SelectItem value="private">{t('profileVisibilityPrivate')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('whoCanMessage')}</Label>
                    <p className="text-xs text-muted-foreground">{t('whoCanMessageDescription')}</p>
                    <Select
                      value={settings.who_can_message}
                      onValueChange={(v) => handlePrivacyChange('who_can_message', v)}
                    >
                      <SelectTrigger className="w-full max-w-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="everyone">{t('whoEveryone')}</SelectItem>
                        <SelectItem value="followers">{t('whoFollowers')}</SelectItem>
                        <SelectItem value="nobody">{t('whoNobody')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('whoCanComment')}</Label>
                    <p className="text-xs text-muted-foreground">{t('whoCanCommentDescription')}</p>
                    <Select
                      value={settings.who_can_comment}
                      onValueChange={(v) => handlePrivacyChange('who_can_comment', v)}
                    >
                      <SelectTrigger className="w-full max-w-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="everyone">{t('whoEveryone')}</SelectItem>
                        <SelectItem value="followers">{t('whoFollowers')}</SelectItem>
                        <SelectItem value="nobody">{t('whoNobody')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <h2 className="mb-3 text-lg font-semibold">{t('notificationSettings')}</h2>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">{t('notificationSettings')}</CardTitle>
              <CardDescription>{t('notificationSettingsDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {settingsLoading ? (
                <p className="text-sm text-muted-foreground">{tCommon('loading')}</p>
              ) : (
                <div className="flex flex-col gap-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={settings.email_messages}
                      onCheckedChange={(v) => handleNotifChange('email_messages', !!v)}
                    />
                    <span className="text-sm">{t('emailMessages')}</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={settings.email_likes}
                      onCheckedChange={(v) => handleNotifChange('email_likes', !!v)}
                    />
                    <span className="text-sm">{t('emailLikes')}</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={settings.email_comments}
                      onCheckedChange={(v) => handleNotifChange('email_comments', !!v)}
                    />
                    <span className="text-sm">{t('emailComments')}</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={settings.email_follows}
                      onCheckedChange={(v) => handleNotifChange('email_follows', !!v)}
                    />
                    <span className="text-sm">{t('emailFollows')}</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={settings.email_orders}
                      onCheckedChange={(v) => handleNotifChange('email_orders', !!v)}
                    />
                    <span className="text-sm">{t('emailOrders')}</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={settings.email_marketing}
                      onCheckedChange={(v) => handleNotifChange('email_marketing', !!v)}
                    />
                    <span className="text-sm">{t('emailMarketing')}</span>
                  </label>
                </div>
              )}
            </CardContent>
          </Card>

          {(privacyDirty || notifDirty) && (
            <div className="mb-6">
              <Button onClick={handleSavePrivacyAndNotif} disabled={saving}>
                {saving ? tCommon('saving') : t('saveSettings')}
              </Button>
            </div>
          )}

          {/* Account & Security */}
          <h2 className="mb-3 text-lg font-semibold">{t('accountSecurity')}</h2>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Lock className="h-4 w-4" />
                {t('accountSecurity')}
              </CardTitle>
              <CardDescription>{t('accountSecurityDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-medium mb-1">{t('changePassword')}</h3>
                <p className="text-sm text-muted-foreground mb-4">{t('changePasswordDescription')}</p>
                <form onSubmit={handleUpdatePassword} className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="current-password">{t('currentPassword')}</Label>
                    <Input
                      id="current-password"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder={t('currentPassword')}
                      autoComplete="current-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">{t('newPassword')}</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={t('newPassword')}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">{t('confirmNewPassword')}</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={t('confirmNewPassword')}
                      autoComplete="new-password"
                    />
                  </div>
                  {passwordError && (
                    <p className="text-sm text-destructive">{passwordError}</p>
                  )}
                  <Button type="submit" disabled={passwordLoading}>
                    {passwordLoading ? tCommon('submitting') : t('updatePassword')}
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>

          {/* Identity verification */}
          <h2 className="mb-3 text-lg font-semibold">{t('realNameVerification')}</h2>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BadgeCheck className="h-4 w-4" />
                {t('realNameVerification')}
              </CardTitle>
              <CardDescription>{t('realNameVerificationDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              {verificationLoading ? (
                <p className="text-sm text-muted-foreground">{tCommon('loading')}</p>
              ) : verificationStatus === 'verified' ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-green-600" />
                  {t('verificationVerified')}
                </p>
              ) : verificationStatus === 'pending' ? (
                <p className="text-sm text-muted-foreground">{t('verificationPending')}</p>
              ) : verificationStatus === 'rejected' ? (
                <p className="text-sm text-destructive mb-4">{t('verificationRejected')}</p>
              ) : null}
              {(verificationStatus === null || verificationStatus === 'rejected') && (
                <form onSubmit={handleSubmitVerification} className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="real-name">{t('realName')}</Label>
                    <Input
                      id="real-name"
                      value={realName}
                      onChange={(e) => setRealName(e.target.value)}
                      placeholder={t('realName')}
                      maxLength={50}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="id-number">{t('idNumber')}</Label>
                    <Input
                      id="id-number"
                      value={idNumber}
                      onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, ''))}
                      placeholder="15 或 18 位"
                      maxLength={18}
                    />
                  </div>
                  <IdCardImageUpload
                    type="front"
                    label={t('idCardFront')}
                    path={idCardFrontPath}
                    onPath={setIdCardFrontPath}
                  />
                  <IdCardImageUpload
                    type="back"
                    label={t('idCardBack')}
                    path={idCardBackPath}
                    onPath={setIdCardBackPath}
                  />
                  {verificationError && (
                    <p className="text-sm text-destructive">{verificationError}</p>
                  )}
                  <Button type="submit" disabled={submitVerificationLoading}>
                    {submitVerificationLoading ? tCommon('submitting') : t('submitVerification')}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          {/* Delete account */}
          <h2 className="mb-3 text-lg font-semibold text-destructive">{t('deleteAccount')}</h2>
          <Card className="mb-6 border-destructive/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-destructive">
                <Trash2 className="h-4 w-4" />
                {t('deleteAccount')}
              </CardTitle>
              <CardDescription>{t('deleteAccountDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              {!deletionRequestLoading && deletionRequest?.status === 'pending' && (
                <p className="text-sm text-amber-600 dark:text-amber-400 mb-4">
                  {t('deleteAccountPendingReview')}
                </p>
              )}
              <p className="text-sm text-muted-foreground mb-4">{t('deleteAccountWarning')}</p>
              <Button
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={deletionRequest?.status === 'pending'}
              >
                {deletionRequest?.status === 'pending'
                  ? t('deleteAccountRequestPending')
                  : t('deleteAccountButton')}
              </Button>
            </CardContent>
          </Card>

          <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('deleteAccount')}</DialogTitle>
                <DialogDescription>{t('deleteAccountWarning')}</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleDeleteAccount} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="delete-password">{tAuth('password')}</Label>
                  <Input
                    id="delete-password"
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder={tAuth('password')}
                    autoComplete="current-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delete-confirm">{t('deleteAccountConfirmLabel')}</Label>
                  <Input
                    id="delete-confirm"
                    type="text"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder={t('deleteAccountConfirmPlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delete-reason">{t('deleteAccountReasonLabel')}</Label>
                  <Input
                    id="delete-reason"
                    type="text"
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    placeholder={t('deleteAccountReasonPlaceholder')}
                  />
                </div>
                {deleteError && (
                  <p className="text-sm text-destructive">{deleteError}</p>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                    {tCommon('cancel')}
                  </Button>
                  <Button type="submit" variant="destructive" disabled={deleteLoading}>
                    {deleteLoading ? tCommon('submitting') : t('deleteAccountButton')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Account links */}
          <h2 className="mb-3 text-lg font-semibold">{t('account')}</h2>
          <Card className="mb-6 divide-y">
            {accountLinks.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.label}</p>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </Link>
              )
            })}
          </Card>
        </>
      )}

      {/* Privacy policy, Help, Support */}
      <h2 className="mb-3 text-lg font-semibold">{user ? tMenu('more') : t('account')}</h2>
      <Card className="divide-y">
        {otherLinks.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{item.label}</p>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </Link>
          )
        })}
      </Card>
    </div>
  )
}
