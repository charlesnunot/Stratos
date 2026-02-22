/**
 * Auth Guards 单元测试
 * 测试所有鉴权守卫函数的正确性
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import {
  requireUser,
  requireRole,
  requireAdmin,
  requireAdminOrSupport,
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
} from '../guards'
import { Roles, UserPermissions, AdminPermissions } from '../permissions'

// Mock Supabase client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

describe('Auth Guards', () => {
  let mockRequest: NextRequest
  
  beforeEach(() => {
    mockRequest = new NextRequest('http://localhost/api/test')
    vi.clearAllMocks()
  })
  
  describe('requireUser', () => {
    it('should return 401 when user is not authenticated', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('Not authenticated') }),
        },
      } as any)
      
      const result = await requireUser(mockRequest)
      
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.response.status).toBe(401)
      }
    })
    
    it('should return 403 when user is banned', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ 
            data: { user: { id: 'user-123' } }, 
            error: null 
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'user', status: 'banned' },
                error: null,
              }),
            }),
          }),
        }),
      } as any)
      
      const result = await requireUser(mockRequest)
      
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.response.status).toBe(403)
      }
    })
    
    it('should return success when user is authenticated and active', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ 
            data: { user: { id: 'user-123' } }, 
            error: null 
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'user', status: 'active' },
                error: null,
              }),
            }),
          }),
        }),
      } as any)
      
      const result = await requireUser(mockRequest)
      
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.user.id).toBe('user-123')
        expect(result.data.profile.role).toBe('user')
      }
    })
  })
  
  describe('requireRole', () => {
    it('should return 403 when user does not have required role', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ 
            data: { user: { id: 'user-123' } }, 
            error: null 
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'user', status: 'active' },
                error: null,
              }),
            }),
          }),
        }),
      } as any)
      
      const result = await requireRole(mockRequest, ['admin'])
      
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.response.status).toBe(403)
      }
    })
    
    it('should return success when user has one of the required roles', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ 
            data: { user: { id: 'user-123' } }, 
            error: null 
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'support', status: 'active' },
                error: null,
              }),
            }),
          }),
        }),
      } as any)
      
      const result = await requireRole(mockRequest, ['admin', 'support'])
      
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.profile.role).toBe('support')
      }
    })
  })
  
  describe('requireAdmin', () => {
    it('should return 403 for non-admin user', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ 
            data: { user: { id: 'user-123' } }, 
            error: null 
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'user', status: 'active' },
                error: null,
              }),
            }),
          }),
        }),
      } as any)
      
      const result = await requireAdmin(mockRequest)
      
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.response.status).toBe(403)
      }
    })
    
    it('should return success for admin user', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ 
            data: { user: { id: 'admin-123' } }, 
            error: null 
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'admin', status: 'active' },
                error: null,
              }),
            }),
          }),
        }),
      } as any)
      
      const result = await requireAdmin(mockRequest)
      
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.profile.role).toBe('admin')
      }
    })
  })
  
  describe('requireAdminOrSupport', () => {
    it('should return 403 for regular user', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ 
            data: { user: { id: 'user-123' } }, 
            error: null 
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'user', status: 'active' },
                error: null,
              }),
            }),
          }),
        }),
      } as any)
      
      const result = await requireAdminOrSupport(mockRequest)
      
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.response.status).toBe(403)
      }
    })
    
    it('should return success for support user', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ 
            data: { user: { id: 'support-123' } }, 
            error: null 
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'support', status: 'active' },
                error: null,
              }),
            }),
          }),
        }),
      } as any)
      
      const result = await requireAdminOrSupport(mockRequest)
      
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.profile.role).toBe('support')
      }
    })
  })
})

describe('Permission Helpers', () => {
  describe('hasPermission', () => {
    it('should return true when role has permission', () => {
      expect(hasPermission(Roles.ADMIN, AdminPermissions.USER_CREATE)).toBe(true)
      expect(hasPermission(Roles.USER, UserPermissions.PROFILE_READ)).toBe(true)
    })
    
    it('should return false when role does not have permission', () => {
      expect(hasPermission(Roles.USER, AdminPermissions.USER_CREATE)).toBe(false)
    })
  })
  
  describe('hasAllPermissions', () => {
    it('should return true when role has all permissions', () => {
      expect(hasAllPermissions(Roles.USER, [
        UserPermissions.PROFILE_READ,
        UserPermissions.PROFILE_UPDATE,
      ])).toBe(true)
    })
    
    it('should return false when role is missing any permission', () => {
      expect(hasAllPermissions(Roles.USER, [
        UserPermissions.PROFILE_READ,
        AdminPermissions.USER_CREATE,
      ])).toBe(false)
    })
  })
  
  describe('hasAnyPermission', () => {
    it('should return true when role has any of the permissions', () => {
      expect(hasAnyPermission(Roles.USER, [
        UserPermissions.PROFILE_READ,
        AdminPermissions.USER_CREATE,
      ])).toBe(true)
    })
    
    it('should return false when role has none of the permissions', () => {
      expect(hasAnyPermission(Roles.USER, [
        AdminPermissions.USER_CREATE,
        AdminPermissions.USER_DELETE,
      ])).toBe(false)
    })
  })
})
