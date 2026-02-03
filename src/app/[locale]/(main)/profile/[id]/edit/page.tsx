'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useProfile } from '@/lib/hooks/useProfile'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Loader2, ArrowLeft, Upload, X, User } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useImageUpload } from '@/lib/hooks/useImageUpload'

export default function EditProfilePage() {
  const router = useRouter()
  const params = useParams()
  const userId = params.id as string
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const t = useTranslations('profile')
  const tCommon = useTranslations('common')
  
  const {
    data: profileResult,
    isLoading: profileLoading,
    error: profileError,
  } = useProfile(userId)
  const profile = profileResult?.profile
  const profileErrorKind = profileResult?.errorKind

  const [formData, setFormData] = useState({
    display_name: '',
    username: '',
    bio: '',
    location: '',
  })

  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // 本人看到待审核头像或已审核头像
  const initialExistingImages = useMemo(() => {
    const url = profile?.profile_status === 'pending' && profile?.pending_avatar_url
      ? profile.pending_avatar_url
      : profile?.avatar_url
    return url ? [url] : []
  }, [profile?.avatar_url, profile?.pending_avatar_url, profile?.profile_status])

  // Avatar upload (single image)
  const {
    images,
    imagePreviews,
    existingImages,
    uploading: avatarUploading,
    handleImageSelect,
    removeImage,
    removeExistingImage,
    uploadImages,
    totalImageCount,
  } = useImageUpload({
    bucket: 'avatars',
    folder: 'avatars',
    maxImages: 1,
    existingImages: initialExistingImages,
  })

  // Populate form when profile data loads：本人看到待审核内容或已审核内容
  useEffect(() => {
    if (profile) {
      const isPending = profile.profile_status === 'pending'
      setFormData({
        display_name: (isPending ? profile.pending_display_name : profile.display_name) || '',
        username: (isPending ? profile.pending_username : profile.username) || '',
        bio: (isPending ? profile.pending_bio : profile.bio) || '',
        location: (isPending ? profile.pending_location : profile.location) || '',
      })
    }
  }, [profile])

  // Wait for auth to load before checking user
  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?redirect=${encodeURIComponent(`/profile/${userId}/edit`)}`)
    }
  }, [authLoading, user, router, userId])

  // Redirect if user doesn't own the profile
  useEffect(() => {
    if (!authLoading && user && profile && user.id !== profile.id) {
      router.push(`/profile/${userId}`)
    }
  }, [authLoading, user, profile, router, userId])

  if (authLoading || profileLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user || !profile || user.id !== profile.id) {
    // 没有可编辑的资料时直接不渲染（例如权限受限）
    if (profileError && !profileErrorKind) {
      return (
        <div className="py-12 text-center">
          <p className="text-destructive">{t('loadFailed')}</p>
        </div>
      )
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrors({})

    try {
      // Validate form
      if (!formData.display_name?.trim()) {
        setErrors({ display_name: t('displayNameRequired') })
        return
      }

      if (!formData.username?.trim()) {
        setErrors({ username: t('usernameRequired') })
        return
      }

      const MAX_DISPLAY_NAME = 50
      const MAX_USERNAME = 30
      const MAX_BIO = 500
      const MAX_LOCATION = 200
      const dn = formData.display_name.trim()
      const un = formData.username.trim()
      if (dn.length > MAX_DISPLAY_NAME) {
        setErrors({ display_name: t('displayNameTooLong') })
        return
      }
      if (un.length > MAX_USERNAME) {
        setErrors({ username: t('usernameTooLong') })
        return
      }
      if (formData.bio.trim().length > MAX_BIO) {
        setErrors({ bio: t('bioTooLong') })
        return
      }
      if (formData.location.trim().length > MAX_LOCATION) {
        setErrors({ location: t('locationTooLong') })
        return
      }

      // Check username uniqueness (excluding current user)
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', formData.username.trim())
        .neq('id', user.id)
        .single()

      if (existingProfile) {
        setErrors({ username: t('usernameTaken') })
        return
      }

      // Upload avatar if there are new images
      let avatarUrl: string | null = null
      if (images.length > 0) {
        // Upload new images - uploadImages returns existing + new combined
        const uploadedUrls = await uploadImages()
        avatarUrl = uploadedUrls[0] || null
      } else if (existingImages.length > 0) {
        // Keep existing avatar if no new images
        avatarUrl = existingImages[0]
      }

      // 资料审核：用户提交写入 pending_* 并设为待审核，不直接改主字段；审核通过后由管理员写入主字段
      const allowedFields = {
        pending_display_name: dn,
        pending_username: un,
        pending_bio: formData.bio.trim() || null,
        pending_location: formData.location.trim() || null,
        pending_avatar_url: avatarUrl,
        profile_status: 'pending',
        updated_at: new Date().toISOString(),
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update(allowedFields)
        .eq('id', user.id)

      if (updateError) throw updateError

      // ✅ 修复 P1-3: 缓存失效优化 - 失效所有相关的 profile 缓存
      queryClient.invalidateQueries({ queryKey: ['profile', userId] })
      queryClient.invalidateQueries({ queryKey: ['profile', user.id] })
      queryClient.invalidateQueries({ queryKey: ['profile'] }) // 失效所有 profile 相关缓存

      toast({
        variant: 'success',
        title: tCommon('success'),
        description: t('updatePendingReview'),
      })

      router.push(`/profile/${userId}`)
    } catch (error: any) {
      console.error('Update profile error:', error)
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: error.message || t('updateError'),
      })
    } finally {
      setLoading(false)
    }
  }

  const currentAvatarUrl = existingImages[0] || imagePreviews[0] || null

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-2 sm:px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">{t('editProfile')}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Avatar Upload */}
        <Card className="p-6">
          <label className="mb-4 block text-sm font-medium">{t('avatar')}</label>
          <div className="flex flex-col items-center gap-4">
            {/* Avatar Preview */}
            <div className="relative">
              {currentAvatarUrl ? (
                <img
                  src={currentAvatarUrl}
                  alt={t('avatarAlt')}
                  className="h-32 w-32 rounded-full object-cover border-2 border-background shadow-md"
                />
              ) : (
                <div className="flex h-32 w-32 items-center justify-center rounded-full bg-muted border-2 border-background shadow-md">
                  <User className="h-16 w-16 text-muted-foreground" />
                </div>
              )}
              {currentAvatarUrl && (
                <button
                  type="button"
                  onClick={() => {
                    if (existingImages.length > 0) {
                      removeExistingImage(0)
                    } else if (imagePreviews.length > 0) {
                      removeImage(0)
                    }
                  }}
                  className="absolute -right-2 -top-2 rounded-full bg-destructive p-1.5 text-white hover:bg-destructive/90"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Upload Button */}
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent">
              <Upload className="h-4 w-4" />
              <span>{currentAvatarUrl ? t('changeAvatar') : t('uploadAvatar')}</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
                disabled={avatarUploading}
              />
            </label>
            {avatarUploading && (
              <p className="text-sm text-muted-foreground">{t('uploading')}</p>
            )}
          </div>
        </Card>

        {/* Display Name */}
        <Card className="p-6">
          <div className="space-y-2">
            <label htmlFor="display_name" className="text-sm font-medium">
              {t('displayName')}
            </label>
            <Input
              id="display_name"
              required
              value={formData.display_name}
              onChange={(e) =>
                setFormData({ ...formData, display_name: e.target.value })
              }
              placeholder={t('displayNamePlaceholder')}
              className={errors.display_name ? 'border-destructive' : ''}
            />
            {errors.display_name && (
              <p className="text-sm text-destructive">{errors.display_name}</p>
            )}
          </div>
        </Card>

        {/* Username */}
        <Card className="p-6">
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-medium">
              {t('username')}
            </label>
            <Input
              id="username"
              required
              value={formData.username}
              onChange={(e) =>
                setFormData({ ...formData, username: e.target.value.replace(/\s/g, '') })
              }
              placeholder={t('usernamePlaceholder')}
              className={errors.username ? 'border-destructive' : ''}
            />
            {errors.username && (
              <p className="text-sm text-destructive">{errors.username}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {t('usernameHint')}
            </p>
          </div>
        </Card>

        {/* Bio */}
        <Card className="p-6">
          <div className="space-y-2">
            <label htmlFor="bio" className="text-sm font-medium">
              {t('bio')}
            </label>
            <textarea
              id="bio"
              value={formData.bio}
              onChange={(e) =>
                setFormData({ ...formData, bio: e.target.value })
              }
              placeholder={t('bioPlaceholder')}
              className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              {formData.bio.length}/500
            </p>
          </div>
        </Card>

        {/* Location */}
        <Card className="p-6">
          <div className="space-y-2">
            <label htmlFor="location" className="text-sm font-medium">
              {t('location')}
            </label>
            <Input
              id="location"
              value={formData.location}
              onChange={(e) =>
                setFormData({ ...formData, location: e.target.value })
              }
              placeholder={t('locationPlaceholder')}
            />
          </div>
        </Card>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={loading || avatarUploading}
            className="flex-1"
          >
            {tCommon('cancel')}
          </Button>
          <Button
            type="submit"
            disabled={loading || avatarUploading}
            className="flex-1"
          >
            {loading || avatarUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {tCommon('loading')}
              </>
            ) : (
              tCommon('save')
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
