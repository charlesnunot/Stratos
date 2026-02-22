---
name: "stratos-multicurrency-payment"
description: "Implements multi-currency payment support for Stratos platform. Invoke when working with subscription payments, currency conversion, PayPal/Stripe multi-currency handling, or payment method availability issues."
---

# Stratos Multi-Currency Payment Support

This skill provides comprehensive multi-currency payment support for the Stratos platform, allowing users to pay in their local currency while the platform receives payment in its configured currency.

## Overview

The multi-currency system enables:
- Users see prices in their local currency (CNY, EUR, GBP, etc.)
- Platform receives payment in its configured currency (usually USD)
- Automatic currency conversion using exchange rates
- Support for all payment methods (Stripe, PayPal, Alipay, WeChat Pay)

## Key Components

### 1. Exchange Rate API
**File**: `/api/exchange-rates/route.ts`

Queries the `exchange_rates` table for real-time conversion rates.

```typescript
// Usage
const response = await fetch(`/api/exchange-rates?from=CNY&to=USD`)
const { rate } = await response.json()
const usdAmount = cnyAmount * rate
```

### 2. Platform Account API
**File**: `/api/platform/account/route.ts`

Returns platform's receiving currency and available payment methods.

```typescript
const response = await fetch(`/api/platform/account?currency=CNY`)
const { currency, platformCurrency, needsConversion } = await response.json()
```

### 3. Payment Methods API
**File**: `/api/platform/payment-methods/route.ts`

Returns all configured payment methods for the platform, regardless of currency support.

**Key Changes**:
- Returns all configured methods (not filtered by currency)
- Adds `platformCurrency` and `needsConversion` fields
- Falls back to default methods if no platform accounts configured

### 4. Currency Conversion Utility
**File**: `/lib/currency/convert-currency.ts`

Provides synchronous and asynchronous currency conversion.

```typescript
// Synchronous (uses fallback rates)
import { convertCurrency } from '@/lib/currency/convert-currency'
const usdAmount = convertCurrency(cnyAmount, 'CNY', 'USD')

// Asynchronous (queries exchange_rates table)
import { convertCurrencyAsync } from '@/lib/currency/convert-currency'
const usdAmount = await convertCurrencyAsync(cnyAmount, 'CNY', 'USD')
```

### 5. Payment Method Currency Support
**File**: `/lib/payments/currency-payment-support.ts`

Defines which currencies each payment method supports.

```typescript
import { 
  isCurrencySupportedByPaymentMethod, 
  getSettlementCurrency 
} from '@/lib/payments/currency-payment-support'

// Check if PayPal supports CNY
const supported = isCurrencySupportedByPaymentMethod('CNY', 'paypal') // false

// Get settlement currency for PayPal
const settlement = getSettlementCurrency('paypal', 'CNY') // 'USD'
```

## Implementation Guide

### For Subscription Pages

#### 1. Add Multi-Currency State
```typescript
const [platformCurrency, setPlatformCurrency] = useState<Currency>(currency)
const [needsConversion, setNeedsConversion] = useState(false)
const [convertedAmount, setConvertedAmount] = useState<number | null>(null)
const [exchangeRate, setExchangeRate] = useState<number | null>(null)
```

#### 2. Fetch Payment Methods with Conversion Info
```typescript
useEffect(() => {
  const fetchPaymentMethods = async () => {
    const response = await fetch(`/api/platform/payment-methods?currency=${currency}`)
    const data = await response.json()
    setAvailablePaymentMethods(data.methods)
    setPlatformCurrency(data.platformCurrency)
    setNeedsConversion(data.needsConversion)
  }
  fetchPaymentMethods()
}, [currency])
```

#### 3. Calculate Converted Amount
```typescript
useEffect(() => {
  const calculateConversion = async () => {
    if (!needsConversion) return
    
    const response = await fetch(`/api/exchange-rates?from=${currency}&to=${platformCurrency}`)
    const { rate } = await response.json()
    const converted = userAmount * rate
    setConvertedAmount(converted)
    setExchangeRate(rate)
  }
  calculateConversion()
}, [userAmount, currency, platformCurrency, needsConversion])
```

#### 4. Create Subscription with Multi-Currency
```typescript
const response = await fetch('/api/subscriptions/create-pending', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    subscriptionType: 'seller',
    subscriptionTier: selectedTier,
    paymentMethod,
    currency: platformCurrency, // Platform receives this currency
    // Multi-currency fields
    userCurrency: currency,      // User's display currency
    userAmount: amount,          // Amount in user currency
    platformCurrency: platformCurrency,
    platformAmount: convertedAmount || amount,
  }),
})
```

### For PayPal Button (Multi-Currency)

**File**: `/components/payments/PayPalButton.tsx`

PayPal doesn't support all currencies (e.g., CNY). The button automatically:
1. Detects if user's currency is supported
2. Converts to USD if needed
3. Loads SDK with supported currency
4. Creates order with converted amount

```typescript
// Inside PayPalButton component
const [payPalCurrency, setPayPalCurrency] = useState<string>(currency)
const [payPalAmount, setPayPalAmount] = useState<number>(amount)

useEffect(() => {
  if (isCurrencySupportedByPaymentMethod(currency as Currency, 'paypal')) {
    setPayPalCurrency(currency)
    setPayPalAmount(amount)
  } else {
    // Convert to USD
    const settlementCurrency = getSettlementCurrency('paypal', currency as Currency)
    setPayPalCurrency(settlementCurrency)
    // Fetch exchange rate and convert...
  }
}, [amount, currency])
```

### For Create-Pending API

**File**: `/api/subscriptions/create-pending/route.ts`

Records both user currency and platform currency:

```typescript
const { data: subscription, error: insertError } = await supabaseAdmin
  .from('subscriptions')
  .insert({
    user_id: user.id,
    subscription_type: subscriptionType,
    // Multi-currency fields
    amount: finalAmount,                    // Platform amount
    currency: finalCurrency,                 // Platform currency
    user_amount: finalUserAmount,           // User amount
    user_currency: finalUserCurrency,       // User currency
    exchange_rate: exchangeRate,            // Conversion rate
    exchange_rate_at: new Date().toISOString(),
    // ... other fields
  })
```

### For Payment Processing

**File**: `/lib/payments/process-subscription-payment.ts`

Validates payment amount using platform currency:

```typescript
// Use subscription's platform currency for validation
const platformAmount = parseFloat(String(sub.amount))
const platformCurrency = (sub.currency as Currency) || 'USD'

// Convert if payment currency differs
if (platformCurrency === currency) {
  expectedInPaymentCurrency = platformAmount
} else {
  expectedInPaymentCurrency = convertCurrency(
    platformAmount, 
    platformCurrency, 
    currency as Currency
  )
}
```

## Database Schema

### Subscriptions Table
Add these columns for multi-currency support:

```sql
ALTER TABLE subscriptions
ADD COLUMN user_amount DECIMAL(10,2),           -- User's display amount
ADD COLUMN user_currency TEXT,                   -- User's currency
ADD COLUMN exchange_rate DECIMAL(10,6),          -- Conversion rate
ADD COLUMN exchange_rate_at TIMESTAMPTZ;         -- When rate was recorded
```

### Payment Transactions Table
```sql
ALTER TABLE payment_transactions
ADD COLUMN user_amount DECIMAL(10,2),
ADD COLUMN user_currency TEXT,
ADD COLUMN platform_amount DECIMAL(10,2),
ADD COLUMN platform_currency TEXT,
ADD COLUMN exchange_rate DECIMAL(10,6),
ADD COLUMN exchange_rate_at TIMESTAMPTZ;
```

## Common Issues and Solutions

### Issue: "No payment methods available"
**Cause**: API filters methods by currency support
**Solution**: Return all configured methods, let frontend handle conversion

### Issue: PayPal SDK fails to load with CNY
**Cause**: PayPal doesn't support CNY
**Solution**: Auto-convert to USD before loading SDK

### Issue: Amount mismatch in payment validation
**Cause**: Using wrong currency for comparison
**Solution**: Always use platform currency from subscription record

### Issue: Exchange rate API returns no rate
**Cause**: Rate not in database
**Solution**: Use fallback rates in convert-currency.ts

## Testing Checklist

- [ ] User sees price in local currency
- [ ] Platform receives payment in configured currency
- [ ] Exchange rate is recorded correctly
- [ ] PayPal works with CNY (converts to USD)
- [ ] Stripe works with all currencies
- [ ] Alipay/WeChat work with CNY
- [ ] Payment validation uses correct currency
- [ ] Transaction records both currencies

## Migration

Run migration to add multi-currency columns:

```bash
# File: supabase/migrations/255_add_multicurrency_support.sql
# Already created - applies automatically on next deployment
```
