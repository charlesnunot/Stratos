#!/usr/bin/env node
/**
 * Script 21 - Order refund request scenario regression
 *
 * Covers key scenarios for /api/orders/[id]/refund request policy:
 * 1) Duplicate request (same amount, pending/processing/approved/completed)
 * 2) Exceeding remaining refundable amount is rejected
 * 3) First partial refund is accepted
 * 4) Second partial refund after first completed is accepted within remaining amount
 */

function toAmount(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : NaN
}

function evaluateRefundRequest({ orderTotal, requestedAmount, existingRefunds }) {
  const completedRefundTotal = existingRefunds
    .filter((item) => item.status === 'completed')
    .reduce((sum, item) => sum + (toAmount(item.refund_amount) || 0), 0)

  const inflightRefundTotal = existingRefunds
    .filter((item) => item.status === 'pending' || item.status === 'processing' || item.status === 'approved')
    .reduce((sum, item) => sum + (toAmount(item.refund_amount) || 0), 0)

  const duplicate = existingRefunds.find((item) => {
    const itemAmount = toAmount(item.refund_amount)
    return Number.isFinite(itemAmount) && Math.abs(itemAmount - requestedAmount) < 0.0001
  })

  if (duplicate) {
    return { ok: true, duplicate: true, status: duplicate.status }
  }

  const remaining = orderTotal - completedRefundTotal - inflightRefundTotal
  if (requestedAmount > remaining + 0.01) {
    return { ok: false, error: `exceeds_remaining:${remaining.toFixed(2)}` }
  }

  return { ok: true, duplicate: false, remaining }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function run() {
  // 1) Duplicate request
  const duplicateCase = evaluateRefundRequest({
    orderTotal: 100,
    requestedAmount: 20,
    existingRefunds: [{ status: 'pending', refund_amount: 20 }],
  })
  assert(duplicateCase.ok && duplicateCase.duplicate, 'Case1 failed: duplicate should be detected')
  console.log('[OK] case1 duplicate request blocked')

  // 2) Exceed remaining
  const exceedCase = evaluateRefundRequest({
    orderTotal: 100,
    requestedAmount: 50,
    existingRefunds: [
      { status: 'completed', refund_amount: 30 },
      { status: 'processing', refund_amount: 30 },
    ],
  })
  assert(!exceedCase.ok, 'Case2 failed: exceeding remaining amount should be rejected')
  console.log('[OK] case2 exceed remaining rejected')

  // 3) First partial refund accepted
  const firstPartialCase = evaluateRefundRequest({
    orderTotal: 100,
    requestedAmount: 30,
    existingRefunds: [],
  })
  assert(firstPartialCase.ok && !firstPartialCase.duplicate, 'Case3 failed: first partial should pass')
  console.log('[OK] case3 first partial accepted')

  // 4) Second partial refund accepted within remaining
  const secondPartialCase = evaluateRefundRequest({
    orderTotal: 100,
    requestedAmount: 30,
    existingRefunds: [{ status: 'completed', refund_amount: 40 }],
  })
  assert(secondPartialCase.ok && !secondPartialCase.duplicate, 'Case4 failed: second partial should pass')
  console.log('[OK] case4 second partial accepted within remaining')

  console.log('\n[OK] Refund scenario regression passed.')
}

try {
  run()
  process.exit(0)
} catch (error) {
  console.error(`[FAIL] ${error.message || error}`)
  process.exit(1)
}
