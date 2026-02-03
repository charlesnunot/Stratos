/**
 * 地址字段长度与必填校验，防止异常输入与超长写入
 */

export const ADDRESS_FIELD_LIMITS = {
  label: 50,
  recipient_name: 100,
  phone: 30,
  country: 100,
  state: 100,
  city: 100,
  street_address: 500,
  postal_code: 20,
} as const

export interface AddressInput {
  label?: string | null
  recipient_name?: string
  phone?: string
  country?: string
  state?: string | null
  city?: string | null
  street_address?: string
  postal_code?: string | null
}

export function validateAddressFields(input: AddressInput): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {}

  if (!input.recipient_name?.trim()) {
    errors.recipient_name = '收货人姓名为必填'
  } else if (input.recipient_name.length > ADDRESS_FIELD_LIMITS.recipient_name) {
    errors.recipient_name = `收货人姓名不能超过 ${ADDRESS_FIELD_LIMITS.recipient_name} 个字符`
  }

  if (!input.phone?.trim()) {
    errors.phone = '联系电话为必填'
  } else if (input.phone.length > ADDRESS_FIELD_LIMITS.phone) {
    errors.phone = `联系电话不能超过 ${ADDRESS_FIELD_LIMITS.phone} 个字符`
  } else if (input.phone.length < 6 || input.phone.length > ADDRESS_FIELD_LIMITS.phone) {
    errors.phone = `联系电话长度应为 6–${ADDRESS_FIELD_LIMITS.phone} 位`
  } else if (!/^[\d\s+\-()]+$/.test(input.phone)) {
    errors.phone = '联系电话仅允许数字、空格、+、-、()'
  }

  if (!input.country?.trim()) {
    errors.country = '国家/地区为必填'
  } else if (input.country.length > ADDRESS_FIELD_LIMITS.country) {
    errors.country = `国家/地区不能超过 ${ADDRESS_FIELD_LIMITS.country} 个字符`
  }

  if (!input.street_address?.trim()) {
    errors.street_address = '详细地址为必填'
  } else if (input.street_address.length > ADDRESS_FIELD_LIMITS.street_address) {
    errors.street_address = `详细地址不能超过 ${ADDRESS_FIELD_LIMITS.street_address} 个字符`
  }

  if (input.label && input.label.length > ADDRESS_FIELD_LIMITS.label) {
    errors.label = `地址标签不能超过 ${ADDRESS_FIELD_LIMITS.label} 个字符`
  }
  if (input.state && input.state.length > ADDRESS_FIELD_LIMITS.state) {
    errors.state = `省/州不能超过 ${ADDRESS_FIELD_LIMITS.state} 个字符`
  }
  if (input.city && input.city.length > ADDRESS_FIELD_LIMITS.city) {
    errors.city = `城市不能超过 ${ADDRESS_FIELD_LIMITS.city} 个字符`
  }
  if (input.postal_code) {
    if (input.postal_code.length > ADDRESS_FIELD_LIMITS.postal_code) {
      errors.postal_code = `邮政编码不能超过 ${ADDRESS_FIELD_LIMITS.postal_code} 个字符`
    } else if (!/^[a-zA-Z0-9\s\-]+$/.test(input.postal_code)) {
      errors.postal_code = '邮政编码仅允许字母、数字、空格、-'
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  }
}
