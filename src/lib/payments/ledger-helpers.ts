import { SupabaseClient } from '@supabase/supabase-js'
import { postJournalEntry, getOrCreateAccount, getAccountBalance, AccountType, JournalEntryInput } from './ledger'
import { logPayment, LogLevel } from './logger'

export interface OrderPaymentLedgerEntry {
  orderId: string
  buyerId: string
  sellerId: string
  affiliateId?: string
  amount: number
  currency: string
  platformFee: number
  commissionAmount: number
}

export async function recordOrderPaymentLedger(
  supabaseAdmin: SupabaseClient,
  params: OrderPaymentLedgerEntry
): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { orderId, buyerId, sellerId, affiliateId, amount, currency, platformFee, commissionAmount } = params

  try {
    const sellerAmount = amount - platformFee

    const accounts = await getAllAccountIds(supabaseAdmin, {
      buyerId,
      sellerId,
      affiliateId,
    })

    if (!accounts.buyerClearing || !accounts.sellerPayable) {
      logPayment(LogLevel.ERROR, 'Failed to get ledger accounts', {
        orderId,
        missing: !accounts.buyerClearing ? 'buyerClearing' : !accounts.sellerPayable ? 'sellerPayable' : 'unknown',
      })
      return { success: false, error: 'Failed to get ledger accounts' }
    }

    const ledgerEntries = [
      {
        accountId: accounts.buyerClearing,
        entryType: 'debit' as const,
        amount,
        currency,
      },
      {
        accountId: accounts.sellerPayable,
        entryType: 'credit' as const,
        amount: sellerAmount,
        currency,
      },
    ]

    if (platformFee > 0 && accounts.platformFeePayable) {
      ledgerEntries.push({
        accountId: accounts.platformFeePayable,
        entryType: 'credit' as const,
        amount: platformFee,
        currency,
      })
    }

    const journalId = await postJournalEntry(supabaseAdmin, {
      transactionId: orderId,
      journalType: 'payment',
      referenceId: orderId,
      referenceType: 'order',
      entries: ledgerEntries,
    })

    logPayment(LogLevel.INFO, 'Order payment ledger recorded', {
      orderId,
      journalId,
      amount,
      platformFee,
    })

    return { success: true, journalId }
  } catch (error: any) {
    logPayment(LogLevel.ERROR, 'Failed to record order payment ledger', {
      orderId,
      error: error.message,
    })
    return { success: false, error: error.message }
  }
}

export async function recordSubscriptionPaymentLedger(
  supabaseAdmin: SupabaseClient,
  params: {
    subscriptionId: string
    userId: string
    subscriptionType: 'seller' | 'affiliate' | 'tip'
    amount: number
    currency: string
  }
): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { subscriptionId, userId, subscriptionType, amount, currency } = params

  try {
    const accounts = await getAllAccountIds(supabaseAdmin, {
      buyerId: userId,
    })

    const ledgerEntries = [
      {
        accountId: accounts.buyerClearing!,
        entryType: 'debit' as const,
        amount,
        currency,
      },
      {
        accountId: accounts.platformRevenue!,
        entryType: 'credit' as const,
        amount,
        currency,
      },
    ]

    const journalId = await postJournalEntry(supabaseAdmin, {
      transactionId: subscriptionId,
      journalType: 'payment',
      referenceId: subscriptionId,
      referenceType: `subscription_${subscriptionType}`,
      entries: ledgerEntries,
    })

    return { success: true, journalId }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function recordCommissionLedger(
  supabaseAdmin: SupabaseClient,
  params: {
    commissionId: string
    orderId: string
    affiliateId: string
    sellerId: string
    amount: number
    currency: string
  }
): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { commissionId, orderId, affiliateId, sellerId, amount, currency } = params

  try {
    const accounts = await getAllAccountIds(supabaseAdmin, {
      sellerId,
      affiliateId,
    })

    if (!accounts.platformFeePayable || !accounts.affiliatePayable) {
      return { success: false, error: 'Failed to get ledger accounts' }
    }

    const platformRevenue = amount * 0.1
    const affiliateNet = amount - platformRevenue

    const ledgerEntries = [
      {
        accountId: accounts.platformFeePayable,
        entryType: 'debit' as const,
        amount,
        currency,
      },
      {
        accountId: accounts.affiliatePayable,
        entryType: 'credit' as const,
        amount: affiliateNet,
        currency,
      },
    ]

    if (platformRevenue > 0 && accounts.platformRevenue) {
      ledgerEntries.push({
        accountId: accounts.platformRevenue,
        entryType: 'credit' as const,
        amount: platformRevenue,
        currency,
      })
    }

    const journalId = await postJournalEntry(supabaseAdmin, {
      transactionId: commissionId,
      journalType: 'commission',
      referenceId: orderId,
      referenceType: 'commission',
      entries: ledgerEntries,
    })

    return { success: true, journalId }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

interface AccountIds {
  buyerClearing?: string
  sellerReceivable?: string
  sellerPayable?: string
  affiliatePayable?: string
  platformFeePayable?: string
  platformRevenue?: string
  platformEscrow?: string
}

async function getAllAccountIds(
  supabaseAdmin: SupabaseClient,
  params: {
    buyerId?: string
    sellerId?: string
    affiliateId?: string
  }
): Promise<AccountIds> {
  const result: AccountIds = {}

  if (params.buyerId) {
    const buyerAccount = await getOrCreateAccount(supabaseAdmin, 'buyer_clearing', params.buyerId)
    result.buyerClearing = buyerAccount.id
  }

  if (params.sellerId) {
    const sellerPayableAccount = await getOrCreateAccount(supabaseAdmin, 'seller_payable', params.sellerId)
    result.sellerReceivable = sellerPayableAccount.id
    result.sellerPayable = sellerPayableAccount.id
  }

  if (params.affiliateId) {
    const affiliatePayable = await getOrCreateAccount(supabaseAdmin, 'affiliate_payable', params.affiliateId)
    result.affiliatePayable = affiliatePayable.id
  }

  const platformEscrow = await getOrCreateAccount(supabaseAdmin, 'platform_escrow', undefined)
  result.platformFeePayable = platformEscrow.id
  result.platformEscrow = platformEscrow.id

  const platformRevenue = await getOrCreateAccount(supabaseAdmin, 'platform_revenue', undefined)
  result.platformRevenue = platformRevenue.id

  return result
}

export async function recordTipPaymentLedger(
  supabaseAdmin: SupabaseClient,
  params: {
    tipId: string
    tipperId: string
    recipientId: string
    amount: number
    currency: string
    isInternal: boolean
    platformFee?: number
  }
): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { tipId, tipperId, recipientId, amount, currency, isInternal, platformFee = 0 } = params

  try {
    const accounts = await getAllAccountIds(supabaseAdmin, {
      buyerId: tipperId,
      sellerId: recipientId,
    })

    const ledgerEntries: JournalEntryInput[] = [
      {
        accountId: accounts.buyerClearing!,
        entryType: 'debit',
        amount,
        currency,
      },
    ]

    if (isInternal) {
      ledgerEntries.push({
        accountId: accounts.platformEscrow!,
        entryType: 'credit',
        amount,
        currency,
      })
    } else {
      ledgerEntries.push({
        accountId: accounts.sellerPayable!,
        entryType: 'credit',
        amount: amount - platformFee,
        currency,
      })

      if (platformFee > 0) {
        ledgerEntries.push({
          accountId: accounts.platformRevenue!,
          entryType: 'credit',
          amount: platformFee,
          currency,
        })
      }
    }

    const journalId = await postJournalEntry(supabaseAdmin, {
      transactionId: tipId,
      journalType: 'payment',
      referenceId: tipId,
      referenceType: 'tip',
      entries: ledgerEntries,
    })

    return { success: true, journalId }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function recordWithdrawalLedger(
  supabaseAdmin: SupabaseClient,
  params: {
    withdrawalId: string
    userId: string
    amount: number
    currency: string
    fee: number
  }
): Promise<{ success: boolean; journalId?: string; error?: string }> {
  const { withdrawalId, userId, amount, currency, fee } = params

  try {
    const accounts = await getAllAccountIds(supabaseAdmin, {
      sellerId: userId,
    })

    const netAmount = amount - fee

    const ledgerEntries = [
      {
        accountId: accounts.sellerPayable!,
        entryType: 'debit' as const,
        amount,
        currency,
      },
      {
        accountId: accounts.platformRevenue!,
        entryType: 'credit' as const,
        amount: fee,
        currency,
      },
    ]

    const journalId = await postJournalEntry(supabaseAdmin, {
      transactionId: withdrawalId,
      journalType: 'withdrawal',
      referenceId: withdrawalId,
      referenceType: 'withdrawal',
      entries: ledgerEntries,
    })

    return { success: true, journalId }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
