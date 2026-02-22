import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface TipSettings {
  enabled: boolean
  thankYouMessage: string
}

export function useTipSettings(enabled: boolean = true) {
  const queryClient = useQueryClient()

  const { data: settings, isLoading } = useQuery({
    queryKey: ['tipSettings'],
    queryFn: async (): Promise<TipSettings> => {
      const response = await fetch('/api/tip/settings')
      if (!response.ok) throw new Error('Failed to fetch settings')
      return response.json()
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5分钟
  })

  const mutation = useMutation({
    mutationFn: async (newSettings: TipSettings) => {
      const response = await fetch('/api/tip/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      })
      if (!response.ok) throw new Error('Failed to update settings')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tipSettings'] })
    },
  })

  return {
    settings,
    isLoading,
    updateSettings: mutation.mutate,
    isUpdating: mutation.isPending,
  }
}