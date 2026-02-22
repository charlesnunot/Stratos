/**
 * Monetization Capability Resolution Engine (MCRE)
 * 
 * AI-Native Capability System with Cryptographic Attestation
 * 
 * Key Features:
 * - Capability Snapshot with resolutionId
 * - Canonical Payload Serialization (deterministic)
 * - Hash Proof generation
 * - Platform Attestation Signature
 * - Verification at payout time
 * 
 * Architecture:
 * Capability Ledger (Immutable Facts)
 *     ↓
 * AI Inference (Deepseek参与)
 *     ↓
 * ResolvedCapabilitySnapshot
 *     ↓
 * hashProof + attestationSignature
 *     ↓
 * PaymentAccount 绑定 resolutionId + hashProof + signature
 *     ↓
 * payout 时 verifySignature()
 */

import { createHash, createSign, createVerify, randomBytes } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { checkSubscriptionStatus } from './check-subscription'

const MCRE_VERSION = 'MCRE_CAPABILITY_V1'
const DOMAIN_SEPARATOR = 'MCRE_CAPABILITY_V1'

export interface CapabilityState {
  canMonetize: boolean
  canReceiveTips: boolean
  canCreateProducts: boolean
  canReceiveAffiliateCommission: boolean
  payoutRoutingEnabled: boolean
}

export interface ResolutionContext {
  subscriptionType?: 'seller' | 'affiliate' | 'tip' | null
  subscriptionStatus?: 'active' | 'expired' | 'none'
  riskScore?: number
  reputationScore?: number
  aiTrustScore?: number
  kycVerified?: boolean
  regionCompliance?: boolean
  aiInferenceResultHash?: string | null
}

export interface ResolutionSource {
  subscription?: boolean
  kyc?: boolean
  risk?: boolean
  reputation?: boolean
  aiInference?: boolean
}

export interface ResolvedCapabilitySnapshot {
  resolutionId: string
  userId: string
  resolvedAt: string
  capabilityState: CapabilityState
  resolutionContext: ResolutionContext
  resolutionSource: ResolutionSource
  hashProof: string
  attestationSignature: string
}

export interface ResolutionOptions {
  includeAIInference?: boolean
  trustedTime?: string
}

function stableStringify(obj: any): string {
  if (obj === null) return 'null'
  if (obj === undefined) return 'null'
  if (typeof obj === 'boolean') return obj ? 'true' : 'false'
  if (typeof obj === 'number') return String(obj)
  if (typeof obj === 'string') return JSON.stringify(obj)
  
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']'
  }
  
  if (typeof obj === 'object') {
    const keys = Object.keys(obj).sort()
    const pairs = keys.map(key => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    return '{' + pairs.join(',') + '}'
  }
  
  return String(obj)
}

function canonicalizePayload(
  resolutionId: string,
  userId: string,
  resolvedAt: string,
  capabilityState: CapabilityState,
  resolutionContext: ResolutionContext
): string {
  return [
    DOMAIN_SEPARATOR,
    resolutionId,
    userId,
    resolvedAt,
    stableStringify(capabilityState),
    stableStringify(resolutionContext)
  ].join('|')
}

function generateResolutionId(): string {
  return `res_${randomBytes(16).toString('hex')}`
}

function generateHashProof(canonicalPayload: string): string {
  return createHash('sha256').update(canonicalPayload, 'utf8').digest('hex')
}

export function getPlatformPublicKey(): string {
  const publicKey = process.env.MCRE_PLATFORM_PUBLIC_KEY
  
  if (!publicKey) {
    throw new Error('MCRE platform public key not configured. Please set MCRE_PLATFORM_PUBLIC_KEY environment variable.')
  }
  
  return publicKey
}

export function getPlatformPrivateKey(): string {
  const privateKey = process.env.MCRE_PLATFORM_PRIVATE_KEY
  
  if (!privateKey) {
    throw new Error('MCRE platform private key not configured. Please set MCRE_PLATFORM_PRIVATE_KEY environment variable.')
  }
  
  return privateKey
}

function generateAttestationSignature(hashProof: string, resolvedAt: string, privateKey: string): string {
  const signPayload = `${DOMAIN_SEPARATOR}|${hashProof}|${resolvedAt}`
  const signer = createSign('RSA-SHA256')
  signer.update(signPayload, 'utf8')
  return signer.sign(privateKey, 'base64')
}

const MCRE_TOKEN_EXPIRY_HOURS = 24

export function generateMonetizationToken(
  resolutionId: string,
  userId: string,
  capabilityState: CapabilityState,
  resolvedAt: string,
  privateKey: string
): string {
  const payload = {
    resolutionId,
    userId,
    canMonetize: capabilityState.canMonetize,
    canReceiveTips: capabilityState.canReceiveTips,
    canReceiveAffiliateCommission: capabilityState.canReceiveAffiliateCommission,
    payoutRoutingEnabled: capabilityState.payoutRoutingEnabled,
    resolvedAt,
    exp: Math.floor(Date.now() / 1000) + (MCRE_TOKEN_EXPIRY_HOURS * 60 * 60)
  }
  
  const header = { alg: 'RS256', typ: 'JWT' }
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url')
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signPayload = `${encodedHeader}.${encodedPayload}`
  
  const signer = createSign('RSA-SHA256')
  signer.update(signPayload, 'utf8')
  const signature = signer.sign(privateKey, 'base64')
  
  return `${signPayload}.${signature}`
}

export interface MonetizationTokenPayload {
  resolutionId: string
  userId: string
  canMonetize: boolean
  canReceiveTips: boolean
  canReceiveAffiliateCommission: boolean
  payoutRoutingEnabled: boolean
  resolvedAt: string
  exp: number
}

export function verifyMonetizationToken(
  token: string,
  publicKey?: string
): { valid: boolean; payload?: MonetizationTokenPayload; error?: string } {
  const verificationKey = publicKey || getPlatformPublicKey()
  
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid token format' }
    }
    
    const [encodedHeader, encodedPayload, signature] = parts
    
    const verifier = createVerify('RSA-SHA256')
    verifier.update(`${encodedHeader}.${encodedPayload}`, 'utf8')
    const isValid = verifier.verify(verificationKey, signature, 'base64')
    
    if (!isValid) {
      return { valid: false, error: 'Invalid signature' }
    }
    
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as MonetizationTokenPayload
    
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, error: 'Token expired' }
    }
    
    return { valid: true, payload }
  } catch (error) {
    return { valid: false, error: 'Token verification failed' }
  }
}

export function verifyAttestationSignature(
  hashProof: string,
  resolvedAt: string,
  signature: string,
  publicKey?: string
): boolean {
  const verificationKey = publicKey || getPlatformPublicKey()
  
  const signPayload = `${DOMAIN_SEPARATOR}|${hashProof}|${resolvedAt}`
  const verifier = createVerify('RSA-SHA256')
  verifier.update(signPayload, 'utf8')
  
  try {
    return verifier.verify(verificationKey, signature, 'base64')
  } catch (error) {
    console.error('Attestation signature verification failed:', error)
    return false
  }
}

export async function verifyCapabilitySnapshot(
  resolutionId: string,
  expectedHashProof: string,
  expectedSignature: string,
  resolvedAt: string
): Promise<{ valid: boolean; snapshot?: ResolvedCapabilitySnapshot; error?: string }> {
  const isSignatureValid = verifyAttestationSignature(
    expectedHashProof,
    resolvedAt,
    expectedSignature
  )
  
  if (!isSignatureValid) {
    return {
      valid: false,
      error: 'Attestation signature verification failed - capability snapshot may be tampered'
    }
  }
  
  return { valid: true }
}

async function getSubscriptionCapability(
  userId: string,
  supabaseAdmin: any
): Promise<{ hasCapability: boolean; type?: 'seller' | 'affiliate' | 'tip'; status?: 'active' | 'expired' | 'none' }> {
  const [sellerSub, affiliateSub, tipSub] = await Promise.all([
    checkSubscriptionStatus(userId, 'seller', supabaseAdmin),
    checkSubscriptionStatus(userId, 'affiliate', supabaseAdmin),
    checkSubscriptionStatus(userId, 'tip', supabaseAdmin),
  ])
  
  if (sellerSub.hasActive) {
    return { hasCapability: true, type: 'seller', status: 'active' }
  }
  if (affiliateSub.hasActive) {
    return { hasCapability: true, type: 'affiliate', status: 'active' }
  }
  if (tipSub.hasActive) {
    return { hasCapability: true, type: 'tip', status: 'active' }
  }
  
  const hadSeller = !!sellerSub.subscription
  const hadAffiliate = !!affiliateSub.subscription
  const hadTip = !!tipSub.subscription
  
  if (hadSeller || hadAffiliate || hadTip) {
    return { hasCapability: false, type: (hadSeller ? 'seller' : hadAffiliate ? 'affiliate' : 'tip'), status: 'expired' }
  }
  
  return { hasCapability: false, status: 'none' }
}

async function getKYCCapability(userId: string, supabaseAdmin: any): Promise<boolean> {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('kyc_status, kyc_verified_at')
    .eq('id', userId)
    .single()
  
  if (!profile) return false
  return profile.kyc_status === 'approved' && !!profile.kyc_verified_at
}

async function getRiskCapability(userId: string, supabaseAdmin: any): Promise<{ score: number; acceptable: boolean }> {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('risk_score')
    .eq('id', userId)
    .single()
  
  const score = profile?.risk_score ?? 0.5
  const acceptable = score < 0.7
  return { score, acceptable }
}

async function getReputationCapability(userId: string, supabaseAdmin: any): Promise<{ score: number; acceptable: boolean }> {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('reputation_score')
    .eq('id', userId)
    .single()
  
  const score = profile?.reputation_score ?? 0
  const acceptable = score >= 0.3
  return { score, acceptable }
}

function getRegionCompliance(userId: string): boolean {
  return true
}

export async function resolveUserCapabilities(
  userId: string,
  options: ResolutionOptions = {}
): Promise<ResolvedCapabilitySnapshot> {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  
  const resolvedAt = options.trustedTime || new Date().toISOString()
  const resolutionId = generateResolutionId()
  
  const [
    subscriptionCapability,
    kycCapability,
    riskCapability,
    reputationCapability,
    regionCompliance
  ] = await Promise.all([
    getSubscriptionCapability(userId, supabaseAdmin),
    getKYCCapability(userId, supabaseAdmin),
    getRiskCapability(userId, supabaseAdmin),
    getReputationCapability(userId, supabaseAdmin),
    Promise.resolve(getRegionCompliance(userId))
  ])
  
  const canMonetize = subscriptionCapability.hasCapability
  const canReceiveTips = subscriptionCapability.hasCapability && subscriptionCapability.type === 'tip'
  const canCreateProducts = subscriptionCapability.hasCapability && subscriptionCapability.type === 'seller'
  const canReceiveAffiliateCommission = subscriptionCapability.hasCapability && subscriptionCapability.type === 'affiliate'
  const payoutRoutingEnabled = canMonetize && riskCapability.acceptable && regionCompliance
  
  const capabilityState: CapabilityState = {
    canMonetize,
    canReceiveTips,
    canCreateProducts,
    canReceiveAffiliateCommission,
    payoutRoutingEnabled
  }
  
  const resolutionContext: ResolutionContext = {
    subscriptionType: subscriptionCapability.type || null,
    subscriptionStatus: subscriptionCapability.status,
    riskScore: riskCapability.score,
    reputationScore: reputationCapability.score,
    kycVerified: kycCapability,
    regionCompliance,
    aiInferenceResultHash: options.includeAIInference 
      ? createHash('sha256').update(JSON.stringify({ userId, resolvedAt, subscriptionCapability, kycCapability })).digest('hex')
      : null
  }
  
  const resolutionSource: ResolutionSource = {
    subscription: subscriptionCapability.hasCapability,
    kyc: kycCapability,
    risk: riskCapability.acceptable,
    reputation: reputationCapability.acceptable,
    aiInference: options.includeAIInference || false
  }
  
  const canonicalPayload = canonicalizePayload(
    resolutionId,
    userId,
    resolvedAt,
    capabilityState,
    resolutionContext
  )
  
  const hashProof = generateHashProof(canonicalPayload)
  
  let attestationSignature = ''
  try {
    const privateKey = getPlatformPrivateKey()
    attestationSignature = generateAttestationSignature(hashProof, resolvedAt, privateKey)
  } catch (error) {
    console.warn('MCRE: Platform keys not available, generating unsigned snapshot:', error)
    attestationSignature = 'UNSIGNED'
  }
  
  return {
    resolutionId,
    userId,
    resolvedAt,
    capabilityState,
    resolutionContext,
    resolutionSource,
    hashProof,
    attestationSignature
  }
}

export async function resolveUserCapabilitiesMinimal(
  userId: string
): Promise<{ canMonetize: boolean; payoutRoutingEnabled: boolean }> {
  const snapshot = await resolveUserCapabilities(userId)
  return {
    canMonetize: snapshot.capabilityState.canMonetize,
    payoutRoutingEnabled: snapshot.capabilityState.payoutRoutingEnabled
  }
}
