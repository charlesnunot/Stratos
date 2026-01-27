'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks/useToast'
import { Loader2, Plus, MapPin, Check } from 'lucide-react'

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
}

interface AddressSelectorProps {
  selectedAddressId?: string | null
  onSelectAddress: (address: Address | null) => void
  onAddNewAddress?: () => void
  showAddButton?: boolean
}

export function AddressSelector({
  selectedAddressId,
  onSelectAddress,
  onAddNewAddress,
  showAddButton = true,
}: AddressSelectorProps) {
  const { user } = useAuth()
  const supabase = createClient()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [newAddress, setNewAddress] = useState({
    label: '',
    recipientName: '',
    phone: '',
    country: '',
    state: '',
    city: '',
    streetAddress: '',
    postalCode: '',
    isDefault: false,
  })

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

  // Set default address on load
  useEffect(() => {
    if (addresses && addresses.length > 0 && !selectedAddressId) {
      const defaultAddress = addresses.find((addr) => addr.is_default) || addresses[0]
      onSelectAddress(defaultAddress)
    } else if (selectedAddressId && addresses) {
      const selected = addresses.find((addr) => addr.id === selectedAddressId)
      if (selected) {
        onSelectAddress(selected)
      }
    }
  }, [addresses, selectedAddressId, onSelectAddress])

  // Create new address mutation
  const createAddressMutation = useMutation({
    mutationFn: async (address: typeof newAddress) => {
      if (!user) throw new Error('User not authenticated')

      const { data, error } = await supabase
        .from('user_addresses')
        .insert({
          user_id: user.id,
          label: address.label || null,
          recipient_name: address.recipientName,
          phone: address.phone,
          country: address.country,
          state: address.state || null,
          city: address.city || null,
          street_address: address.streetAddress,
          postal_code: address.postalCode || null,
          is_default: address.isDefault,
        })
        .select()
        .single()

      if (error) throw error
      return data as Address
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['userAddresses', user?.id] })
      onSelectAddress(data)
      setShowForm(false)
      setNewAddress({
        label: '',
        recipientName: '',
        phone: '',
        country: '',
        state: '',
        city: '',
        streetAddress: '',
        postalCode: '',
        isDefault: false,
      })
      toast({
        variant: 'default',
        title: '地址已保存',
        description: '地址已成功保存',
      })
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: '保存失败',
        description: error.message || '无法保存地址，请重试',
      })
    },
  })

  const handleAddAddress = () => {
    if (!newAddress.recipientName || !newAddress.phone || !newAddress.streetAddress || !newAddress.country) {
      toast({
        variant: 'destructive',
        title: '信息不完整',
        description: '请填写完整的收货地址信息（姓名、电话、地址、国家）',
      })
      return
    }

    createAddressMutation.mutate(newAddress)
  }

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Address List */}
      {addresses && addresses.length > 0 && (
        <div className="space-y-2">
          {addresses.map((address) => (
            <Card
              key={address.id}
              className={`p-4 cursor-pointer transition-colors ${
                selectedAddressId === address.id
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-accent'
              }`}
              onClick={() => onSelectAddress(address)}
            >
              <div className="flex items-start justify-between">
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
                    {selectedAddressId === address.id && (
                      <Check className="h-4 w-4 text-primary" />
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
            </Card>
          ))}
        </div>
      )}

      {/* Add New Address Form */}
      {showForm ? (
        <Card className="p-6">
          <h3 className="mb-4 text-lg font-semibold">添加新地址</h3>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">地址标签（可选）</label>
              <input
                type="text"
                value={newAddress.label}
                onChange={(e) => setNewAddress({ ...newAddress, label: e.target.value })}
                placeholder="例如：家庭、工作、其他"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">收货人姓名 *</label>
                <input
                  type="text"
                  value={newAddress.recipientName}
                  onChange={(e) => setNewAddress({ ...newAddress, recipientName: e.target.value })}
                  placeholder="请输入收货人姓名"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">联系电话 *</label>
                <input
                  type="tel"
                  value={newAddress.phone}
                  onChange={(e) => setNewAddress({ ...newAddress, phone: e.target.value })}
                  placeholder="请输入联系电话"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">国家/地区 *</label>
              <input
                type="text"
                value={newAddress.country}
                onChange={(e) => setNewAddress({ ...newAddress, country: e.target.value })}
                placeholder="请输入国家/地区"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">省/州</label>
                <input
                  type="text"
                  value={newAddress.state}
                  onChange={(e) => setNewAddress({ ...newAddress, state: e.target.value })}
                  placeholder="请输入省/州"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">城市</label>
                <input
                  type="text"
                  value={newAddress.city}
                  onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                  placeholder="请输入城市"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">详细地址 *</label>
              <input
                type="text"
                value={newAddress.streetAddress}
                onChange={(e) => setNewAddress({ ...newAddress, streetAddress: e.target.value })}
                placeholder="请输入详细地址"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">邮政编码</label>
              <input
                type="text"
                value={newAddress.postalCode}
                onChange={(e) => setNewAddress({ ...newAddress, postalCode: e.target.value })}
                placeholder="请输入邮政编码（可选）"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={newAddress.isDefault}
                onChange={(e) => setNewAddress({ ...newAddress, isDefault: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="isDefault" className="text-sm">
                设为默认地址
              </label>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowForm(false)
                  setNewAddress({
                    label: '',
                    recipientName: '',
                    phone: '',
                    country: '',
                    state: '',
                    city: '',
                    streetAddress: '',
                    postalCode: '',
                    isDefault: false,
                  })
                }}
                className="flex-1"
              >
                取消
              </Button>
              <Button
                onClick={handleAddAddress}
                disabled={createAddressMutation.isPending}
                className="flex-1"
              >
                {createAddressMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    保存中...
                  </>
                ) : (
                  '保存地址'
                )}
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        showAddButton && (
          <Button
            variant="outline"
            onClick={() => setShowForm(true)}
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" />
            添加新地址
          </Button>
        )
      )}

      {/* No addresses message */}
      {!isLoading && (!addresses || addresses.length === 0) && !showForm && (
        <Card className="p-6 text-center">
          <MapPin className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">您还没有保存的地址</p>
          {showAddButton && (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              添加地址
            </Button>
          )}
        </Card>
      )}
    </div>
  )
}
