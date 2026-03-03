#!/usr/bin/env node
/**
 * Script 22 - Payment chain static check (provider matrix)
 *
 * Validates critical link points in code for:
 * - Stripe
 * - PayPal
 * - Alipay
 * - WeChat
 *
 * Checks create-order entry + callback/webhook processing + order/payment linkage/error handling.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

function read(relPath) {
  const full = path.join(ROOT, relPath)
  if (!fs.existsSync(full)) {
    throw new Error(`missing file: ${relPath}`)
  }
  return fs.readFileSync(full, 'utf8')
}

function mustInclude(content, pattern, label) {
  if (!content.includes(pattern)) {
    throw new Error(`missing "${pattern}" in ${label}`)
  }
}

function checkStripe() {
  const createOrder = read('src/app/api/payments/stripe/create-order-checkout-session/route.ts')
  const webhook = read('src/app/api/payments/stripe/webhook/route.ts')

  mustInclude(createOrder, 'createCheckoutSession(', 'stripe create-order')
  mustInclude(createOrder, 'orderId: orderId', 'stripe create-order')
  mustInclude(webhook, 'process_webhook_event', 'stripe webhook')
  mustInclude(webhook, 'processOrderPayment', 'stripe webhook')
  mustInclude(webhook, "from('webhook_events')", 'stripe webhook rollback')
  mustInclude(webhook, '.delete()', 'stripe webhook rollback')
  mustInclude(webhook, 'payment_intent_id', 'stripe order payment reference update')
}

function checkPayPal() {
  const createOrder = read('src/app/api/payments/paypal/create-order/route.ts')
  const captureOrder = read('src/app/api/payments/paypal/capture-order/route.ts')
  const webhook = read('src/app/api/payments/paypal/webhook/route.ts')

  mustInclude(createOrder, 'metadata', 'paypal create-order')
  mustInclude(captureOrder, 'processOrderPayment', 'paypal capture-order')
  mustInclude(captureOrder, "if (!result.success)", 'paypal capture-order fail handling')
  mustInclude(captureOrder, 'payment_intent_id', 'paypal order payment reference update')
  mustInclude(webhook, 'process_webhook_event', 'paypal webhook')
  mustInclude(webhook, "from('webhook_events')", 'paypal webhook rollback')
  mustInclude(webhook, '.delete()', 'paypal webhook rollback')
}

function checkAlipay() {
  const createOrder = read('src/app/api/payments/alipay/create-order/route.ts')
  const callback = read('src/app/api/payments/alipay/callback/route.ts')

  mustInclude(createOrder, 'outTradeNo', 'alipay create-order')
  mustInclude(callback, 'process_webhook_event', 'alipay callback')
  mustInclude(callback, 'processOrderPayment', 'alipay callback')
  mustInclude(callback, "if (!result.success)", 'alipay callback fail handling')
  mustInclude(callback, 'payment_intent_id', 'alipay order payment reference update')
}

function checkWeChat() {
  const createOrder = read('src/app/api/payments/wechat/create-order/route.ts')
  const notify = read('src/app/api/payments/wechat/notify/route.ts')

  mustInclude(createOrder, 'outTradeNo', 'wechat create-order')
  mustInclude(notify, 'process_webhook_event', 'wechat notify')
  mustInclude(notify, 'processOrderPayment', 'wechat notify')
  mustInclude(notify, 'failXml', 'wechat notify failure response')
  mustInclude(notify, "if (!result.success)", 'wechat notify fail handling')
}

function run() {
  checkStripe()
  console.log('[OK] stripe chain points validated')

  checkPayPal()
  console.log('[OK] paypal chain points validated')

  checkAlipay()
  console.log('[OK] alipay chain points validated')

  checkWeChat()
  console.log('[OK] wechat chain points validated')

  console.log('\n[OK] Payment chain static check passed.')
}

try {
  run()
  process.exit(0)
} catch (error) {
  console.error(`[FAIL] ${error.message || error}`)
  process.exit(1)
}
