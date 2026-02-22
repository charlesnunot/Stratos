'use client'

import React, { useState, useEffect } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, Search } from 'lucide-react'
import { useLocale } from 'next-intl'
import { SALES_COUNTRIES, getCountryDisplayName } from '@/lib/constants/sales-countries'

interface CountrySelectorProps {
  value: string[]
  onChange: (countries: string[]) => void
  label?: string
  placeholder?: string
  disabled?: boolean
}

export function CountrySelector({ 
  value, 
  onChange, 
  label = '销售国家/地区', 
  placeholder = '搜索国家...',
  disabled = false
}: CountrySelectorProps) {
  const locale = useLocale() as 'zh' | 'en'
  const [searchTerm, setSearchTerm] = useState('')
  const [selected, setSelected] = useState(value)

  // 当外部 value 变化时更新内部状态
  useEffect(() => {
    setSelected(value)
  }, [value])

  // 过滤国家列表
  const filteredCountries = SALES_COUNTRIES.filter(country => {
    const displayName = getCountryDisplayName(country.code, locale)
    return displayName.toLowerCase().includes(searchTerm.toLowerCase())
  })

  // 处理单个国家选择
  const handleToggleCountry = (code: string) => {
    if (disabled) return
    
    const newSelected = selected.includes(code)
      ? selected.filter(c => c !== code)
      : [...selected, code]
    setSelected(newSelected)
    onChange(newSelected)
  }

  // 全选/取消全选
  const handleSelectAll = () => {
    if (disabled) return
    
    const allFilteredCodes = filteredCountries.map(c => c.code) as string[]
    const newSelected = allFilteredCodes.every(code => (selected as string[]).includes(code))
      ? selected.filter(c => !allFilteredCodes.includes(c))
      : [...selected, ...allFilteredCodes.filter(code => !(selected as string[]).includes(code))]
    
    setSelected(newSelected)
    onChange(newSelected)
  }

  // 清除所有选择
  const handleClearAll = () => {
    if (disabled) return
    setSelected([])
    onChange([])
  }

  // 检查是否全选了过滤后的国家
  const isAllSelected = filteredCountries.length > 0 && 
    filteredCountries.every(code => selected.includes(code.code))

  // 检查是否有部分选择
  const isPartialSelected = filteredCountries.some(code => selected.includes(code.code)) && 
    !isAllSelected

  return (
    <Card className="p-4">
      {label && (
        <div className="mb-3 flex items-center justify-between">
          <Label className="text-sm font-medium">{label}</Label>
          {selected.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              disabled={disabled}
              className="h-7 px-2 text-xs"
            >
              <X className="mr-1 h-3 w-3" />
              清除
            </Button>
          )}
        </div>
      )}

      {/* 搜索框 */}
      <div className="mb-3 relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={placeholder}
          className="pl-9"
          disabled={disabled}
        />
      </div>

      {/* 全选按钮 */}
      {filteredCountries.length > 0 && (
        <div className="mb-2">
          <button
            type="button"
            onClick={handleSelectAll}
            disabled={disabled}
            className="flex items-center text-sm text-primary hover:underline"
          >
            <Checkbox
              checked={isAllSelected}
              indeterminate={isPartialSelected}
              onCheckedChange={handleSelectAll}
              disabled={disabled}
              className="mr-2"
            />
            {isAllSelected ? '取消全选' : '全选'}
          </button>
        </div>
      )}

      {/* 国家列表 */}
      <div className="max-h-60 overflow-y-auto space-y-2">
        {filteredCountries.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-4">
            未找到匹配的国家
          </div>
        ) : (
          filteredCountries.map(country => {
            const isSelected = selected.includes(country.code)
            const displayName = getCountryDisplayName(country.code, locale)
            
            return (
              <div key={country.code} className="flex items-center">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => handleToggleCountry(country.code)}
                  disabled={disabled}
                  className="mr-2"
                />
                <Label 
                  htmlFor={`country-${country.code}`}
                  className={`flex-1 text-sm cursor-pointer ${disabled ? 'text-muted-foreground' : ''}`}
                >
                  {displayName}
                </Label>
              </div>
            )
          })
        )}
      </div>

      {/* 已选择数量提示 */}
      {selected.length > 0 && (
        <div className="mt-3 text-xs text-muted-foreground">
          已选择 {selected.length} 个国家/地区
        </div>
      )}
    </Card>
  )
}