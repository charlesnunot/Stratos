/**
 * Parse image URLs from multiline or comma-separated text.
 * Returns only valid http(s) URLs.
 */
export function parseImageUrls(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => {
      try {
        const u = new URL(s)
        return u.protocol === 'http:' || u.protocol === 'https:'
      } catch {
        return false
      }
    })
}
