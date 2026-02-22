---
name: "stratos-subscription"
description: "Handles Stratos platform subscription tier logic and feature access control. Invoke when working with seller subscription tiers (Growth $50, Scale $100), feature gating, or subscription-based permissions."
---

# Stratos Subscription System

## Overview

Stratos uses a tiered subscription system for sellers with three levels:

| Tier | Price | Features |
|------|-------|----------|
| **Basic** | Free | Standard selling features |
| **Growth** | $50/month | + Bulk import/export, promotion status |
| **Scale** | $100/month | + Advanced analytics, branding, API keys, account manager |

## Subscription Tier Values

- `0` = Basic (free)
- `50` = Growth ($50/month)
- `100` = Scale ($100/month)

## Checking Subscription Tier

### Client-Side (React Components)

```typescript
const [subscriptionTier, setSubscriptionTier] = useState(0)

useEffect(() => {
  if (!user) return
  const fetchTier = async () => {
    // Check if direct seller first
    const { data: profile } = await supabase
      .from('profiles')
      .select('seller_type')
      .eq('id', user.id)
      .single()
    
    if (profile?.seller_type === 'direct') {
      setSubscriptionTier(100) // Direct sellers get Scale tier
      return
    }
    
    // Check subscription
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('subscription_tier')
      .eq('user_id', user.id)
      .eq('subscription_type', 'seller')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .single()
    
    setSubscriptionTier(sub?.subscription_tier || 0)
  }
  fetchTier()
}, [user, supabase])
```

### Server-Side (API Routes)

```typescript
async function validateSellerTier(supabase: any, userId: string): Promise<{ 
  valid: boolean; 
  tier?: number; 
  error?: string 
}> {
  // Check if direct seller
  const { data: profile } = await supabase
    .from('profiles')
    .select('seller_type')
    .eq('id', userId)
    .single()
  
  if (profile?.seller_type === 'direct') {
    return { valid: true, tier: 100 }
  }
  
  // Check subscription
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('subscription_tier')
    .eq('user_id', userId)
    .eq('subscription_type', 'seller')
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .single()
  
  const tier = subscription?.subscription_tier || 0
  return { valid: tier >= 50, tier }
}
```

## Feature Access Control

### Growth Tier Features (tier >= 50)

- Bulk product import/export
- Promotion status page

### Scale Tier Features (tier >= 100)

- Advanced analytics (customer insights, product performance)
- Branding configuration
- API key management
- Dedicated account manager

### Conditional Rendering

```tsx
// Growth tier and above
{subscriptionTier >= 50 && (
  <BulkImportExport userId={user.id} subscriptionTier={subscriptionTier} />
)}

// Scale tier only
{subscriptionTier >= 100 && (
  <AdvancedAnalytics userId={user.id} subscriptionTier={subscriptionTier} />
)}
```

## Database Schema

### subscriptions table

```sql
create table subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id) on delete cascade,
  subscription_type text not null, -- 'seller', 'buyer', etc.
  subscription_tier integer not null, -- 0, 50, 100
  status text not null, -- 'active', 'cancelled', 'expired'
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
```

### profiles table

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  seller_type text, -- 'direct', 'normal'
  -- ... other fields
);
```

## Direct Sellers

Direct sellers (seller_type = 'direct') are treated as Scale tier automatically:

```typescript
if (profile?.seller_type === 'direct') {
  return { valid: true, tier: 100 }
}
```

## Common Patterns

### Redirect if insufficient tier

```typescript
if (tier < 100) {
  router.push('/seller/dashboard')
  return null
}
```

### API route protection

```typescript
const { valid, tier, error } = await validateSellerTier(supabase, user.id)
if (!valid) {
  return NextResponse.json({ error: 'Insufficient subscription tier' }, { status: 403 })
}
```

## Related Components

- `AdvancedAnalytics` - Scale tier analytics dashboard
- `BrandingConfig` - Scale tier branding configuration
- `PromotionStatus` - Growth/Scale tier promotion tracking
- `ApiKeyManager` - Scale tier API key management
- `BulkImportExport` - Growth/Scale tier bulk operations

## Related API Routes

- `/api/seller/analytics` - Advanced analytics data
- `/api/seller/branding` - Branding configuration
- `/api/seller/promotion` - Promotion status
- `/api/seller/api-keys` - API key management
- `/api/seller/products/bulk-import` - Bulk product import
- `/api/seller/products/bulk-export` - Bulk product export
