// 主要销售国家/地区列表
// ISO 3166-1 alpha-2 代码

export const SALES_COUNTRIES = [
  { code: 'CN', nameZh: '中国', nameEn: 'China' },
  { code: 'US', nameZh: '美国', nameEn: 'United States' },
  { code: 'JP', nameZh: '日本', nameEn: 'Japan' },
  { code: 'KR', nameZh: '韩国', nameEn: 'South Korea' },
  { code: 'HK', nameZh: '中国香港', nameEn: 'Hong Kong' },
  { code: 'TW', nameZh: '中国台湾', nameEn: 'Taiwan' },
  { code: 'SG', nameZh: '新加坡', nameEn: 'Singapore' },
  { code: 'MY', nameZh: '马来西亚', nameEn: 'Malaysia' },
  { code: 'TH', nameZh: '泰国', nameEn: 'Thailand' },
  { code: 'VN', nameZh: '越南', nameEn: 'Vietnam' },
  { code: 'IN', nameZh: '印度', nameEn: 'India' },
  { code: 'GB', nameZh: '英国', nameEn: 'United Kingdom' },
  { code: 'DE', nameZh: '德国', nameEn: 'Germany' },
  { code: 'FR', nameZh: '法国', nameEn: 'France' },
  { code: 'IT', nameZh: '意大利', nameEn: 'Italy' },
  { code: 'ES', nameZh: '西班牙', nameEn: 'Spain' },
  { code: 'NL', nameZh: '荷兰', nameEn: 'Netherlands' },
  { code: 'AU', nameZh: '澳大利亚', nameEn: 'Australia' },
  { code: 'CA', nameZh: '加拿大', nameEn: 'Canada' },
  { code: 'BR', nameZh: '巴西', nameEn: 'Brazil' },
  { code: 'MX', nameZh: '墨西哥', nameEn: 'Mexico' },
  { code: 'RU', nameZh: '俄罗斯', nameEn: 'Russia' },
  { code: 'SE', nameZh: '瑞典', nameEn: 'Sweden' },
  { code: 'CH', nameZh: '瑞士', nameEn: 'Switzerland' },
  { code: 'AT', nameZh: '奥地利', nameEn: 'Austria' },
  { code: 'BE', nameZh: '比利时', nameEn: 'Belgium' },
  { code: 'DK', nameZh: '丹麦', nameEn: 'Denmark' },
  { code: 'FI', nameZh: '芬兰', nameEn: 'Finland' },
  { code: 'NO', nameZh: '挪威', nameEn: 'Norway' },
  { code: 'PT', nameZh: '葡萄牙', nameEn: 'Portugal' },
  { code: 'GR', nameZh: '希腊', nameEn: 'Greece' },
  { code: 'PL', nameZh: '波兰', nameEn: 'Poland' },
  { code: 'CZ', nameZh: '捷克', nameEn: 'Czech Republic' },
  { code: 'HU', nameZh: '匈牙利', nameEn: 'Hungary' },
  { code: 'TR', nameZh: '土耳其', nameEn: 'Turkey' },
  { code: 'ZA', nameZh: '南非', nameEn: 'South Africa' },
  { code: 'ID', nameZh: '印度尼西亚', nameEn: 'Indonesia' },
  { code: 'PH', nameZh: '菲律宾', nameEn: 'Philippines' },
  { code: 'AE', nameZh: '阿联酋', nameEn: 'United Arab Emirates' },
  { code: 'SA', nameZh: '沙特阿拉伯', nameEn: 'Saudi Arabia' },
  { code: 'IL', nameZh: '以色列', nameEn: 'Israel' },
  { code: 'NZ', nameZh: '新西兰', nameEn: 'New Zealand' },
  { code: 'AR', nameZh: '阿根廷', nameEn: 'Argentina' },
  { code: 'CL', nameZh: '智利', nameEn: 'Chile' },
  { code: 'CO', nameZh: '哥伦比亚', nameEn: 'Colombia' },
  { code: 'EG', nameZh: '埃及', nameEn: 'Egypt' },
  { code: 'NG', nameZh: '尼日利亚', nameEn: 'Nigeria' },
] as const

export type SalesCountryCode = typeof SALES_COUNTRIES[number]['code']

// 根据语言获取国家显示名称
export function getCountryDisplayName(code: string, locale: 'zh' | 'en'): string {
  const country = SALES_COUNTRIES.find(c => c.code === code)
  return country ? (locale === 'zh' ? country.nameZh : country.nameEn) : code
}

// 获取国家对象
export function getCountryByCode(code: string) {
  return SALES_COUNTRIES.find(c => c.code === code)
}