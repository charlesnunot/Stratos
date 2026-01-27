/**
 * Environment variables validation
 * Validates required environment variables at startup
 */

const requiredEnvVars = {
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  
  // Optional payment providers (at least one should be configured)
  // Stripe
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  
  // PayPal
  PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
  
  // Alipay
  ALIPAY_APP_ID: process.env.ALIPAY_APP_ID,
  ALIPAY_PRIVATE_KEY: process.env.ALIPAY_PRIVATE_KEY,
  ALIPAY_PUBLIC_KEY: process.env.ALIPAY_PUBLIC_KEY,
  
  // WeChat Pay
  WECHAT_PAY_APP_ID: process.env.WECHAT_PAY_APP_ID,
  WECHAT_PAY_MCH_ID: process.env.WECHAT_PAY_MCH_ID,
  WECHAT_PAY_API_KEY: process.env.WECHAT_PAY_API_KEY,
  
  // Cron
  CRON_SECRET: process.env.CRON_SECRET,
} as const

export interface EnvValidationResult {
  valid: boolean
  missing: string[]
  warnings: string[]
}

/**
 * Validate environment variables
 * Returns validation result with missing and optional variables
 */
export function validateEnv(): EnvValidationResult {
  const missing: string[] = []
  const warnings: string[] = []

  // Required variables
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]

  for (const key of required) {
    if (!requiredEnvVars[key as keyof typeof requiredEnvVars]) {
      missing.push(key)
    }
  }

  // Optional but recommended
  const recommended = [
    'CRON_SECRET',
  ]

  for (const key of recommended) {
    if (!requiredEnvVars[key as keyof typeof requiredEnvVars]) {
      warnings.push(`${key} (recommended for production)`)
    }
  }

  // Check if at least one payment provider is configured
  const paymentProviders = [
    'STRIPE_SECRET_KEY',
    'PAYPAL_CLIENT_ID',
    'ALIPAY_APP_ID',
    'WECHAT_PAY_APP_ID',
  ]

  const hasPaymentProvider = paymentProviders.some(
    (key) => requiredEnvVars[key as keyof typeof requiredEnvVars]
  )

  if (!hasPaymentProvider) {
    warnings.push('No payment provider configured (at least one is recommended)')
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  }
}

/**
 * Validate and throw if invalid (for server-side use)
 */
export function validateEnvOrThrow(): void {
  const result = validateEnv()
  
  if (!result.valid) {
    throw new Error(
      `Missing required environment variables: ${result.missing.join(', ')}`
    )
  }

  if (result.warnings.length > 0 && process.env.NODE_ENV === 'production') {
    console.warn('Environment variable warnings:', result.warnings)
  }
}
