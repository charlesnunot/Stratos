/**
 * React Query configuration and utilities
 */

import { QueryClient } from '@tanstack/react-query'

// Default query client configuration with optimized caching
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache queries for 5 minutes
      staleTime: 5 * 60 * 1000,
      // Keep unused queries in cache for 10 minutes
      gcTime: 10 * 60 * 1000, // Previously cacheTime
      // Retry failed queries once
      retry: 1,
      // Refetch on window focus only if data is stale
      refetchOnWindowFocus: false,
      // Don't refetch on mount if data is fresh
      refetchOnMount: false,
    },
    mutations: {
      // Retry failed mutations once
      retry: 1,
    },
  },
})

/**
 * Prefetch query data
 */
export async function prefetchQuery<T>(
  queryKey: string[],
  queryFn: () => Promise<T>
) {
  await queryClient.prefetchQuery({
    queryKey,
    queryFn,
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Invalidate and refetch queries
 */
export function invalidateQueries(queryKey: string[]) {
  queryClient.invalidateQueries({ queryKey })
}
