'use client'

import { useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks/useToast'
import { Loader2, Plus, Pencil, Trash2, MapPin, Check } from 'lucide-react'
import { Link } from '@/i18n/navigation'

interface Address {
  id: string
  label: string | null
  recipient_name: string
  phone: string
  country: string
  state: string | null
  city: string | null
  street_address: string
  postal_code: string | null
  is_default: boolean
  created_at: string
  updated_at: string
}

export default function AddressesPage() {
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Address>>({})

  // Load user addresses
  const { data: addresses, isLoading } = useQuery({
    queryKey: ['userAddresses', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('user_addresses')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as Address[]
    },
    enabled: !!user,
  })

  // Set default address mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (addressId: string) => {
      if (!user) throw new Error('User not authenticated')

      // First, unset all defaults
      await supabase
        .from('user_addresses')
        .update({ is_default: false })
        .eq('user_id', user.id)

      // Then set this one as default
      const { error } = await supabase
        .from('user_addresses')
        .update({ is_default: true })
        .eq('id', addressId)
        .eq('user_id', user.id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userAddresses', user?.id] })
      toast({
        variant: 'default',
        title: '已设置默认地址',
      })
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: '设置失败',
        description: error.message || '无法设置默认地址',
      })
    },
  })

  // Delete address mutation
  const deleteMutation = useMutation({
    mutationFn: async (addressId: string) => {
      if (!user) throw new Error('User not authenticated')

      const { error } = await supabase
        .from('user_addresses')
        .delete()
        .eq('id', addressId)
        .eq('user_id', user.id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userAddresses', user?.id] })
      toast({
        variant: 'default',
        title: '地址已删除',
      })
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: '删除失败',
        description: error.message || '无法删除地址',
      })
    },
  })

  // Update address mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Address> }) => {
      if (!user) throw new Error('User not authenticated')

      const { error } = await supabase
        .from('user_addresses')
        .update({
          label: data.label || null,
          recipient_name: data.recipient_name,
          phone: data.phone,
          country: data.country,
          state: data.state || null,
          city: data.city || null,
          street_address: data.street_address,
          postal_code: data.postal_code || null,
          is_default: data.is_default || false,
        })
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userAddresses', user?.id] })
      setEditingId(null)
      setEditForm({})
      toast({
        variant: 'default',
        title: '地址已更新',
      })
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: '更新失败',
        description: error.message || '无法更新地址',
      })
    },
  })

  const handleEdit = (address: Address) => {
    setEditingId(address.id)
    setEditForm({
      label: address.label || '',
      recipient_name: address.recipient_name,
      phone: address.phone,
      country: address.country,
      state: address.state || '',
      city: address.city || '',
      street_address: address.street_address,
      postal_code: address.postal_code || '',
      is_default: address.is_default,
    })
  }

  const handleSaveEdit = () => {
    if (!editingId) return

    if (!editForm.recipient_name || !editForm.phone || !editForm.street_address || !editForm.country) {
      toast({
        variant: 'destructive',
        title: '信息不完整',
        description: '请填写完整的收货地址信息（姓名、电话、地址、国家）',
      })
      return
    }

    updateMutation.mutate({ id: editingId, data: editForm })
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditForm({})
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <p className="text-muted-foreground">请先登录</p>
        <Link href="/login">
          <Button className="mt-4">登录</Button>
        </Link>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <div className="flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">收货地址管理</h1>
        <Link href="/checkout">
          <Button variant="outline">返回结算</Button>
        </Link>
      </div>

      {/* Address List */}
      {addresses && addresses.length > 0 ? (
        <div className="space-y-4">
          {addresses.map((address) => (
            <Card key={address.id} className="p-6">
              {editingId === address.id ? (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">编辑地址</h3>
                  <div>
                    <label className="mb-1 block text-sm font-medium">地址标签（可选）</label>
                    <input
                      type="text"
                      value={editForm.label || ''}
                      onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                      placeholder="例如：家庭、工作、其他"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium">收货人姓名 *</label>
                      <input
                        type="text"
                        value={editForm.recipient_name || ''}
                        onChange={(e) => setEditForm({ ...editForm, recipient_name: e.target.value })}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">联系电话 *</label>
                      <input
                        type="tel"
                        value={editForm.phone || ''}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">国家/地区 *</label>
                    <input
                      type="text"
                      value={editForm.country || ''}
                      onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium">省/州</label>
                      <input
                        type="text"
                        value={editForm.state || ''}
                        onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">城市</label>
                      <input
                        type="text"
                        value={editForm.city || ''}
                        onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">详细地址 *</label>
                    <input
                      type="text"
                      value={editForm.street_address || ''}
                      onChange={(e) => setEditForm({ ...editForm, street_address: e.target.value })}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">邮政编码</label>
                    <input
                      type="text"
                      value={editForm.postal_code || ''}
                      onChange={(e) => setEditForm({ ...editForm, postal_code: e.target.value })}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`isDefault-${address.id}`}
                      checked={editForm.is_default || false}
                      onChange={(e) => setEditForm({ ...editForm, is_default: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <label htmlFor={`isDefault-${address.id}`} className="text-sm">
                      设为默认地址
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handleCancelEdit}
                      disabled={updateMutation.isPending}
                      className="flex-1"
                    >
                      取消
                    </Button>
                    <Button
                      onClick={handleSaveEdit}
                      disabled={updateMutation.isPending}
                      className="flex-1"
                    >
                      {updateMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          保存中...
                        </>
                      ) : (
                        '保存'
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {address.label && (
                          <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded">
                            {address.label}
                          </span>
                        )}
                        {address.is_default && (
                          <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded">
                            默认
                          </span>
                        )}
                      </div>
                      <p className="font-medium">{address.recipient_name}</p>
                      <p className="text-sm text-muted-foreground">{address.phone}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {[address.country, address.state, address.city, address.street_address]
                          .filter(Boolean)
                          .join(' ')}
                      </p>
                      {address.postal_code && (
                        <p className="text-xs text-muted-foreground mt-1">
                          邮政编码: {address.postal_code}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!address.is_default && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDefaultMutation.mutate(address.id)}
                        disabled={setDefaultMutation.isPending}
                      >
                        {setDefaultMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          '设为默认'
                        )}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(address)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      编辑
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm('确定要删除这个地址吗？')) {
                          deleteMutation.mutate(address.id)
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      删除
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center">
          <MapPin className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">您还没有保存的地址</p>
          <Link href="/checkout">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              添加地址
            </Button>
          </Link>
        </Card>
      )}
    </div>
  )
}
