/**
 * Structured logging for payment operations
 * Provides consistent logging format with key information
 */

export interface PaymentLogContext {
  userId?: string
  orderId?: string
  subscriptionId?: string
  tipId?: string
  amount?: number
  currency?: string
  paymentMethod?: string
  provider?: string
  transactionId?: string
  transferId?: string
  [key: string]: any
}

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Create structured log entry
 */
function createLogEntry(
  level: LogLevel,
  message: string,
  context?: PaymentLogContext
): string {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    category: 'payment',
    message,
    ...context,
  }

  return JSON.stringify(logEntry)
}

/**
 * Log payment operation
 */
export function logPayment(
  level: LogLevel,
  message: string,
  context?: PaymentLogContext
): void {
  const logEntry = createLogEntry(level, message, context)

  switch (level) {
    case LogLevel.DEBUG:
      console.debug('[Payment Debug]', logEntry)
      break
    case LogLevel.INFO:
      console.log('[Payment Info]', logEntry)
      break
    case LogLevel.WARN:
      console.warn('[Payment Warn]', logEntry)
      break
    case LogLevel.ERROR:
      console.error('[Payment Error]', logEntry)
      break
  }
}

/**
 * Log payment creation
 */
export function logPaymentCreation(
  type: 'order' | 'subscription' | 'tip',
  context: PaymentLogContext
): void {
  logPayment(LogLevel.INFO, `Payment ${type} created`, {
    ...context,
    action: 'payment_created',
    paymentType: type,
  })
}

/**
 * Log payment success
 */
export function logPaymentSuccess(
  type: 'order' | 'subscription' | 'tip' | 'user_tip',
  context: PaymentLogContext
): void {
  logPayment(LogLevel.INFO, `Payment ${type} succeeded`, {
    ...context,
    action: 'payment_succeeded',
    paymentType: type,
  })
}

/**
 * Log payment failure
 */
export function logPaymentFailure(
  type: 'order' | 'subscription' | 'tip',
  context: PaymentLogContext,
  error: any
): void {
  logPayment(LogLevel.ERROR, `Payment ${type} failed`, {
    ...context,
    action: 'payment_failed',
    paymentType: type,
    error: error.message || 'Unknown error',
    errorType: error.type,
  })
}

/**
 * Log transfer initiation
 */
export function logTransferInitiated(context: PaymentLogContext): void {
  logPayment(LogLevel.INFO, 'Transfer initiated', {
    ...context,
    action: 'transfer_initiated',
  })
}

/**
 * Log transfer success
 */
export function logTransferSuccess(context: PaymentLogContext): void {
  logPayment(LogLevel.INFO, 'Transfer succeeded', {
    ...context,
    action: 'transfer_succeeded',
  })
}

/**
 * Log transfer failure
 */
export function logTransferFailure(
  context: PaymentLogContext,
  error: any,
  retryable: boolean = false
): void {
  logPayment(LogLevel.WARN, 'Transfer failed', {
    ...context,
    action: 'transfer_failed',
    error: error.message || 'Unknown error',
    retryable,
  })
}

/**
 * Log idempotency hit
 */
export function logIdempotencyHit(
  type: 'order' | 'subscription' | 'tip',
  context: PaymentLogContext
): void {
  logPayment(LogLevel.INFO, `Payment ${type} already processed (idempotency)`, {
    ...context,
    action: 'idempotency_hit',
    paymentType: type,
  })
}
