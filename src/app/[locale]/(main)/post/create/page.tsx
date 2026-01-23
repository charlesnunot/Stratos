'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthGuard } from '@/lib/hooks/useAuthGuard'
import { useImageUpload } from '@/lib/hooks/useImageUpload'
import { useToast } from '@/lib/hooks/useToast'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { X, Upload, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

export default function CreatePostPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user, loading: authLoading } = useAuthGuard()
  const supabase = createClient()
  const { toast } = useToast()
  const [content, setContent] = useState('')
  const [topics, setTopics] = useState<string[]>([])
  const [newTopic, setNewTopic] = useState('')
  const [location, setLocation] = useState('')
  const [loading, setLoading] = useState(false)
  const t = useTranslations('posts')
  const tCommon = useTranslations('common')

  const {
    images,
    imagePreviews,
    uploading,
    handleImageSelect,
    removeImage,
    uploadImages,
  } = useImageUpload({
    bucket: 'posts',
    maxImages: 9,
  })

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  const addTopic = () => {
    if (newTopic.trim() && !topics.includes(newTopic.trim())) {
      setTopics([...topics, newTopic.trim()])
      setNewTopic('')
    }
  }

  const removeTopic = (topic: string) => {
    setTopics(topics.filter((t) => t !== topic))
  }


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim() && imagePreviews.length === 0) {
      toast({
        variant: 'warning',
        title: '提示',
        description: t('fillContentOrImages'),
      })
      return
    }

    setLoading(true)

    try {
      // Upload images
      const imageUrls = await uploadImages()

      // Create or get topics
      const topicIds: string[] = []
      for (const topicName of topics) {
        // Check if topic exists
        const { data: existingTopic } = await supabase
          .from('topics')
          .select('id')
          .eq('name', topicName)
          .single()

        let topicId: string
        if (existingTopic) {
          topicId = existingTopic.id
        } else {
          // Create new topic
          const slug = topicName.toLowerCase().replace(/\s+/g, '-')
          const { data: newTopic, error } = await supabase
            .from('topics')
            .insert({
              name: topicName,
              slug,
            })
            .select()
            .single()

          if (error) throw error
          topicId = newTopic.id
        }
        topicIds.push(topicId)
      }

      // Create post
      const { data: post, error: postError } = await supabase
        .from('posts')
        .insert({
          user_id: user.id,
          content: content.trim() || null,
          image_urls: imageUrls,
          location: location.trim() || null,
          status: 'pending', // 需要审核
        })
        .select()
        .single()

      if (postError) throw postError

      // Link topics
      if (topicIds.length > 0) {
        const { error: topicError } = await supabase
          .from('post_topics')
          .insert(
            topicIds.map((topicId) => ({
              post_id: post.id,
              topic_id: topicId,
            }))
          )

        if (topicError) throw topicError
      }

      // 使相关查询失效以刷新数据
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      queryClient.invalidateQueries({ queryKey: ['post', post.id] })
      queryClient.invalidateQueries({ queryKey: ['posts', 'pending'] })

      router.push(`/post/${post.id}`)
    } catch (error) {
      console.error('Error creating post:', error)
      toast({
        variant: 'destructive',
        title: '错误',
        description: t('publishFailed'),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">{t('createPost')}</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Content */}
        <Card className="p-4">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('shareYourThoughts')}
            className="w-full resize-none border-none bg-transparent text-sm focus:outline-none"
            rows={6}
          />
        </Card>

        {/* Image Upload */}
        <Card className="p-4">
          <div className="space-y-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Upload className="h-4 w-4" />
              <span>{t('uploadImagesMax')}</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageSelect}
                className="hidden"
              />
            </label>

            {imagePreviews.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {imagePreviews.map((preview, index) => (
                  <div key={index} className="relative aspect-square">
                    <img
                      src={preview}
                      alt={`Preview ${index + 1}`}
                      className="h-full w-full rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Topics */}
        <Card className="p-4">
          <div className="space-y-3">
            <label className="text-sm font-medium">{t('topic')}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTopic()
                  }
                }}
                placeholder={`${tCommon('create')} ${t('topic')}...`}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <Button type="button" onClick={addTopic} variant="outline">
                {tCommon('create')}
              </Button>
            </div>
            {topics.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {topics.map((topic) => (
                  <span
                    key={topic}
                    className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm"
                  >
                    #{topic}
                    <button
                      type="button"
                      onClick={() => removeTopic(topic)}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Location */}
        <Card className="p-4">
          <label className="text-sm font-medium">{t('selectLocation')}</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t('enterLocation')}
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Card>

        {/* Submit */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={loading || uploading}
          >
            {tCommon('cancel')}
          </Button>
          <Button type="submit" disabled={loading || uploading} className="flex-1">
            {loading || uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {uploading ? tCommon('loading') : tCommon('loading')}
              </>
            ) : (
              t('createPost')
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
