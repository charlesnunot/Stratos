'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
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

  const { data: profile, isLoading: profileLoading, error: profileError } = useProfile(userId)

  const [formData, setFormData] = useState({
    display_name: '',
    username: '',
    bio: '',
    location: '',
  })

  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Stable existingImages array reference
  const initialExistingImages = useMemo(() => {
    return profile?.avatar_url ? [profile.avatar_url] : []
  }, [profile?.avatar_url])

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

  // Populate form when profile data loads
  useEffect(() => {
    if (profile) {
      setFormData({
        display_name: profile.display_name || '',
        username: profile.username || '',
        bio: profile.bio || '',
        location: profile.location || '',
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
    return null
  }

  if (profileError) {
    return (
      <div className="py-12 text-center">
        <p className="text-destructive">{t('loadFailed')}</p>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrors({})

    try {
      // Validate form
      if (!formData.display_name?.trim()) {
        setErrors({ display_name: '显示名称不能为空' })
        return
      }

      if (!formData.username?.trim()) {
        setErrors({ username: '用户名不能为空' })
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
        setErrors({ username: '用户名已被使用' })
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

      // Update profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          display_name: formData.display_name.trim(),
          username: formData.username.trim(),
          bio: formData.bio.trim() || null,
          location: formData.location.trim() || null,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      if (updateError) throw updateError

      // Invalidate profile query to refresh data
      queryClient.invalidateQueries({ queryKey: ['profile', userId] })

      toast({
        variant: 'success',
        title: '成功',
        description: '资料已更新',
      })

      router.push(`/profile/${userId}`)
    } catch (error: any) {
      console.error('Update profile error:', error)
      toast({
        variant: 'destructive',
        title: '错误',
        description: error.message || '更新失败，请重试',
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
                  alt="Avatar preview"
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
              <span>{currentAvatarUrl ? '更换头像' : '上传头像'}</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
                disabled={avatarUploading}
              />
            </label>
            {avatarUploading && (
              <p className="text-sm text-muted-foreground">上传中...</p>
            )}
          </div>
        </Card>

        {/* Display Name */}
        <Card className="p-6">
          <div className="space-y-2">
            <label htmlFor="display_name" className="text-sm font-medium">
              显示名称 *
            </label>
            <Input
              id="display_name"
              required
              value={formData.display_name}
              onChange={(e) =>
                setFormData({ ...formData, display_name: e.target.value })
              }
              placeholder="输入显示名称"
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
              用户名 *
            </label>
            <Input
              id="username"
              required
              value={formData.username}
              onChange={(e) =>
                setFormData({ ...formData, username: e.target.value.replace(/\s/g, '') })
              }
              placeholder="输入用户名（不含空格）"
              className={errors.username ? 'border-destructive' : ''}
            />
            {errors.username && (
              <p className="text-sm text-destructive">{errors.username}</p>
            )}
            <p className="text-xs text-muted-foreground">
              用户名将用于您的个人资料链接
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
              placeholder="介绍一下自己..."
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
              placeholder="输入位置"
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
