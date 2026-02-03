'use client'

import { useContext } from 'react'
import { AuthContext } from '@/lib/providers/AuthProvider'

export function useAuth() {
  const value = useContext(AuthContext)
  if (value === null && typeof window !== 'undefined') {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return value ?? { user: null, loading: true }
}
