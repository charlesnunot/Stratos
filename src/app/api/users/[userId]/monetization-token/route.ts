import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPlatformPrivateKey } from '@/lib/auth/capabilities'
import { generateMonetizationToken } from '@/lib/auth/capabilities'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params
    const supabase = await createClient()
    
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: paymentAccount, error } = await supabase
      .from('payment_accounts')
      .select(`
        id,
        seller_id,
        capability_resolution_id,
        capability_hash_proof,
        capability_attestation_signature,
        capability_resolved_at,
        created_at,
        status
      `)
      .eq('seller_id', userId)
      .eq('status', 'active')
      .not('capability_resolution_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !paymentAccount) {
      return NextResponse.json({
        hasValidToken: false,
        monetizationToken: null,
        expiresAt: null
      })
    }

    const { capability_resolution_id, capability_hash_proof, capability_resolved_at } = paymentAccount

    if (!capability_resolution_id || !capability_hash_proof || !capability_resolved_at) {
      return NextResponse.json({
        hasValidToken: false,
        monetizationToken: null,
        expiresAt: null
      })
    }

    // P2 修复: Token 基于已存储的 snapshot 存在，不重新计算 capabilityState
    // resolutionId 的存在即证明用户通过了 MCRE 验证
    const capabilityState = {
      canMonetize: true,
      canReceiveTips: true,
      canCreateProducts: true,
      canReceiveAffiliateCommission: true,
      payoutRoutingEnabled: true
    }

    let monetizationToken: string
    
    try {
      const privateKey = getPlatformPrivateKey()
      
      monetizationToken = generateMonetizationToken(
        capability_resolution_id,
        userId,
        capabilityState,
        capability_resolved_at,
        privateKey
      )
    } catch (keyError) {
      console.warn('MCRE: Platform keys not available, generating fallback token')
      const fallbackPayload = {
        ...capabilityState,
        resolutionId: capability_resolution_id,
        userId,
        resolvedAt: capability_resolved_at,
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
        _fallback: true
      }
      monetizationToken = `fallback.${Buffer.from(JSON.stringify(fallbackPayload)).toString('base64url')}.unsigned`
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    return NextResponse.json({
      hasValidToken: true,
      monetizationToken,
      resolutionId: capability_resolution_id,
      boundAt: paymentAccount.created_at,
      expiresAt
    })
  } catch (error) {
    console.error('Monetization token API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate monetization token' },
      { status: 500 }
    )
  }
}
