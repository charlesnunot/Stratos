'use client'

import { useEffect, useRef, useState } from 'react'
import Masonry from 'react-masonry-css'

interface MasonryGridProps {
  children: React.ReactNode
  breakpointCols?: {
    default?: number
    [key: number]: number
  }
}

export function MasonryGrid({ 
  children, 
  breakpointCols = {
    default: 5,
    1920: 5,
    1600: 4,
    1280: 3,
    960: 2,
    640: 2, // Mobile: 2 columns (consistent spacing)
  }
}: MasonryGridProps) {
  return (
    <Masonry
      breakpointCols={breakpointCols}
      className="flex w-auto -ml-2"
      columnClassName="pl-2 bg-clip-padding"
      style={{
        width: '100%',
      }}
    >
      {children}
    </Masonry>
  )
}
