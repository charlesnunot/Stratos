'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { type Favorite } from '@/lib/hooks/useFavorites'
import { showSuccess, showError } from '@/lib/utils/toast'
import { useTranslations } from 'next-intl'

interface FavoriteNotesDialogProps {
  favorite: Favorite
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FavoriteNotesDialog({
  favorite,
  open,
  onOpenChange,
}: FavoriteNotesDialogProps) {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const t = useTranslations('favorites')
  const tCommon = useTranslations('common')
  const [notes, setNotes] = useState(favorite.notes || '')

  const updateNotes = useMutation({
    mutationFn: async (newNotes: string) => {
      if (!user) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('favorites')
        .update({ notes: newNotes || null })
        .eq('id', favorite.id)
        .eq('user_id', user.id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites', user?.id] })
      showSuccess(tCommon('success'))
      onOpenChange(false)
    },
    onError: (error) => {
      showError(tCommon('error'))
      console.error('Update favorite notes error:', error)
    },
  })

  const handleSave = () => {
    updateNotes.mutate(notes.trim())
  }

  const handleDelete = async () => {
    if (!user) return
    try {
      const { error } = await supabase
        .from('favorites')
        .update({ notes: null })
        .eq('id', favorite.id)
        .eq('user_id', user.id)

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ['favorites', user?.id] })
      showSuccess(tCommon('success'))
      onOpenChange(false)
    } catch (error) {
      showError(tCommon('error'))
      console.error('Delete favorite notes error:', error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑备注</DialogTitle>
          <DialogDescription>
            为这个收藏添加备注，方便以后查找
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="notes">备注</Label>
            <Textarea
              id="notes"
              placeholder="输入备注..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              {notes.length}/500
            </p>
          </div>
        </div>
        <DialogFooter>
          {favorite.notes && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={updateNotes.isPending}
            >
              删除备注
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateNotes.isPending}
          >
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateNotes.isPending}
          >
            {tCommon('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
