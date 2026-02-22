'use client'

import { useEffect, useState, useCallback, useRef, useId } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isCurrencySupportedByPaymentMethod, getSettlementCurrency } from '@/lib/payments/currency-payment-support'
import type { Currency } from '@/lib/currency/detect-currency'

declare global {
  interface Window {
    paypal?: any
  }
}

interface PayPalButtonProps {
  amount: number
  currency?: string
  onSuccess: (orderId: string) => void
  onError?: (error: Error) => void
  disabled?: boolean
  metadata?: Record<string, string>
}

export function PayPalButton({
  amount,
  currency = 'USD',
  onSuccess,
  onError,
  disabled = false,
  metadata = {},
}: PayPalButtonProps) {
  const [clientId, setClientId] = useState<string | null>(null)
  // 多币种支持：计算 PayPal 实际使用的货币和金额
  const [payPalCurrency, setPayPalCurrency] = useState<string>(currency)
  const [payPalAmount, setPayPalAmount] = useState<number>(amount)
  const [configReady, setConfigReady] = useState(false)
  const [paypalLoaded, setPaypalLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const uniqueId = useId()
  const containerId = `paypal-btn-${uniqueId.replace(/:/g, '')}`
  const onSuccessRef = useRef(onSuccess)
  const onErrorRef = useRef(onError)
  const metadataRef = useRef(metadata)

  // Update refs when props change
  useEffect(() => {
    onSuccessRef.current = onSuccess
    onErrorRef.current = onError
    metadataRef.current = metadata
  }, [onSuccess, onError, metadata])

  // 多币种支持：计算 PayPal 实际使用的货币和金额
  useEffect(() => {
    const calculatePayPalCurrency = async () => {
      const userCurrency = currency as Currency
      
      // 检查 PayPal 是否支持用户货币
      if (isCurrencySupportedByPaymentMethod(userCurrency, 'paypal')) {
        setPayPalCurrency(userCurrency)
        setPayPalAmount(amount)
        return
      }
      
      // PayPal 不支持该货币，需要转换
      const settlementCurrency = getSettlementCurrency('paypal', userCurrency)
      setPayPalCurrency(settlementCurrency)
      
      // 查询汇率并转换金额
      try {
        const response = await fetch(`/api/exchange-rates?from=${userCurrency}&to=${settlementCurrency}`)
        if (response.ok) {
          const data = await response.json()
          if (data.rate) {
            const converted = amount * data.rate
            setPayPalAmount(converted)
            console.log(`[PayPalButton] Currency conversion: ${amount} ${userCurrency} -> ${converted.toFixed(2)} ${settlementCurrency} (rate: ${data.rate})`)
          } else {
            // 没有汇率，使用固定汇率
            const fallbackRates: Record<string, number> = {
              'CNY': 0.14,  // 1 CNY = 0.14 USD
              'EUR': 1.09,
              'GBP': 1.27,
            }
            const rate = fallbackRates[userCurrency] || 1
            setPayPalAmount(amount * rate)
          }
        } else {
          // API 失败，使用固定汇率
          const fallbackRates: Record<string, number> = {
            'CNY': 0.14,
            'EUR': 1.09,
            'GBP': 1.27,
          }
          const rate = fallbackRates[userCurrency] || 1
          setPayPalAmount(amount * rate)
        }
      } catch (error) {
        console.error('[PayPalButton] Error fetching exchange rate:', error)
        // 出错时使用固定汇率
        const fallbackRates: Record<string, number> = {
          'CNY': 0.14,
          'EUR': 1.09,
          'GBP': 1.27,
        }
        const rate = fallbackRates[userCurrency] || 1
        setPayPalAmount(amount * rate)
      }
    }
    
    calculatePayPalCurrency()
  }, [amount, currency])

  // 1. Fetch client config from API (same source as backend), fallback to env
  useEffect(() => {
    let cancelled = false
    const resolve = async () => {
      try {
        const res = await fetch(`/api/payments/paypal/client-config?currency=${encodeURIComponent(currency)}`)
        if (cancelled) return
        if (res.ok) {
          const data = await res.json()
          if (data.clientId?.trim()) {
            setClientId(data.clientId.trim())
            setConfigReady(true)
            return
          } else {
            console.error('[PayPalButton] API returned empty clientId')
          }
        } else {
          const errorData = await res.json().catch(() => ({}))
          console.error('[PayPalButton] API error:', res.status, errorData)
        }
      } catch (e) {
        if (cancelled) return
        console.error('[PayPalButton] Fetch error:', e)
        // Fallback to env
      }
      const fallback = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() || ''
      if (fallback) {
        console.log('[PayPalButton] Using fallback clientId from env')
        setClientId(fallback)
      } else {
        console.error('[PayPalButton] No PayPal clientId available from API or env')
        setClientId(null)
      }
      setConfigReady(true)
    }
    resolve()
    return () => { cancelled = true }
  }, [currency, retryKey])

  // 2. Load PayPal SDK once we have clientId
  useEffect(() => {
    if (!configReady || !clientId) return

    const errMsg =
      'PayPal SDK 未能加载（可能被网络、代理或浏览器扩展拦截），请点击下方重试或改用其他支付方式。'
    const markLoaded = () => {
      setLoadError(null)
      setPaypalLoaded(true)
    }
    const markFailed = () => {
      setLoadError(errMsg)
      if (onErrorRef.current) onErrorRef.current(new Error(errMsg))
    }

    // Script already in page: wait for window.paypal (might still be loading)
    const existingScript = document.querySelector('script[src^="https://www.paypal.com/sdk/js"]')
    if (existingScript) {
      if (window.paypal) {
        setPaypalLoaded(true)
        return
      }
      const timeoutMs = 15000
      const started = Date.now()
      const timer = setInterval(() => {
        if (window.paypal) {
          clearInterval(timer)
          setPaypalLoaded(true)
        } else if (Date.now() - started > timeoutMs) {
          clearInterval(timer)
          markFailed()
        }
      }, 200)
      return () => clearInterval(timer)
    }

    const script = document.createElement('script')
    // 多币种支持：使用 payPalCurrency（可能是转换后的货币如 USD）
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${payPalCurrency}&intent=capture`
    script.async = true
    script.onload = () => {
      // 脚本加载后，检查 window.paypal 是否真的可用
      // PayPal SDK 可能会在无效 clientId 时加载但不初始化
      setTimeout(() => {
        if (window.paypal && window.paypal.Buttons) {
          markLoaded()
        } else {
          console.error('[PayPalButton] Script loaded but window.paypal not available. Invalid clientId?')
          markFailed()
        }
      }, 500)
    }
    script.onerror = (e) => {
      console.error('[PayPalButton] Script load error:', e)
      markFailed()
    }
    document.body.appendChild(script)

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script)
      }
    }
  }, [configReady, clientId, payPalCurrency, retryKey])

  const handleRetry = useCallback(() => {
    const script = document.querySelector('script[src^="https://www.paypal.com/sdk/js"]')
    if (script && script.parentNode) script.parentNode.removeChild(script)
    if ((window as any).paypal) (window as any).paypal = undefined
    setLoadError(null)
    setPaypalLoaded(false)
    setRetryKey((k) => k + 1)
  }, [])

  const createOrder = useCallback(async (): Promise<string> => {
    try {
      setProcessing(true)
      // 多币种支持：使用转换后的金额和货币
      const response = await fetch('/api/payments/paypal/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: payPalAmount,
          currency: payPalCurrency,
          // 保存原始货币信息到 metadata
          ...metadataRef.current,
          userCurrency: currency,
          userAmount: String(amount),
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create PayPal order')
      }

      const data = await response.json()
      return data.orderId
    } catch (error: any) {
      console.error('PayPal create order error:', error)
      if (onErrorRef.current) onErrorRef.current(error)
      throw error
    } finally {
      setProcessing(false)
    }
  }, [amount, currency, payPalAmount, payPalCurrency])

  const onApprove = useCallback(async (data: any) => {
    try {
      setProcessing(true)
      
      // Capture the order
      const response = await fetch('/api/payments/paypal/capture-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: data.orderID }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to capture PayPal order')
      }

      const result = await response.json()
      
      if (result.status === 'COMPLETED') {
        if (onSuccessRef.current) {
          onSuccessRef.current(data.orderID)
        }
      } else {
        throw new Error(`Payment not completed: ${result.status}`)
      }
    } catch (error: any) {
      console.error('PayPal capture error:', error)
      if (onErrorRef.current) onErrorRef.current(error)
    } finally {
      setProcessing(false)
    }
  }, [])

  useEffect(() => {
    if (!paypalLoaded || !window.paypal || disabled) return

    // Render PayPal button
    const buttons = window.paypal.Buttons({
      style: {
        layout: 'vertical',
        color: 'blue',
        shape: 'rect',
        label: 'paypal',
      },
      createOrder: createOrder,
      onApprove: onApprove,
      onError: (err: any) => {
        console.error('PayPal button error:', err)
        if (onErrorRef.current) {
          onErrorRef.current(new Error(err.message || 'PayPal payment error'))
        }
      },
    })

    const container = document.getElementById(containerId)
    if (container) {
      // Clear previous buttons safely (remove all child nodes)
      while (container.firstChild) {
        container.removeChild(container.firstChild)
      }
      buttons.render(container).catch((err: any) => {
        console.error('PayPal button render error:', err)
      })
    }

    return () => {
      const container = document.getElementById(containerId)
      if (container) {
        // Clear safely using removeChild instead of innerHTML
        while (container.firstChild) {
          container.removeChild(container.firstChild)
        }
      }
    }
  }, [paypalLoaded, disabled, containerId, createOrder, onApprove])

  if (configReady && !clientId) {
    return (
      <div className="rounded-md border border-dashed border-muted-foreground/25 p-4 text-center text-sm text-muted-foreground">
        PayPal未配置：请配置平台收款账户或设置 NEXT_PUBLIC_PAYPAL_CLIENT_ID
      </div>
    )
  }

  if (!configReady) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">加载PayPal配置...</span>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-4 text-center text-sm space-y-3">
        <p className="text-amber-700 dark:text-amber-400">{loadError}</p>
        <p className="text-muted-foreground">
          您可改用上方 Stripe、支付宝或微信等支付方式完成订阅。
        </p>
        <Button type="button" variant="outline" size="sm" onClick={handleRetry}>
          重试加载 PayPal
        </Button>
      </div>
    )
  }

  if (!paypalLoaded) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">加载PayPal...</span>
      </div>
    )
  }

  // 重要：processing 时也必须保持容器挂载，否则会导致 "Detected container element removed from DOM"
  // 因为 createOrder 期间若卸载容器，PayPal 弹窗会异常
  return (
    <div className="relative">
      {processing && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 rounded-md">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">处理支付...</span>
        </div>
      )}
      <div id={containerId}></div>
    </div>
  )
}
