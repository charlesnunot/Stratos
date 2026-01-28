'use client'

import React from 'react'
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
  // Mobile: one gutter size for list edge and card gap (4px); sm+: 16px
  const wrappedChildren = React.Children.map(children, (child) => {
    if (child == null) return null
    return <div className="mb-1 sm:mb-4">{child}</div>
  })

  return (
    <Masonry
      breakpointCols={breakpointCols}
      // Mobile: list edge pl-1 pr-1 = card gap pl-1 (same 4px); sm+: column gap -ml-4 + pl-4
      className="flex w-auto pl-1 pr-1 sm:pr-0 sm:pl-0 sm:-ml-4"
      columnClassName="pl-1 sm:pl-4 bg-clip-padding"
      style={{
        width: '100%',
      }}
    >
      {wrappedChildren}
    </Masonry>
  )
}
