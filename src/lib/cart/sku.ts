// Cart CRDT System - SKU Management
// ============================================================
// SKU generation and parsing for cart CRDT system
// ============================================================

export interface SkuComponents {
  product_id: string
  color: string | null
  size: string | null
}

/**
 * Generate SKU ID from product ID and variant information
 */
export function generateSkuId(
  productId: string,
  color: string | null = null,
  size: string | null = null
): string {
  const normalizedColor = color === undefined || color === null ? 'null' : color
  const normalizedSize = size === undefined || size === null ? 'null' : size
  
  return `${productId}-${normalizedColor}-${normalizedSize}`
}

/**
 * Parse SKU ID into product ID and variant components
 */
export function parseSkuId(skuId: string): SkuComponents {
  const parts = skuId.split('-')
  
  if (parts.length < 3) {
    throw new Error(`Invalid SKU ID format: ${skuId}`)
  }
  
  // Product ID is everything except the last two parts
  const productId = parts.slice(0, -2).join('-')
  const color = parts[parts.length - 2] === 'null' ? null : parts[parts.length - 2]
  const size = parts[parts.length - 1] === 'null' ? null : parts[parts.length - 1]
  
  return {
    product_id: productId,
    color,
    size
  }
}

/**
 * Validate SKU ID format
 */
export function validateSkuId(skuId: string): boolean {
  try {
    parseSkuId(skuId)
    return true
  } catch {
    return false
  }
}

/**
 * Check if two SKU IDs represent the same product variant
 */
export function areSkuIdsEqual(skuId1: string, skuId2: string): boolean {
  try {
    const components1 = parseSkuId(skuId1)
    const components2 = parseSkuId(skuId2)
    
    return (
      components1.product_id === components2.product_id &&
      components1.color === components2.color &&
      components1.size === components2.size
    )
  } catch {
    return false
  }
}