import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from './useAuth'
import { useToast } from './useToast'

interface UseImageUploadOptions {
  bucket: string
  folder?: string
  maxImages?: number
  existingImages?: string[]
  onUploadComplete?: (urls: string[]) => void
}

interface UseImageUploadReturn {
  images: File[]
  imagePreviews: string[]
  existingImages: string[]
  allPreviews: string[] // existing + new previews combined
  uploading: boolean
  handleImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  removeImage: (index: number) => void
  removeExistingImage: (index: number) => void
  uploadImages: () => Promise<string[]>
  clearImages: () => void
  setExistingImages: (images: string[]) => void
  totalImageCount: number
}

/**
 * Generic hook for handling image uploads to Supabase Storage
 */
export function useImageUpload({
  bucket,
  folder = '',
  maxImages = 9,
  existingImages,
  onUploadComplete,
}: UseImageUploadOptions): UseImageUploadReturn {
  const { user } = useAuth()
  const supabase = createClient()
  const { toast } = useToast()
  const [images, setImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [existingUrls, setExistingUrls] = useState<string[]>(existingImages ?? [])

  // Update existing images when prop changes
  useEffect(() => {
    if (!existingImages) return

    // 避免“同内容不同引用”导致的无意义 setState
    setExistingUrls((prev) => {
      if (prev.length !== existingImages.length) return existingImages
      for (let i = 0; i < prev.length; i++) {
        if (prev[i] !== existingImages[i]) return existingImages
      }
      return prev
    })
  }, [existingImages])

  // Create previews when images change
  useEffect(() => {
    const previews = images.map((file) => URL.createObjectURL(file))
    setImagePreviews(previews)

    // Cleanup object URLs when component unmounts or images change
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [images])

  // Combine existing images and new previews for display
  const allPreviews = [...existingUrls, ...imagePreviews]

  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      const totalCount = existingUrls.length + images.length + files.length

      if (totalCount > maxImages) {
        toast({
          variant: 'warning',
          title: '警告',
          description: `最多只能上传 ${maxImages} 张图片`,
        })
        return
      }

      setImages((prev) => [...prev, ...files])
    },
    [existingUrls.length, images.length, maxImages]
  )

  const removeImage = useCallback((index: number) => {
    setImages((prev) => {
      const newImages = prev.filter((_, i) => i !== index)
      // Cleanup object URL
      const urlToRevoke = imagePreviews[index]
      if (urlToRevoke) {
        URL.revokeObjectURL(urlToRevoke)
      }
      return newImages
    })
  }, [imagePreviews])

  const removeExistingImage = useCallback((index: number) => {
    setExistingUrls((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const clearImages = useCallback(() => {
    // Cleanup all object URLs
    imagePreviews.forEach((url) => URL.revokeObjectURL(url))
    setImages([])
    setImagePreviews([])
  }, [imagePreviews])

  const uploadImages = useCallback(async (): Promise<string[]> => {
    if (images.length === 0) {
      return existingUrls
    }

    if (!user) {
      throw new Error('User not authenticated')
    }

    setUploading(true)
    const uploadedUrls: string[] = [...existingUrls]

    try {
      for (const image of images) {
        const fileExt = image.name.split('.').pop()
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
        const filePath = folder ? `${folder}/${fileName}` : fileName

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(filePath, image, {
            cacheControl: '3600',
            upsert: false,
          })

        if (uploadError) {
          throw uploadError
        }

        const { data } = supabase.storage.from(bucket).getPublicUrl(filePath)
        uploadedUrls.push(data.publicUrl)
      }

      if (onUploadComplete) {
        onUploadComplete(uploadedUrls)
      }

      // Clear local images after successful upload
      clearImages()
    } catch (error) {
      console.error('Image upload error:', error)
      throw error
    } finally {
      setUploading(false)
    }

    return uploadedUrls
  }, [images, existingUrls, user, bucket, folder, supabase, onUploadComplete, clearImages])

  return {
    images,
    imagePreviews,
    existingImages: existingUrls,
    allPreviews,
    uploading,
    handleImageSelect,
    removeImage,
    removeExistingImage,
    uploadImages,
    clearImages,
    setExistingImages: setExistingUrls,
    totalImageCount: existingUrls.length + images.length,
  }
}
