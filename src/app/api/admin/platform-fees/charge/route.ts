/**
 * API endpoint for charging platform service fees
 * Platform fees are charged to platform payment accounts (not seller accounts)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createCheckoutSession } from '@/lib/payments/stripe'
import { createPayPalOrder } from '@/lib/payments/paypal'
import { createAlipayOrder } from '@/lib/payments/alipay'
import { createWeChatOrder } from '@/lib/payments/wechat'
import { getCurrencyFromBrowser } from '@/lib/currency/detect-currency'
import type { Currency } from '@/lib/currency/detect-currency'

export async function POST(request: NextRequest) {
  try {
    // Unified admin check
    const authResult = await requireAdmin(request)
    if (!authResult.success) {
      return authResult.response
    }

    const body = await request.json()
    const {
      userId,
      amount,
      currency,
      reason,
      paymentMethod,
      successUrl,
      cancelUrl,
    } = body

    if (!userId || !amount || !reason || !paymentMethod) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, amount, reason, paymentMethod' },
        { status: 400 }
      )
    }

    // Get admin client
    const supabaseAdmin = await getSupabaseAdmin()

    // Verify user exists
    const { data: targetUser, error: userError } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name')
      .eq('id', userId)
      .single()

    if (userError || !targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    const paymentCurrency = (currency || getCurrencyFromBrowser()).toUpperCase() as Currency
    const finalAmount = parseFloat(String(amount))

    // Create payment transaction record (pending)
    const { data: transaction, error: txError } = await supabaseAdmin
      .from('payment_transactions')
      .insert({
        type: 'order', // Using 'order' type for platform fees, could add 'platform_fee' type later
        provider: paymentMethod,
        provider_ref: `platform_fee_${userId}_${Date.now()}`,
        amount: finalAmount,
        currency: paymentCurrency,
        status: 'pending',
        related_id: userId,
        metadata: {
          type: 'platform_fee',
          reason,
          charged_by: user.id,
          charged_at: new Date().toISOString(),
        },
      })
      .select('id')
      .single()

    if (txError || !transaction) {
      console.error('Failed to create payment transaction:', txError)
      return NextResponse.json(
        { error: 'Failed to create payment transaction' },
        { status: 500 }
      )
    }

    // Create payment based on payment method
    let paymentUrl: string | null = null
    let formAction: string | null = null
    let formData: Record<string, string> | null = null
    let codeUrl: string | null = null

    const baseUrl = request.nextUrl.origin
    const finalSuccessUrl = successUrl || `${baseUrl}/admin/platform-fees?success=true`
    const finalCancelUrl = cancelUrl || `${baseUrl}/admin/platform-fees?cancelled=true`

    try {
      switch (paymentMethod) {
        case 'stripe': {
          const session = await createCheckoutSession(
            finalAmount,
            finalSuccessUrl,
            finalCancelUrl,
            {
              type: 'platform_fee',
              userId,
              reason,
              transactionId: transaction.id,
            },
            paymentCurrency.toLowerCase(),
            undefined // No destination account - goes to platform account
          )
          paymentUrl = session.url
          break
        }

        case 'paypal': {
          const order = await createPayPalOrder(
            finalAmount,
            paymentCurrency,
            {
              type: 'platform_fee',
              userId,
              reason,
              transactionId: transaction.id,
            }
          )
          paymentUrl = order.links?.find((link: any) => link.rel === 'approve')?.href || null
          break
        }

        case 'alipay': {
          const result = await createAlipayOrder(
            `platform_fee_${transaction.id}_${Date.now()}`,
            finalAmount,
            paymentCurrency,
            {
              type: 'platform_fee',
              userId,
              reason,
              transactionId: transaction.id,
            }
          )
          if (result.formAction && result.formData) {
            formAction = result.formAction
            formData = result.formData
          } else {
            paymentUrl = result.paymentUrl || null
          }
          break
        }

        case 'wechat': {
          const result = await createWeChatOrder(
            `platform_fee_${transaction.id}_${Date.now()}`,
            finalAmount,
            paymentCurrency,
            {
              type: 'platform_fee',
              userId,
              reason,
              transactionId: transaction.id,
            }
          )
          codeUrl = result.codeUrl || null
          break
        }

        case 'bank': {
          // For bank transfer, return transaction ID for manual processing
          return NextResponse.json({
            success: true,
            transactionId: transaction.id,
            message: '银行转账需要手动处理。请通知用户完成转账，并在收到凭证后审核。',
            requiresManualProcessing: true,
          })
        }

        default:
          return NextResponse.json(
            { error: `Unsupported payment method: ${paymentMethod}` },
            { status: 400 }
          )
      }
    } catch (paymentError: any) {
      console.error('Payment creation error:', paymentError)
      // Update transaction status to failed
      await supabaseAdmin
        .from('payment_transactions')
        .update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          failure_reason: paymentError.message || 'Payment creation failed',
        })
        .eq('id', transaction.id)

      return NextResponse.json(
        { error: `Failed to create payment: ${paymentError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      transactionId: transaction.id,
      paymentUrl,
      formAction,
      formData,
      codeUrl,
      message: '平台服务费支付已创建',
    })
  } catch (error: any) {
    console.error('Platform fee charge error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to charge platform fee' },
      { status: 500 }
    )
  }
}
