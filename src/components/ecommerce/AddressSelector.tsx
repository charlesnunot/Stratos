'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks/useToast'
import { Loader2, Plus, MapPin, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { validateAddressFields, ADDRESS_FIELD_LIMITS } from '@/lib/utils/address-validation'

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
  const t = useTranslations('addresses')
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

  // Set default address on load; clear selection if selected address was removed
  useEffect(() => {
    if (!addresses) return
    if (addresses.length === 0) {
      if (selectedAddressId) {
        onSelectAddress(null)
        toast({ variant: 'warning', title: t('addressRemovedSelectAgain') })
      }
      return
    }
    if (!selectedAddressId) {
      const defaultAddress = addresses.find((addr) => addr.is_default) || addresses[0]
      onSelectAddress(defaultAddress)
    } else {
      const selected = addresses.find((addr) => addr.id === selectedAddressId)
      if (selected) {
        onSelectAddress(selected)
      } else {
        onSelectAddress(null)
        toast({ variant: 'warning', title: t('addressRemovedSelectAgain') })
      }
    }
  }, [addresses, selectedAddressId, onSelectAddress, toast, t])

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
        title: t('addressSaved'),
        description: t('addressSavedDescription'),
      })
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: t('saveFailed'),
        description: error.message || t('saveFailedDescription'),
      })
    },
  })

  const handleAddAddress = () => {
    const validation = validateAddressFields({
      label: newAddress.label || null,
      recipient_name: newAddress.recipientName,
      phone: newAddress.phone,
      country: newAddress.country,
      state: newAddress.state || null,
      city: newAddress.city || null,
      street_address: newAddress.streetAddress,
      postal_code: newAddress.postalCode || null,
    })
    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0]
      toast({
        variant: 'destructive',
        title: t('infoError'),
        description: firstError,
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
                        {t('default')}
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
                      {t('postalCode')}: {address.postal_code}
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
          <h3 className="mb-4 text-lg font-semibold">{t('addNew')}</h3>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">{t('labelOptional')}</label>
              <input
                type="text"
                value={newAddress.label}
                onChange={(e) => setNewAddress({ ...newAddress, label: e.target.value })}
                placeholder={t('labelPlaceholder')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                maxLength={ADDRESS_FIELD_LIMITS.label}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">{t('recipientName')} *</label>
                <input
                  type="text"
                  value={newAddress.recipientName}
                  onChange={(e) => setNewAddress({ ...newAddress, recipientName: e.target.value })}
                  placeholder={t('recipientNamePlaceholder')}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                  maxLength={ADDRESS_FIELD_LIMITS.recipient_name}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t('phone')} *</label>
                <input
                  type="tel"
                  value={newAddress.phone}
                  onChange={(e) => setNewAddress({ ...newAddress, phone: e.target.value })}
                  placeholder={t('phonePlaceholder')}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                  maxLength={ADDRESS_FIELD_LIMITS.phone}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('country')} *</label>
              <input
                type="text"
                value={newAddress.country}
                onChange={(e) => setNewAddress({ ...newAddress, country: e.target.value })}
                placeholder={t('countryPlaceholder')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
                maxLength={ADDRESS_FIELD_LIMITS.country}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">{t('state')}</label>
                <input
                  type="text"
                  value={newAddress.state}
                  onChange={(e) => setNewAddress({ ...newAddress, state: e.target.value })}
                  placeholder={t('statePlaceholder')}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  maxLength={ADDRESS_FIELD_LIMITS.state}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t('city')}</label>
                <input
                  type="text"
                  value={newAddress.city}
                  onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                  placeholder={t('cityPlaceholder')}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  maxLength={ADDRESS_FIELD_LIMITS.city}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('streetAddress')} *</label>
              <input
                type="text"
                value={newAddress.streetAddress}
                onChange={(e) => setNewAddress({ ...newAddress, streetAddress: e.target.value })}
                placeholder={t('streetAddressPlaceholder')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
                maxLength={ADDRESS_FIELD_LIMITS.street_address}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('postalCode')}</label>
              <input
                type="text"
                value={newAddress.postalCode}
                onChange={(e) => setNewAddress({ ...newAddress, postalCode: e.target.value })}
                placeholder={t('postalCodePlaceholder')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                maxLength={ADDRESS_FIELD_LIMITS.postal_code}
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
                {t('setAsDefault')}
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
                {t('cancel')}
              </Button>
              <Button
                onClick={handleAddAddress}
                disabled={createAddressMutation.isPending}
                className="flex-1"
              >
                {createAddressMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('saving')}
                  </>
                ) : (
                  t('save')
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
            {t('addNew')}
          </Button>
        )
      )}

      {/* No addresses message */}
      {!isLoading && (!addresses || addresses.length === 0) && !showForm && (
        <Card className="p-6 text-center">
          <MapPin className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">{t('noAddresses')}</p>
          {showAddButton && (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('addAddress')}
            </Button>
          )}
        </Card>
      )}
    </div>
  )
}
