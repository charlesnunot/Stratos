'use client'

import { useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { useLocale } from 'next-intl'

interface ChartData {
  date: string
  value: number
  label?: string
}

interface StatsChartProps {
  title: string
  data: ChartData[]
  color?: string
}

export function StatsChart({ title, data, color = 'hsl(var(--primary))' }: StatsChartProps) {
  const locale = useLocale()
  const maxValue = useMemo(() => {
    return Math.max(...data.map(d => d.value), 1)
  }, [data])

  const bars = useMemo(() => {
    return data.map((item, index) => {
      const height = (item.value / maxValue) * 100
      return (
        <div key={index} className="flex flex-1 flex-col items-center gap-1">
          <div className="relative flex h-32 w-full items-end">
            <div
              className="w-full rounded-t transition-all hover:opacity-80"
              style={{
                height: `${height}%`,
                backgroundColor: color,
                minHeight: item.value > 0 ? '4px' : '0',
              }}
              title={`${item.label || item.date}: ${item.value}`}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {item.label || new Date(item.date).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
      )
    })
  }, [data, maxValue, color, locale])

  return (
    <Card className="p-6">
      <h3 className="mb-4 text-sm font-semibold">{title}</h3>
      <div className="flex items-end gap-2">{bars}</div>
    </Card>
  )
}
