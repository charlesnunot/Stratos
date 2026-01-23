/**
 * WeChat Pay transfer integration
 * Handles money transfers to sellers via WeChat Pay enterprise payment API
 */

import crypto from 'crypto'

const WECHAT_PAY_GATEWAY = 'https://api.mch.weixin.qq.com'

interface WeChatTransferParams {
  mchId: string
  appId: string
  amount: number
  currency: string
  openid?: string // WeChat user openid for transfers
  partnerTradeNo?: string
}

interface WeChatTransferResult {
  success: boolean
  transferId?: string
  error?: string
}

function getWeChatConfig() {
  const mchId = process.env.WECHAT_MCH_ID
  const apiKey = process.env.WECHAT_API_KEY
  const appId = process.env.WECHAT_APP_ID

  if (!mchId || !apiKey || !appId) {
    throw new Error('WeChat Pay credentials not configured')
  }

  return {
    mchId,
    apiKey,
    appId,
  }
}

function generateWeChatSign(params: Record<string, string>, apiKey: string): string {
  // Sort parameters
  const sortedKeys = Object.keys(params).sort()
  const signString = sortedKeys
    .filter((key) => params[key] && key !== 'sign')
    .map((key) => `${key}=${params[key]}`)
    .join('&')
  const signStringWithKey = `${signString}&key=${apiKey}`

  // MD5 hash
  return crypto.createHash('md5').update(signStringWithKey, 'utf8').digest('hex').toUpperCase()
}

function buildWeChatXML(params: Record<string, string>): string {
  const xmlParts = Object.keys(params)
    .map((key) => `<${key}><![CDATA[${params[key]}]]></${key}>`)
    .join('')
  return `<xml>${xmlParts}</xml>`
}

function parseWeChatXML(xml: string): Record<string, string> {
  const result: Record<string, string> = {}
  const matches = xml.match(/<(\w+)><!\[CDATA\[(.*?)\]\]><\/\1>/g)
  if (matches) {
    matches.forEach((match) => {
      const keyMatch = match.match(/<(\w+)>/)
      const valueMatch = match.match(/<!\[CDATA\[(.*?)\]\]>/)
      if (keyMatch && valueMatch) {
        result[keyMatch[1]] = valueMatch[1]
      }
    })
  }
  return result
}

/**
 * Transfer money to seller via WeChat Pay
 * Note: This uses WeChat Pay's enterprise payment API (mmpaymkttransfers/promotion/transfers)
 */
export async function transferToWeChat({
  mchId,
  appId,
  amount,
  currency,
  openid,
  partnerTradeNo,
}: WeChatTransferParams): Promise<WeChatTransferResult> {
  try {
    const config = getWeChatConfig()

    // WeChat Pay requires openid for transfers
    if (!openid) {
      return {
        success: false,
        error: 'WeChat openid is required for transfers',
      }
    }

    // Convert amount to cents (WeChat Pay uses fen as unit)
    const amountInFen = Math.round(amount * 100)

    const params: Record<string, string> = {
      mch_appid: appId || config.appId,
      mchid: mchId || config.mchId,
      nonce_str: Math.random().toString(36).substring(2, 15),
      partner_trade_no: partnerTradeNo || `transfer_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      openid: openid,
      check_name: 'NO_CHECK', // or 'FORCE_CHECK' to verify real name
      amount: amountInFen.toString(),
      desc: 'Stratos平台转账',
      spbill_create_ip: '127.0.0.1', // Should be actual client IP in production
    }

    // Generate signature
    params.sign = generateWeChatSign(params, config.apiKey)

    // Build XML request
    const xmlBody = buildWeChatXML(params)

    // Make request to WeChat Pay API
    const response = await fetch(`${WECHAT_PAY_GATEWAY}/mmpaymkttransfers/promotion/transfers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
      },
      body: xmlBody,
      // Note: In production, you may need to include SSL certificate for WeChat Pay
    })

    if (!response.ok) {
      return {
        success: false,
        error: `WeChat Pay API request failed: ${response.statusText}`,
      }
    }

    const xmlResponse = await response.text()
    const responseData = parseWeChatXML(xmlResponse)

    // Verify response signature
    const returnSign = responseData.sign
    delete responseData.sign
    const calculatedSign = generateWeChatSign(responseData, config.apiKey)

    if (returnSign !== calculatedSign) {
      return {
        success: false,
        error: 'WeChat Pay response signature verification failed',
      }
    }

    if (responseData.return_code === 'SUCCESS' && responseData.result_code === 'SUCCESS') {
      return {
        success: true,
        transferId: responseData.payment_no || responseData.partner_trade_no,
      }
    }

    return {
      success: false,
      error: responseData.err_code_des || responseData.return_msg || 'WeChat Pay transfer failed',
    }
  } catch (error: any) {
    console.error('WeChat Pay transfer error:', error)
    return {
      success: false,
      error: error.message || 'Unknown error during WeChat Pay transfer',
    }
  }
}
