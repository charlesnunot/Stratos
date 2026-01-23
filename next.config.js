const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // GitHub Pages配置
  output: 'export',
  basePath: process.env.NODE_ENV === 'production' ? '/Stratos' : '',
  assetPrefix: process.env.NODE_ENV === 'production' ? '/Stratos' : '',
  images: {
    unoptimized: true, // GitHub Pages需要禁用图片优化
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
  // Font optimization settings
  optimizeFonts: true,
  // Performance optimizations
  // experimental: {
  //   optimizeCss: true, // Temporarily disabled to avoid build issues
  // },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false
    }
    return config
  },
}

module.exports = withNextIntl(nextConfig)
