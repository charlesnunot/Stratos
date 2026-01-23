/**
 * 验证并清理重定向 URL，防止开放重定向（Open Redirect）攻击
 * 
 * @param url - 要验证的重定向 URL
 * @param defaultUrl - 默认重定向 URL，如果验证失败则返回此值
 * @returns 验证通过的安全重定向路径，否则返回默认 URL
 */
export function validateRedirectUrl(url: string | null, defaultUrl = '/'): string {
  if (!url) return defaultUrl
  
  try {
    // 尝试解析 URL（支持相对路径和绝对路径）
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    
    // 只允许同源重定向
    if (typeof window !== 'undefined' && parsed.origin !== window.location.origin) {
      return defaultUrl
    }
    
    // 避免 JavaScript: 协议和其他危险协议
    const dangerousProtocols = ['javascript:', 'data:', 'vbscript:']
    if (dangerousProtocols.includes(parsed.protocol.toLowerCase())) {
      return defaultUrl
    }
    
    // 允许所有同源路径，不进行白名单限制（更灵活）
    // 如果需要更严格的控制，可以取消下面的注释
    // const allowedPaths = ['/', '/profile', '/settings', '/products', '/orders', '/cart']
    // if (!allowedPaths.some(path => parsed.pathname.startsWith(path))) {
    //   return defaultUrl
    // }
    
    // 返回路径和查询参数（不含 hash，防止 XSS）
    return parsed.pathname + parsed.search
  } catch {
    // URL 解析失败，返回默认 URL
    return defaultUrl
  }
}
