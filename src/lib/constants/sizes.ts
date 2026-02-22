export const SIZE_NAME_MAP: Record<string, { zh: string; en: string }> = {
  // 常见尺寸描述
  '小号': { zh: '小号', en: 'Small' },
  '中号': { zh: '中号', en: 'Medium' },
  '大号': { zh: '大号', en: 'Large' },
  '特大号': { zh: '特大号', en: 'Extra Large' },
  '均码': { zh: '均码', en: 'One Size' },
  '小': { zh: '小', en: 'Small' },
  '中': { zh: '中', en: 'Medium' },
  '大': { zh: '大', en: 'Large' },
  '加大': { zh: '加大', en: 'Extra Large' },
  // 尺码缩写
  'S': { zh: 'S', en: 'S' },
  'M': { zh: 'M', en: 'M' },
  'L': { zh: 'L', en: 'L' },
  'XL': { zh: 'XL', en: 'XL' },
  'XXL': { zh: 'XXL', en: 'XXL' },
  'XXXL': { zh: 'XXXL', en: 'XXXL' },
  'XS': { zh: 'XS', en: 'XS' },
  'XXS': { zh: 'XXS', en: 'XXS' },
}

export function getLocalizedSizeName(name: string, locale: string): string {
  if (!name) return name
  const normalized = name.trim()
  const sizeEntry = SIZE_NAME_MAP[normalized]
  if (sizeEntry) {
    return locale === 'zh' ? sizeEntry.zh : sizeEntry.en
  }
  // 如果尺寸是纯数字规格（如"58×19×29cm"），直接返回原值
  return normalized
}
