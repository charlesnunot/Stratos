/**
 * Affiliate attribution utilities
 * Handles affiliate_post_id tracking via URL parameters and cookies
 */

const AFFILIATE_POST_ID_COOKIE = 'affiliate_post_id'
const COOKIE_MAX_AGE_DAYS = 30 // 30 days expiration

/**
 * Get affiliate_post_id from URL search params
 */
export function getAffiliatePostIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  
  const params = new URLSearchParams(window.location.search)
  return params.get('ap') // 'ap' = affiliate_post_id
}

/**
 * Set affiliate_post_id in cookie
 */
export function setAffiliatePostIdCookie(affiliatePostId: string): void {
  if (typeof window === 'undefined') return
  
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60 // Convert days to seconds
  document.cookie = `${AFFILIATE_POST_ID_COOKIE}=${affiliatePostId}; max-age=${maxAge}; path=/; SameSite=Lax`
}

/**
 * Get affiliate_post_id from cookie
 */
export function getAffiliatePostIdFromCookie(): string | null {
  if (typeof window === 'undefined') return null
  
  const cookies = document.cookie.split(';')
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=')
    if (name === AFFILIATE_POST_ID_COOKIE) {
      return value || null
    }
  }
  return null
}

/**
 * Get affiliate_post_id with priority: URL param > Cookie
 */
export function getAffiliatePostId(): string | null {
  const fromUrl = getAffiliatePostIdFromUrl()
  if (fromUrl) {
    // If found in URL, update cookie
    setAffiliatePostIdCookie(fromUrl)
    return fromUrl
  }
  
  return getAffiliatePostIdFromCookie()
}

/**
 * Build product URL with affiliate_post_id parameter
 */
export function buildProductUrlWithAffiliate(productId: string, affiliatePostId?: string | null): string {
  const baseUrl = `/product/${productId}`
  
  if (affiliatePostId) {
    return `${baseUrl}?ap=${affiliatePostId}`
  }
  
  // If no affiliate_post_id provided, try to get from cookie
  const fromCookie = getAffiliatePostIdFromCookie()
  if (fromCookie) {
    return `${baseUrl}?ap=${fromCookie}`
  }
  
  return baseUrl
}

/**
 * Initialize affiliate attribution on page load
 * Call this in useEffect on pages that display products
 */
export function initializeAffiliateAttribution(): void {
  if (typeof window === 'undefined') return
  
  const affiliatePostId = getAffiliatePostIdFromUrl()
  if (affiliatePostId) {
    setAffiliatePostIdCookie(affiliatePostId)
  }
}
