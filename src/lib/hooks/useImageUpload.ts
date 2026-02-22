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
  externalUrls: string[]
  allPreviews: string[] // existing + external + new previews combined
  uploading: boolean
  handleImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  removeImage: (index: number) => void
  removeExistingImage: (index: number) => void
  addExternalUrl: (url: string) => void
  removeExternalUrl: (index: number) => void
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
  const [externalUrls, setExternalUrls] = useState<string[]>([])

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

  // Combine existing images, external urls, and new previews for display
  const allPreviews = [...existingUrls, ...externalUrls, ...imagePreviews]

  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      const totalCount = existingUrls.length + externalUrls.length + images.length + files.length

      if (totalCount > maxImages) {
        toast({
          variant: 'warning',
          title: '警告',
          description: `最多只能上传 ${maxImages} 张图片`,
        })
        return
      }

      // ✅ 修复 P1-6: 验证图片大小和类型
      const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
      const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
      
      const validFiles: File[] = []
      for (const file of files) {
        // 检查文件类型
        if (!ALLOWED_TYPES.includes(file.type)) {
          toast({
            variant: 'warning',
            title: '警告',
            description: `文件 ${file.name} 不是有效的图片格式（仅支持 JPG、PNG、GIF、WebP）`,
          })
          continue
        }
        
        // 检查文件大小
        if (file.size > MAX_FILE_SIZE) {
          toast({
            variant: 'warning',
            title: '警告',
            description: `文件 ${file.name} 超过 5MB 限制，请压缩后上传`,
          })
          continue
        }
        
        validFiles.push(file)
      }

      if (validFiles.length > 0) {
        setImages((prev) => [...prev, ...validFiles])
      }
    },
    [existingUrls.length, externalUrls.length, images.length, maxImages, toast]
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

  const addExternalUrl = useCallback((url: string) => {
    const trimmed = url.trim()
    if (!trimmed) return
    if (!/^https?:\/\//i.test(trimmed)) {
      toast({ variant: 'warning', title: '请输入有效的 http(s) URL' })
      return
    }
    const total = existingUrls.length + externalUrls.length + images.length
    if (total >= maxImages) {
      toast({ variant: 'warning', title: `最多 ${maxImages} 张图片` })
      return
    }
    setExternalUrls(prev => [...prev, trimmed])
  }, [existingUrls.length, externalUrls.length, images.length, maxImages, toast])

  const removeExternalUrl = useCallback((index: number) => {
    setExternalUrls(prev => prev.filter((_, i) => i !== index))
  }, [])

  const clearImages = useCallback(() => {
    // Cleanup all object URLs
    imagePreviews.forEach((url) => URL.revokeObjectURL(url))
    setImages([])
    setImagePreviews([])
  }, [imagePreviews])

  const uploadImages = useCallback(async (): Promise<string[]> => {
    if (images.length === 0) {
      return []
    }

    if (!user) {
      throw new Error('User not authenticated')
    }
    
    // ✅ 修复 P1-6: 再次验证图片大小和类型（后端验证）
    const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
    const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    
    for (const file of images) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        throw new Error(`文件 ${file.name} 不是有效的图片格式`)
      }
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`文件 ${file.name} 超过 5MB 限制`)
      }
    }

    setUploading(true)
    const uploadedUrls: string[] = []
    const uploadedPaths: string[] = []

    try {
      const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
      const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
      
      for (const image of images) {
        if (!ALLOWED_TYPES.includes(image.type)) {
          throw new Error(`文件 ${image.name} 不是有效的图片格式`)
        }
        if (image.size > MAX_FILE_SIZE) {
          throw new Error(`文件 ${image.name} 超过 5MB 限制`)
        }
        
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

        uploadedPaths.push(filePath)
        const { data } = supabase.storage.from(bucket).getPublicUrl(filePath)
        uploadedUrls.push(data.publicUrl)
      }

      if (onUploadComplete) {
        onUploadComplete(uploadedUrls)
      }

      clearImages()
    } catch (error) {
      // 清理已上传的孤儿文件
      if (uploadedPaths.length > 0) {
        try {
          await supabase.storage.from(bucket).remove(uploadedPaths)
        } catch (cleanupErr) {
          console.error('Failed to cleanup orphaned uploads:', cleanupErr)
        }
      }
      console.error('Image upload error:', error)
      throw error
    } finally {
      setUploading(false)
    }

    return uploadedUrls
  }, [images, user, bucket, folder, supabase, onUploadComplete, clearImages])

  return {
    images,
    imagePreviews,
    existingImages: existingUrls,
    externalUrls,
    allPreviews,
    uploading,
    handleImageSelect,
    removeImage,
    removeExistingImage,
    addExternalUrl,
    removeExternalUrl,
    uploadImages,
    clearImages,
    setExistingImages: setExistingUrls,
    totalImageCount: existingUrls.length + externalUrls.length + images.length,
  }
}
