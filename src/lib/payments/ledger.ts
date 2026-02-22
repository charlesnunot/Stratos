import { SupabaseClient } from '@supabase/supabase-js'

export type AccountType = 
  | 'platform_escrow'
  | 'platform_revenue'
  | 'platform_fee_payable'
  | 'seller_payable'
  | 'seller_receivable'
  | 'affiliate_payable'
  | 'buyer_clearing'
  | 'internal_wallet'
  | 'user_wallet'

export type JournalType = 
  | 'payment'
  | 'commission'
  | 'refund'
  | 'withdrawal'
  | 'transfer'
  | 'commission_reversal'
  | 'payment_reversal'

export type PostingState = 'pending' | 'posted' | 'failed' | 'reversed'

export interface LedgerEntry {
  id: string
  journal_id: string
  account_id: string
  entry_type: 'debit' | 'credit'
  amount: number
  currency: string
  balance_before: number
  balance_after: number
  entry_sequence: number
  metadata: Record<string, unknown>
  created_at: string
}

export interface JournalEntry {
  id: string
  transaction_id: string | null
  journal_type: JournalType
  reference_id: string | null
  reference_type: string | null
  description: string | null
  metadata: Record<string, unknown>
  posting_state: PostingState
  posted_at: string | null
  failed_at: string | null
  reversed_at: string | null
  created_at: string
}

export interface Account {
  id: string
  account_type: AccountType
  owner_id: string | null
  currency: string
  balance: number
  available_balance: number
  frozen_balance: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface JournalEntryInput {
  accountId: string
  entryType: 'debit' | 'credit'
  amount: number
  currency?: string
}

export interface PostJournalParams {
  transactionId: string
  journalType: JournalType
  referenceId?: string
  referenceType?: string
  entries: JournalEntryInput[]
}

export async function getOrCreateAccount(
  supabaseAdmin: SupabaseClient,
  accountType: AccountType,
  ownerId?: string,
  currency: string = 'CNY'
): Promise<Account> {
  const { data: existing } = await supabaseAdmin
    .from('accounts')
    .select('*')
    .eq('account_type', accountType)
    .eq('owner_id', ownerId || null)
    .eq('currency', currency)
    .single()

  if (existing) {
    return existing
  }

  try {
    const { data: newAccount, error } = await supabaseAdmin
      .from('accounts')
      .insert({
        account_type: accountType,
        owner_id: ownerId || null,
        currency,
        balance: 0,
        available_balance: 0,
        frozen_balance: 0,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        const { data: retryAccount } = await supabaseAdmin
          .from('accounts')
          .select('*')
          .eq('account_type', accountType)
          .eq('owner_id', ownerId || null)
          .eq('currency', currency)
          .single()
        if (retryAccount) return retryAccount
      }
      throw new Error(`Failed to create account: ${error.message}`)
    }

    return newAccount
  } catch (error: any) {
    if (error.code === '23505') {
      const { data: retryAccount } = await supabaseAdmin
        .from('accounts')
        .select('*')
        .eq('account_type', accountType)
        .eq('owner_id', ownerId || null)
        .eq('currency', currency)
        .single()
      if (retryAccount) return retryAccount
    }
    throw error
  }
}

export async function getAccountBalance(
  supabaseAdmin: SupabaseClient,
  accountType: AccountType,
  ownerId?: string,
  currency: string = 'CNY'
): Promise<{ balance: number; available_balance: number; frozen_balance: number } | null> {
  const { data, error } = await supabaseAdmin
    .from('accounts')
    .select('balance, available_balance, frozen_balance')
    .eq('account_type', accountType)
    .eq('owner_id', ownerId || null)
    .eq('currency', currency)
    .single()

  if (error || !data) {
    return null
  }

  return data
}

export async function postJournalEntry(
  supabaseAdmin: SupabaseClient,
  params: PostJournalParams
): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('post_journal_entry', {
    p_transaction_id: params.transactionId,
    p_journal_type: params.journalType,
    p_reference_id: params.referenceId,
    p_reference_type: params.referenceType,
    p_entries: params.entries.map(e => ({
      accountId: e.accountId,
      entryType: e.entryType,
      amount: e.amount,
      currency: e.currency || 'CNY',
    })),
  })

  if (error) {
    throw new Error(`Failed to post journal entry: ${error.message}`)
  }

  return data
}

export async function reverseJournalEntry(
  supabaseAdmin: SupabaseClient,
  journalId: string,
  reason?: string
): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('reverse_journal_entry', {
    p_journal_id: journalId,
    p_reason: reason,
  })

  if (error) {
    throw new Error(`Failed to reverse journal entry: ${error.message}`)
  }

  return data
}

export async function getLedgerTrail(
  supabaseAdmin: SupabaseClient,
  accountId: string,
  options?: {
    fromDate?: string
    toDate?: string
    limit?: number
  }
): Promise<LedgerEntry[]> {
  const { data, error } = await supabaseAdmin.rpc('get_ledger_trail', {
    p_account_id: accountId,
    p_from_date: options?.fromDate,
    p_to_date: options?.toDate,
    p_limit: options?.limit || 100,
  })

  if (error) {
    throw new Error(`Failed to get ledger trail: ${error.message}`)
  }

  return data || []
}

export async function getJournalEntry(
  supabaseAdmin: SupabaseClient,
  journalId: string
): Promise<JournalEntry | null> {
  const { data, error } = await supabaseAdmin
    .from('journal_entries')
    .select('*')
    .eq('id', journalId)
    .single()

  if (error) {
    return null
  }

  return data
}

export async function getLedgerEntries(
  supabaseAdmin: SupabaseClient,
  journalId: string
): Promise<LedgerEntry[]> {
  const { data, error } = await supabaseAdmin
    .from('ledger_entries')
    .select('*')
    .eq('journal_id', journalId)
    .order('entry_sequence')

  if (error) {
    throw new Error(`Failed to get ledger entries: ${error.message}`)
  }

  return data || []
}

export async function getAllAccounts(
  supabaseAdmin: SupabaseClient,
  filters?: {
    accountType?: AccountType
    ownerId?: string
    currency?: string
  }
): Promise<Account[]> {
  let query = supabaseAdmin.from('accounts').select('*')

  if (filters?.accountType) {
    query = query.eq('account_type', filters.accountType)
  }
  if (filters?.ownerId) {
    query = query.eq('owner_id', filters.ownerId)
  }
  if (filters?.currency) {
    query = query.eq('currency', filters.currency)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to get accounts: ${error.message}`)
  }

  return data || []
}
