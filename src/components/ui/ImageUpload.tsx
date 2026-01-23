'use client'

import { useState, useRef } from 'react'
import { Upload, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'

interface ImageUploadProps {
  bucket: string
  folder?: string
  maxImages?: number
  onUploadComplete?: (urls: string[]) => void
  existingImages?: string[]
}

export function ImageUpload({
  bucket,
  folder = '',
  maxImages = 9,
  onUploadComplete,
  existingImages = [],
}: ImageUploadProps) {
  const { user } = useAuth()
  const supabase = createClient()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [images, setImages] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>(existingImages)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length + images.length + existingImages.length > maxImages) {
      toast({
        variant: 'warning',
        title: '警告',
        description: `最多只能上传 ${maxImages} 张图片`,
      })
      return
    }

    const newImages = [...images, ...files]
    setImages(newImages)

    // Create previews for new files
    const newPreviews = files.map((file) => URL.createObjectURL(file))
    setPreviews([...previews, ...newPreviews])
  }

  const removeImage = (index: number) => {
    if (index < existingImages.length) {
      // Remove existing image
      const newExisting = existingImages.filter((_, i) => i !== index)
      setPreviews([...newExisting, ...previews.slice(existingImages.length)])
      if (onUploadComplete) {
        onUploadComplete(newExisting)
      }
    } else {
      // Remove new image
      const fileIndex = index - existingImages.length
      const newImages = images.filter((_, i) => i !== fileIndex)
      const newPreviews = previews.filter((_, i) => i !== index)
      setImages(newImages)
      setPreviews(newPreviews)
    }
  }

  const uploadImages = async (): Promise<string[]> => {
    if (images.length === 0) return existingImages

    if (!user) throw new Error('Not authenticated')

    setUploading(true)
    const uploadedUrls: string[] = [...existingImages]

    try {
      for (let i = 0; i < images.length; i++) {
        const image = images[i]
        const fileExt = image.name.split('.').pop()
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
        const filePath = folder ? `${folder}/${fileName}` : fileName

        setUploadProgress((prev) => ({ ...prev, [i]: 0 }))

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(filePath, image, {
            cacheControl: '3600',
            upsert: false,
          })

        if (uploadError) throw uploadError

        const { data } = supabase.storage.from(bucket).getPublicUrl(filePath)
        uploadedUrls.push(data.publicUrl)

        setUploadProgress((prev) => ({ ...prev, [i]: 100 }))
      }

      if (onUploadComplete) {
        onUploadComplete(uploadedUrls)
      }

      // Clear local state
      setImages([])
      setPreviews(uploadedUrls)
    } catch (error) {
      console.error('Upload error:', error)
      throw error
    } finally {
      setUploading(false)
      setUploadProgress({})
    }

    return uploadedUrls
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <Upload className="h-4 w-4" />
          <span>上传图片（最多 {maxImages} 张）</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            disabled={uploading || previews.length >= maxImages}
          />
        </label>
      </div>

      {previews.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {previews.map((preview, index) => (
            <div key={index} className="relative aspect-square group">
              <img
                src={preview}
                alt={`Preview ${index + 1}`}
                className="h-full w-full rounded-lg object-cover"
              />
              {uploadProgress[index] !== undefined && uploading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {images.length > 0 && !uploading && (
        <Button
          type="button"
          onClick={uploadImages}
          variant="outline"
          className="w-full"
        >
          上传图片
        </Button>
      )}
    </div>
  )
}
