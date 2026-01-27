// Alipay payment helper functions
// Using Alipay Open Platform API

import { logPayment, LogLevel } from './logger'

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
  } catch (error: any) {
    logPayment(LogLevel.ERROR, 'Error getting platform Alipay config', {
      provider: 'alipay',
      error: error.message || 'Unknown error',
    })
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

// Generate Alipay timestamp format: "yyyy-MM-dd HH:mm:ss"
function getAlipayTimestamp(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

// Sign function using RSA-SHA256
function sign(data: string, privateKey: string): string {
  try {
    const sign = crypto.createSign('RSA-SHA256')
    sign.update(data, 'utf8')
    const signature = sign.sign(privateKey, 'base64')
    return signature
  } catch (error: any) {
    logPayment(LogLevel.ERROR, 'Alipay sign error', {
      provider: 'alipay',
      error: error.message || 'Unknown error',
    })
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
    logPayment(LogLevel.ERROR, 'Alipay verify signature error', {
      provider: 'alipay',
      error: error.message || 'Unknown error',
    })
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
    timestamp: getAlipayTimestamp(),
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
  } catch (error: any) {
    logPayment(LogLevel.ERROR, 'Alipay callback verification error', {
      provider: 'alipay',
      error: error.message || 'Unknown error',
    })
    return false
  }
}

export interface AlipayRefundParams {
  outTradeNo: string
  refundAmount: number
  refundReason?: string
  outRequestNo?: string
  tradeNo?: string // 支付宝交易号（与out_trade_no二选一）
}

export interface AlipayRefundResponse {
  code: string
  msg: string
  sub_code?: string
  sub_msg?: string
  out_trade_no?: string
  trade_no?: string
  buyer_logon_id?: string
  fund_change?: string
  refund_fee?: string
  refund_currency?: string
  gmt_refund_pay?: string
  refund_detail_item_list?: Array<{
    fund_channel: string
    amount: string
    real_amount: string
  }>
  store_name?: string
  buyer_user_id?: string
  refund_preset_paytool_list?: Array<{
    amount: string[]
    assert_type_code: string
  }>
  refund_settlement_id?: string
  present_refund_buyer_amount?: string
  present_refund_discount_amount?: string
  present_refund_mdiscount_amount?: string
}

/**
 * Create Alipay refund. Returns actual API response from Alipay.
 */
export async function createAlipayRefund(params: AlipayRefundParams): Promise<AlipayRefundResponse> {
  const currency = 'CNY' // Alipay typically uses CNY
  const config = await getAlipayConfig(currency)
  const { outTradeNo, refundAmount, refundReason, outRequestNo, tradeNo } = params

  // Build biz_content (at least one of out_trade_no or trade_no is required)
  const bizContent: Record<string, string> = {
    refund_amount: refundAmount.toFixed(2),
  }
  
  if (outTradeNo) {
    bizContent.out_trade_no = outTradeNo
  }
  if (tradeNo) {
    bizContent.trade_no = tradeNo
  }
  if (!outTradeNo && !tradeNo) {
    throw new Error('Either out_trade_no or trade_no must be provided')
  }
  
  if (refundReason) {
    bizContent.refund_reason = refundReason.substring(0, 256) // Max 256 chars
  }
  if (outRequestNo) {
    bizContent.out_request_no = outRequestNo.substring(0, 64) // Max 64 chars
  }

  // Build request parameters
  const requestParams: Record<string, string> = {
    app_id: config.appId,
    method: 'alipay.trade.refund',
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: getAlipayTimestamp(),
    version: '1.0',
    biz_content: JSON.stringify(bizContent),
  }

  // Sort parameters and build sign string
  const sortedKeys = Object.keys(requestParams).sort()
  const signString = sortedKeys
    .map(key => `${key}=${requestParams[key]}`)
    .join('&')

  // Generate signature
  const signature = sign(signString, config.privateKey)
  requestParams['sign'] = signature

  // Build query string for POST request
  const queryString = sortedKeys
    .map(key => `${key}=${encodeURIComponent(requestParams[key])}`)
    .concat([`sign=${encodeURIComponent(signature)}`])
    .join('&')

  // Make API request
  const response = await fetch(`${ALIPAY_GATEWAY}?${queryString}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })

  if (!response.ok) {
    throw new Error(`Alipay refund API request failed: ${response.statusText}`)
  }

  const responseData = await response.json()
  
  // Response format: { alipay_trade_refund_response: {...}, sign: "..." }
  const refundResponse = responseData.alipay_trade_refund_response as AlipayRefundResponse
  
  if (!refundResponse) {
    throw new Error('Invalid Alipay refund response format')
  }

  // Verify response signature
  const responseSign = responseData.sign
  if (responseSign) {
    // Build sign string from response object (exclude sign field)
    const responseSignString = Object.keys(refundResponse)
      .sort()
      .filter(key => {
        const value = refundResponse[key as keyof AlipayRefundResponse]
        return value !== undefined && value !== null && value !== '' && key !== 'sign'
      })
      .map(key => {
        const value = refundResponse[key as keyof AlipayRefundResponse]
        // Handle array values (convert to JSON string)
        if (Array.isArray(value)) {
          return `${key}=${JSON.stringify(value)}`
        }
        return `${key}=${value}`
      })
      .join('&')
    
    const isValid = verifySign(responseSignString, responseSign, config.publicKey)
    if (!isValid) {
      logPayment(LogLevel.WARN, 'Alipay refund response signature verification failed', {
        provider: 'alipay',
        outTradeNo,
        tradeNo,
      })
      // Continue processing but log warning (in production, you may want to fail)
    }
  }

  // Check if refund was successful
  if (refundResponse.code !== '10000') {
    throw new Error(
      `Alipay refund failed: ${refundResponse.msg}${refundResponse.sub_msg ? ` (${refundResponse.sub_msg})` : ''}`
    )
  }

  return refundResponse
}
