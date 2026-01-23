export interface LogisticsTracking {
  tracking_number: string
  provider: string
  status: string
  current_location: string
  estimated_delivery: string | null
  tracking_details: Array<{
    time: string
    location: string
    status: string
  }>
}

// Map common provider names to KuaiDi100 codes
const PROVIDER_CODE_MAP: Record<string, string> = {
  '顺丰': 'shunfeng',
  '顺丰速运': 'shunfeng',
  'sf': 'shunfeng',
  '圆通': 'yuantong',
  '圆通速递': 'yuantong',
  'yt': 'yuantong',
  '申通': 'shentong',
  '申通快递': 'shentong',
  'st': 'shentong',
  '中通': 'zhongtong',
  '中通快递': 'zhongtong',
  'zt': 'zhongtong',
  '韵达': 'yunda',
  '韵达快递': 'yunda',
  'yd': 'yunda',
  'ems': 'ems',
  '中国邮政': 'ems',
  '邮政': 'ems',
  '京东': 'jd',
  '京东快递': 'jd',
  'jd': 'jd',
  '德邦': 'debangwuliu',
  '德邦物流': 'debangwuliu',
  '百世': 'huitongkuaidi',
  '百世快递': 'huitongkuaidi',
  '菜鸟': 'cainiao',
}

function getProviderCode(provider: string): string {
  const normalized = provider.toLowerCase().trim()
  return PROVIDER_CODE_MAP[normalized] || PROVIDER_CODE_MAP[provider] || normalized
}

function mapKuaiDi100Status(status: string): string {
  const statusMap: Record<string, string> = {
    '0': '运输中',
    '1': '揽件',
    '2': '疑难',
    '3': '已签收',
    '4': '退签',
    '5': '派件',
    '6': '退回',
    '7': '转投',
    '10': '待清关',
    '11': '清关中',
    '12': '已清关',
    '13': '清关异常',
    '14': '收件人拒签',
  }
  return statusMap[status] || status || '运输中'
}

async function queryKuaiDi100(
  trackingNumber: string,
  provider: string
): Promise<LogisticsTracking | null> {
  const customer = process.env.KUAIDI100_CUSTOMER
  const key = process.env.KUAIDI100_KEY

  if (!customer || !key) {
    console.warn('KuaiDi100 API credentials not configured, using mock data')
    return null
  }

  try {
    const com = getProviderCode(provider)
    const param = JSON.stringify({ com, num: trackingNumber })
    
    // Generate signature: MD5(param + key + customer).toUpperCase()
    const crypto = await import('crypto')
    const sign = crypto
      .createHash('md5')
      .update(param + key + customer)
      .digest('hex')
      .toUpperCase()

    const formData = new URLSearchParams({
      param,
      sign,
      customer,
    })

    const response = await fetch('https://poll.kuaidi100.com/poll/query.do', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })

    const data = await response.json()

    if (data.status !== '200') {
      console.error('KuaiDi100 API error:', data.message)
      return null
    }

    // Transform KuaiDi100 response to our format
    const trackingDetails = (data.data || []).map((item: any) => ({
      time: item.time,
      location: item.location || '',
      status: item.context || item.status || '运输中',
    }))

    // Get latest status
    const latestStatus = data.state || '0'
    const latestDetail = trackingDetails[0]

    return {
      tracking_number: trackingNumber,
      provider,
      status: mapKuaiDi100Status(latestStatus),
      current_location: latestDetail?.location || '未知',
      estimated_delivery: null, // KuaiDi100 doesn't provide this in basic query
      tracking_details: trackingDetails,
    }
  } catch (error: any) {
    console.error('KuaiDi100 API request failed:', error.message)
    return null
  }
}

function getMockTracking(
  trackingNumber: string,
  provider: string
): LogisticsTracking {
  return {
    tracking_number: trackingNumber,
    provider,
    status: '运输中',
    current_location: '北京中转站',
    estimated_delivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    tracking_details: [
      {
        time: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        location: '发货地',
        status: '已揽件',
      },
      {
        time: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        location: '北京中转站',
        status: '运输中',
      },
      {
        time: new Date().toISOString(),
        location: '北京中转站',
        status: '运输中',
      },
    ],
  }
}

export async function trackLogistics(
  trackingNumber: string,
  provider: string
): Promise<LogisticsTracking | null> {
  if (!trackingNumber || !provider) {
    console.error('Missing tracking number or provider')
    return null
  }

  // Try real API first
  const result = await queryKuaiDi100(trackingNumber, provider)

  // Fallback to mock data if API not available or fails
  if (!result) {
    console.warn('Using mock logistics data')
    return getMockTracking(trackingNumber, provider)
  }

  return result
}
