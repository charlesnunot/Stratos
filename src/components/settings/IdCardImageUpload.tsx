'use client'

import { useRef, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useToast } from '@/lib/hooks/useToast'

const BUCKET = 'identity-docs'
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

interface IdCardImageUploadProps {
  type: 'front' | 'back'
  label: string
  path: string | null
  onPath: (path: string | null) => void
}

export function IdCardImageUpload({ type, label, path, onPath }: IdCardImageUploadProps) {
  const { user } = useAuth()
  const supabase = createClient()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({
        variant: 'warning',
        title: '格式不支持',
        description: '请上传 JPG、PNG 或 WebP 图片',
      })
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast({
        variant: 'warning',
        title: '文件过大',
        description: '请上传 5MB 以内的图片',
      })
      return
    }

    setUploading(true)
    setPreview(URL.createObjectURL(file))
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const filePath = `${user.id}/${type}-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from(BUCKET).upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      })
      if (error) throw error
      onPath(filePath)
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: '上传失败',
        description: err instanceof Error ? err.message : '请重试',
      })
      setPreview(null)
      onPath(null)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const clear = () => {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    onPath(null)
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          className="hidden"
          onChange={handleFileSelect}
          disabled={uploading}
        />
        {(preview || path) ? (
          <div className="relative w-32 h-20 rounded border bg-muted overflow-hidden">
            {preview ? (
              <img src={preview} alt={label} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                已上传
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              </div>
            )}
            <button
              type="button"
              onClick={clear}
              className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? '上传中...' : (path ? '重新上传' : '上传')}
        </Button>
      </div>
    </div>
  )
}

