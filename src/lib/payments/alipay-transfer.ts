/**
 * Alipay transfer integration
 * Handles money transfers to sellers via Alipay transfer API
 */

import crypto from 'crypto'

const ALIPAY_GATEWAY = process.env.NODE_ENV === 'production'
  ? 'https://openapi.alipay.com/gateway.do'
  : 'https://openapi.alipaydev.com/gateway.do'

interface AlipayTransferParams {
  account: string
  realName: string
  amount: number
  currency: string
}

interface AlipayTransferResult {
  success: boolean
  transferId?: string
  error?: string
}

function getAlipayConfig() {
  const appId = process.env.ALIPAY_APP_ID
  const privateKey = process.env.ALIPAY_PRIVATE_KEY
  const publicKey = process.env.ALIPAY_PUBLIC_KEY

  if (!appId || !privateKey || !publicKey) {
    throw new Error('Alipay credentials not configured')
  }

  return {
    appId,
    privateKey: privateKey.replace(/\\n/g, '\n'),
    publicKey: publicKey.replace(/\\n/g, '\n'),
  }
}

function sign(data: string, privateKey: string): string {
  try {
    const sign = crypto.createSign('RSA-SHA256')
    sign.update(data, 'utf8')
    const signature = sign.sign(privateKey, 'base64')
    return signature
  } catch (error: any) {
    throw new Error(`Failed to sign data: ${error.message}`)
  }
}

/**
 * Transfer money to seller via Alipay
 * Note: This uses Alipay's transfer API (alipay.fund.trans.toaccount.transfer)
 */
export async function transferToAlipay({
  account,
  realName,
  amount,
  currency,
}: AlipayTransferParams): Promise<AlipayTransferResult> {
  try {
    const config = getAlipayConfig()

    // Alipay transfer API parameters
    const bizContent = {
      out_biz_no: `transfer_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      payee_type: 'ALIPAY_LOGONID', // or 'ALIPAY_USERID'
      payee_account: account,
      amount: amount.toFixed(2),
      payer_show_name: 'Stratos平台',
      payee_real_name: realName,
      remark: 'Stratos平台转账',
    }

    const params: Record<string, string> = {
      app_id: config.appId,
      method: 'alipay.fund.trans.toaccount.transfer',
      format: 'JSON',
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp: new Date().toISOString().replace(/[-:]/g, '').split('.')[0],
      version: '1.0',
      biz_content: JSON.stringify(bizContent),
    }

    // Sort parameters and build sign string
    const sortedKeys = Object.keys(params).sort()
    const signString = sortedKeys
      .map((key) => `${key}=${params[key]}`)
      .join('&')

    // Sign the request
    const signature = sign(signString, config.privateKey)
    params.sign = signature

    // Build request URL
    const queryString = Object.keys(params)
      .map((key) => `${key}=${encodeURIComponent(params[key])}`)
      .join('&')

    const response = await fetch(`${ALIPAY_GATEWAY}?${queryString}`, {
      method: 'GET',
    })

    if (!response.ok) {
      return {
        success: false,
        error: `Alipay API request failed: ${response.statusText}`,
      }
    }

    const data = await response.json()
    const responseData = data.alipay_fund_trans_toaccount_transfer_response

    if (responseData.code === '10000' && responseData.msg === 'Success') {
      return {
        success: true,
        transferId: responseData.order_id || responseData.out_biz_no,
      }
    }

    return {
      success: false,
      error: responseData.sub_msg || responseData.msg || 'Alipay transfer failed',
    }
  } catch (error: any) {
    console.error('Alipay transfer error:', error)
    return {
      success: false,
      error: error.message || 'Unknown error during Alipay transfer',
    }
  }
}
