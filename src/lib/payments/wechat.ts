// WeChat Pay payment helper functions
// Using WeChat Pay Native Payment API

import { logPayment, LogLevel } from './logger'

const WECHAT_PAY_API_BASE = process.env.NODE_ENV === 'production'
  ? 'https://api.mch.weixin.qq.com'
  : 'https://api.mch.weixin.qq.com' // Sandbox API (if available)

import crypto from 'crypto'
import https from 'https'
import fs from 'fs'

interface WeChatPayConfig {
  appId: string
  mchId: string
  apiKey: string
  certPath?: string
  keyPath?: string
}

/**
 * Get platform WeChat Pay configuration from database
 * Falls back to environment variables if not found
 */
async function getPlatformWeChatConfig(currency: string = 'CNY'): Promise<{ appId: string; mchId: string; apiKey: string } | null> {
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_platform_payment_account', {
      p_currency: currency,
      p_account_type: 'wechat',
    })

    if (error || !data || data.length === 0) {
      return null
    }

    const account = data[0]
    const accountInfo = account.account_info as any

    if (accountInfo?.app_id && accountInfo?.mch_id && accountInfo?.api_key) {
      return {
        appId: accountInfo.app_id,
        mchId: accountInfo.mch_id,
        apiKey: accountInfo.api_key,
      }
    }

    return null
  } catch (error: any) {
    logPayment(LogLevel.ERROR, 'Error getting platform WeChat Pay config', {
      provider: 'wechat',
      error: error.message || 'Unknown error',
    })
    return null
  }
}

async function getWeChatPayConfig(currency: string = 'CNY'): Promise<WeChatPayConfig> {
  // Try to get config from database first
  let appId: string | null = null
  let mchId: string | null = null
  let apiKey: string | null = null

  const platformConfig = await getPlatformWeChatConfig(currency)
  if (platformConfig) {
    appId = platformConfig.appId
    mchId = platformConfig.mchId
    apiKey = platformConfig.apiKey
  } else {
    // Fallback to environment variables
    appId = process.env.WECHAT_PAY_APP_ID || null
    mchId = process.env.WECHAT_PAY_MCH_ID || null
    apiKey = process.env.WECHAT_PAY_API_KEY || null
  }

  if (!appId || !mchId || !apiKey) {
    throw new Error('WeChat Pay credentials not configured. Please set up a platform WeChat Pay account or set WECHAT_PAY_APP_ID, WECHAT_PAY_MCH_ID, and WECHAT_PAY_API_KEY environment variables.')
  }

  return {
    appId,
    mchId,
    apiKey,
    certPath: process.env.WECHAT_PAY_CERT_PATH,
    keyPath: process.env.WECHAT_PAY_KEY_PATH,
  }
}

// Generate sign for WeChat Pay request
function generateWeChatPaySign(params: Record<string, string>, apiKey: string): string {
  // Sort parameters and build query string
  const sortedKeys = Object.keys(params).filter(key => params[key] && key !== 'sign').sort()
  const queryString = sortedKeys.map(key => `${key}=${params[key]}`).join('&')
  const signString = `${queryString}&key=${apiKey}`
  
  // Generate MD5 hash and convert to uppercase
  const hash = crypto.createHash('md5').update(signString, 'utf8').digest('hex')
  return hash.toUpperCase()
}

// Verify WeChat Pay callback signature
export function verifyWeChatPaySign(params: Record<string, string>, apiKey: string): boolean {
  const receivedSign = params.sign
  if (!receivedSign) return false

  const calculatedSign = generateWeChatPaySign(params, apiKey)
  return receivedSign === calculatedSign
}

export interface CreateWeChatPayOrderParams {
  outTradeNo: string
  totalAmount: number // Amount in CNY, will be converted to fen (cents)
  description: string
  notifyUrl: string
  clientIp?: string
}

export interface WeChatPayOrderResponse {
  returnCode: string
  returnMsg: string
  appId?: string
  mchId?: string
  nonceStr?: string
  sign?: string
  resultCode?: string
  prepayId?: string
  codeUrl?: string
  errCode?: string
  errCodeDes?: string
}

export async function createWeChatPayOrder(params: CreateWeChatPayOrderParams): Promise<WeChatPayOrderResponse> {
  const currency = 'CNY' // WeChat Pay typically uses CNY
  const config = await getWeChatPayConfig(currency)
  const { outTradeNo, totalAmount, description, notifyUrl, clientIp } = params

  // Convert amount to fen (1 CNY = 100 fen)
  const totalFee = Math.round(totalAmount * 100)

  // Generate nonce string
  const nonceStr = crypto.randomBytes(16).toString('hex')

  // Build request parameters
  const requestParams: Record<string, string> = {
    appid: config.appId,
    mch_id: config.mchId,
    nonce_str: nonceStr,
    body: description.substring(0, 127), // Max 127 characters
    out_trade_no: outTradeNo,
    total_fee: totalFee.toString(),
    spbill_create_ip: clientIp || '127.0.0.1',
    notify_url: notifyUrl,
    trade_type: 'NATIVE',
  }

  // Generate signature
  const sign = generateWeChatPaySign(requestParams, config.apiKey)
  requestParams.sign = sign

  // Convert to XML manually (simple approach without xml2js)
  const xml = `<xml>${Object.entries(requestParams)
    .map(([key, value]) => `<${key}><![CDATA[${value}]]></${key}>`)
    .join('')}</xml>`

  // Make API request
  const response = await fetch(`${WECHAT_PAY_API_BASE}/pay/unifiedorder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/xml',
    },
    body: xml,
  })

  if (!response.ok) {
    throw new Error(`WeChat Pay API request failed: ${response.statusText}`)
  }

  const responseText = await response.text()
  
  // Parse XML response (simple regex-based parser)
  const parseWeChatPayXML = (xml: string): Record<string, string> => {
    const result: Record<string, string> = {}
    const matches = xml.matchAll(/<(\w+)><!\[CDATA\[([^\]]+)\]\]><\/\1>/g)
    for (const match of matches) {
      result[match[1]] = match[2]
    }
    return result
  }

  const parsed = parseWeChatPayXML(responseText)
  return parsed as unknown as WeChatPayOrderResponse
}

export interface WeChatPayNotifyParams {
  return_code: string
  return_msg?: string
  appid?: string
  mch_id?: string
  nonce_str?: string
  sign?: string
  result_code?: string
  openid?: string
  trade_type?: string
  bank_type?: string
  total_fee?: string
  cash_fee?: string
  transaction_id?: string
  out_trade_no?: string
  time_end?: string
}

export async function verifyWeChatPayNotify(params: WeChatPayNotifyParams): Promise<boolean> {
  const currency = 'CNY' // WeChat Pay typically uses CNY
  const config = await getWeChatPayConfig(currency)
  return verifyWeChatPaySign(params as Record<string, string>, config.apiKey)
}

function parseWeChatPayXML(xml: string): Record<string, string> {
  const result: Record<string, string> = {}
  const cdataMatches = xml.matchAll(/<(\w+)><!\[CDATA\[([^\]]*)\]\]><\/\1>/g)
  for (const m of cdataMatches) result[m[1]] = m[2]
  const plainMatches = xml.matchAll(/<(\w+)>([^<]*)<\/\1>/g)
  for (const m of plainMatches) {
    if (!result[m[1]]) result[m[1]] = m[2]
  }
  return result
}

export interface CreateWeChatPayRefundParams {
  transactionId: string
  outTradeNo: string
  totalFeeFen: number
  refundFeeFen: number
  outRefundNo: string
  refundDesc?: string
}

export interface WeChatPayRefundResponse {
  return_code: string
  return_msg?: string
  result_code?: string
  err_code?: string
  err_code_des?: string
  appid?: string
  mch_id?: string
  nonce_str?: string
  sign?: string
  transaction_id?: string
  out_trade_no?: string
  out_refund_no?: string
  refund_id?: string
  refund_fee?: string
  total_fee?: string
}

/**
 * WeChat Pay refund. Requires API certificate (WECHAT_PAY_CERT_PATH, WECHAT_PAY_KEY_PATH).
 * Amounts in fen (1 CNY = 100 fen).
 */
export async function createWeChatPayRefund(
  params: CreateWeChatPayRefundParams
): Promise<WeChatPayRefundResponse> {
  const currency = 'CNY'
  const config = await getWeChatPayConfig(currency)

  if (!config.certPath || !config.keyPath) {
    throw new Error(
      'WeChat Pay refund requires API certificate. Set WECHAT_PAY_CERT_PATH and WECHAT_PAY_KEY_PATH.'
    )
  }

  const nonceStr = crypto.randomBytes(16).toString('hex')
  const requestParams: Record<string, string> = {
    appid: config.appId,
    mch_id: config.mchId,
    nonce_str: nonceStr,
    transaction_id: params.transactionId,
    out_trade_no: params.outTradeNo,
    out_refund_no: params.outRefundNo,
    total_fee: String(params.totalFeeFen),
    refund_fee: String(params.refundFeeFen),
  }
  if (params.refundDesc) requestParams.refund_desc = params.refundDesc.substring(0, 80)

  const sign = generateWeChatPaySign(requestParams, config.apiKey)
  requestParams.sign = sign

  const xml = `<xml>${Object.entries(requestParams)
    .map(([k, v]) => `<${k}><![CDATA[${v}]]></${k}>`)
    .join('')}</xml>`

  const cert = fs.readFileSync(config.certPath)
  const key = fs.readFileSync(config.keyPath)
  const agent = new https.Agent({ cert, key })

  const url = new URL(`${WECHAT_PAY_API_BASE}/secapi/pay/refund`)
  const res = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        agent,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () =>
          resolve({ statusCode: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') })
        )
      }
    )
    req.on('error', reject)
    req.write(xml)
    req.end()
  })

  const parsed = parseWeChatPayXML(res.body) as unknown as WeChatPayRefundResponse
  if (parsed.return_code !== 'SUCCESS') {
    throw new Error(`WeChat Pay refund return: ${parsed.return_msg || parsed.return_code}`)
  }
  if (parsed.result_code !== 'SUCCESS') {
    throw new Error(
      `WeChat Pay refund failed: ${parsed.err_code_des || parsed.err_code || 'unknown'}`
    )
  }
  return parsed
}
