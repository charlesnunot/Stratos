// Alipay payment helper functions
// Using Alipay Open Platform API

const ALIPAY_GATEWAY = process.env.NODE_ENV === 'production'
  ? 'https://openapi.alipay.com/gateway.do'
  : 'https://openapi.alipaydev.com/gateway.do'

interface AlipayConfig {
  appId: string
  privateKey: string
  publicKey: string
  notifyUrl?: string
  returnUrl?: string
}

/**
 * Get platform Alipay configuration from database
 * Falls back to environment variables if not found
 */
async function getPlatformAlipayConfig(currency: string = 'CNY'): Promise<{ appId: string; privateKey: string; publicKey: string } | null> {
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_platform_payment_account', {
      p_currency: currency,
      p_account_type: 'alipay',
    })

    if (error || !data || data.length === 0) {
      return null
    }

    const account = data[0]
    const accountInfo = account.account_info as any

    if (accountInfo?.app_id && accountInfo?.private_key && accountInfo?.public_key) {
      return {
        appId: accountInfo.app_id,
        privateKey: accountInfo.private_key.replace(/\\n/g, '\n'),
        publicKey: accountInfo.public_key.replace(/\\n/g, '\n'),
      }
    }

    return null
  } catch (error) {
    console.error('Error getting platform Alipay config:', error)
    return null
  }
}

async function getAlipayConfig(currency: string = 'CNY'): Promise<AlipayConfig> {
  // Try to get config from database first
  let appId: string | null = null
  let privateKey: string | null = null
  let publicKey: string | null = null

  const platformConfig = await getPlatformAlipayConfig(currency)
  if (platformConfig) {
    appId = platformConfig.appId
    privateKey = platformConfig.privateKey
    publicKey = platformConfig.publicKey
  } else {
    // Fallback to environment variables
    appId = process.env.ALIPAY_APP_ID || null
    privateKey = process.env.ALIPAY_PRIVATE_KEY || null
    publicKey = process.env.ALIPAY_PUBLIC_KEY || null
  }

  if (!appId || !privateKey || !publicKey) {
    throw new Error('Alipay credentials not configured. Please set up a platform Alipay account or set ALIPAY_APP_ID, ALIPAY_PRIVATE_KEY, and ALIPAY_PUBLIC_KEY environment variables.')
  }

  return {
    appId,
    privateKey: privateKey.replace(/\\n/g, '\n'),
    publicKey: publicKey.replace(/\\n/g, '\n'),
    notifyUrl: process.env.ALIPAY_NOTIFY_URL,
    returnUrl: process.env.ALIPAY_RETURN_URL,
  }
}

import crypto from 'crypto'

// Sign function using RSA-SHA256
function sign(data: string, privateKey: string): string {
  try {
    const sign = crypto.createSign('RSA-SHA256')
    sign.update(data, 'utf8')
    const signature = sign.sign(privateKey, 'base64')
    return signature
  } catch (error: any) {
    console.error('Alipay sign error:', error)
    throw new Error(`Failed to sign data: ${error.message}`)
  }
}

// Verify signature using RSA-SHA256
function verifySign(data: string, signature: string, publicKey: string): boolean {
  try {
    const verify = crypto.createVerify('RSA-SHA256')
    verify.update(data, 'utf8')
    return verify.verify(publicKey, signature, 'base64')
  } catch (error: any) {
    console.error('Alipay verify signature error:', error)
    return false
  }
}

export interface CreateAlipayOrderParams {
  outTradeNo: string
  totalAmount: number
  subject: string
  body?: string
  returnUrl?: string
  notifyUrl?: string
  metadata?: Record<string, string>
}

export async function createAlipayOrder(params: CreateAlipayOrderParams) {
  const currency = 'CNY' // Alipay typically uses CNY
  const config = await getAlipayConfig(currency)
  
  const {
    outTradeNo,
    totalAmount,
    subject,
    body,
    returnUrl,
    notifyUrl,
    metadata,
  } = params

  // Build request parameters
  const bizContent = {
    out_trade_no: outTradeNo,
    total_amount: totalAmount.toFixed(2),
    subject,
    body: body || subject,
    product_code: 'QUICK_MSECURITY_PAY',
    ...(returnUrl && { return_url: returnUrl }),
    ...(notifyUrl && { notify_url: notifyUrl }),
    ...(metadata && { passback_params: JSON.stringify(metadata) }),
  }

  const requestParams = {
    app_id: config.appId,
    method: 'alipay.trade.app.pay',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: new Date().toISOString().replace(/[-:]/g, '').split('.')[0],
    version: '1.0',
    biz_content: JSON.stringify(bizContent),
  }

  // Sort and sign
  const sortedParams = Object.keys(requestParams)
    .sort()
    .map(key => `${key}=${requestParams[key as keyof typeof requestParams]}`)
    .join('&')

  const signature = sign(sortedParams, config.privateKey)
  requestParams['sign'] = signature

  // In production, this would return a payment URL or order string
  // For now, return the order information
  return {
    orderString: sortedParams + `&sign=${signature}`,
    outTradeNo,
    totalAmount,
    subject,
  }
}

export interface AlipayCallbackParams {
  out_trade_no: string
  trade_no: string
  trade_status: string
  total_amount: string
  [key: string]: string
}

export async function verifyAlipayCallback(params: AlipayCallbackParams): Promise<boolean> {
  try {
    const currency = 'CNY' // Alipay typically uses CNY
    const config = await getAlipayConfig(currency)
    const { sign: signature, ...otherParams } = params

    // Build sign string
    const signString = Object.keys(otherParams)
      .sort()
      .filter(key => otherParams[key] && key !== 'sign' && key !== 'sign_type')
      .map(key => `${key}=${otherParams[key]}`)
      .join('&')

    return verifySign(signString, signature || '', config.publicKey)
  } catch (error) {
    console.error('Alipay callback verification error:', error)
    return false
  }
}

export interface AlipayRefundParams {
  outTradeNo: string
  refundAmount: number
  refundReason?: string
  outRequestNo?: string
}

export async function createAlipayRefund(params: AlipayRefundParams) {
  const currency = 'CNY' // Alipay typically uses CNY
  const config = await getAlipayConfig(currency)
  const { outTradeNo, refundAmount, refundReason, outRequestNo } = params

  const bizContent = {
    out_trade_no: outTradeNo,
    refund_amount: refundAmount.toFixed(2),
    ...(refundReason && { refund_reason: refundReason }),
    ...(outRequestNo && { out_request_no: outRequestNo }),
  }

  const requestParams = {
    app_id: config.appId,
    method: 'alipay.trade.refund',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: new Date().toISOString().replace(/[-:]/g, '').split('.')[0],
    version: '1.0',
    biz_content: JSON.stringify(bizContent),
  }

  // In production, make actual API call to Alipay
  // For now, return mock response
  return {
    out_trade_no: outTradeNo,
    refund_amount: refundAmount.toFixed(2),
    refund_reason: refundReason || 'User requested refund',
  }
}
