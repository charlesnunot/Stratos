'use client'

import { useEffect, useRef } from 'react'

type EntityType = 'post' | 'product' | 'profile'

/**
 * 记录一次浏览（PV/UV 统计）
 * 在帖子详情、商品详情、个人主页挂载时各调用一次即可；同一页面重复进入会重复计数（PV）。
 */
export function useTrackView(entityType: EntityType | null, entityId: string | null) {
  const sent = useRef(false)

  useEffect(() => {
    if (!entityType || !entityId) return
    if (sent.current) return
    sent.current = true

    fetch('/api/track/view', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ entityType, entityId }),
    }).catch(() => {})
  }, [entityType, entityId])
}
