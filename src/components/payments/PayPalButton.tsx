'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Loader2 } from 'lucide-react'

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
  const [paypalLoaded, setPaypalLoaded] = useState(false)
  const [processing, setProcessing] = useState(false)
  const containerId = `paypal-button-container-${Math.random().toString(36).substring(7)}`
  const onSuccessRef = useRef(onSuccess)
  const onErrorRef = useRef(onError)
  const metadataRef = useRef(metadata)

  // Update refs when props change
  useEffect(() => {
    onSuccessRef.current = onSuccess
    onErrorRef.current = onError
    metadataRef.current = metadata
  }, [onSuccess, onError, metadata])

  useEffect(() => {
    // Load PayPal SDK
    const script = document.createElement('script')
    script.src = `https://www.paypal.com/sdk/js?client-id=${process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || ''}&currency=${currency}`
    script.async = true
    script.onload = () => setPaypalLoaded(true)
    script.onerror = () => {
      console.error('Failed to load PayPal SDK')
      if (onErrorRef.current) {
        onErrorRef.current(new Error('Failed to load PayPal SDK'))
      }
    }
    document.body.appendChild(script)

    return () => {
      // Cleanup
      if (document.body.contains(script)) {
        document.body.removeChild(script)
      }
    }
  }, [currency])

  const createOrder = useCallback(async (): Promise<string> => {
    try {
      setProcessing(true)
      const response = await fetch('/api/payments/paypal/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          currency,
          ...metadataRef.current,
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
  }, [amount, currency])

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
      // Clear previous buttons
      container.innerHTML = ''
      buttons.render(container).catch((err: any) => {
        console.error('PayPal button render error:', err)
      })
    }

    return () => {
      const container = document.getElementById(containerId)
      if (container) {
        container.innerHTML = ''
      }
    }
  }, [paypalLoaded, disabled, containerId, createOrder, onApprove])

  if (!process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID) {
    return (
      <div className="rounded-md border border-dashed border-muted-foreground/25 p-4 text-center text-sm text-muted-foreground">
        PayPal未配置
      </div>
    )
  }

  if (!paypalLoaded || processing) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          {processing ? '处理支付...' : '加载PayPal...'}
        </span>
      </div>
    )
  }

  return (
    <div>
      <div id={containerId}></div>
    </div>
  )
}
