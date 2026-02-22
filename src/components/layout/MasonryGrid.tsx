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
    default: 4,
    1920: 4,
    1600: 3,
    1280: 3,
    960: 2,
    640: 2, // Mobile: 2 columns (consistent spacing)
  }
}: MasonryGridProps) {
  // Mobile: one gutter size for list edge and card gap (4px); sm+: 16px
  const wrappedChildren = React.Children.map(children, (child) => {
    if (child == null) return null
    return <div className="mb-2 sm:mb-4">{child}</div>
  })

  return (
    <Masonry
      breakpointCols={breakpointCols}
      className="flex w-full"
      columnClassName="pl-2 sm:pl-4 pr-2 sm:pr-4"
    >
      {wrappedChildren}
    </Masonry>
  )
}
