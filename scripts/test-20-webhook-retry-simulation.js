#!/usr/bin/env node
/**
 * Script 20 - Webhook retry simulation (DB-level failure injection)
 *
 * Verifies retry semantics for webhook idempotency:
 * 1. First process_webhook_event call should insert and return row id.
 * 2. Duplicate call without rollback should return null.
 * 3. After deleting webhook_events row (simulated downstream failure rollback),
 *    calling process_webhook_event again with same event id should return row id.
 *
 * Usage:
 *   node scripts/test-20-webhook-retry-simulation.js
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const text = fs.readFileSync(filePath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx <= 0) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] == null || process.env[key] === '') {
      process.env[key] = value
    }
  }
}

function loadEnv() {
  const root = path.resolve(__dirname, '..')
  readEnvFile(path.join(root, '.env.local'))
  readEnvFile(path.join(root, '.env'))
}

async function assertRetryFlowForProvider(supabase, provider) {
  const eventId = `selftest_retry_${provider}_${Date.now()}_${Math.random().toString(16).slice(2)}`
  const payload = {
    source: 'script-20',
    provider,
    injectedFailure: true,
    createdAt: new Date().toISOString(),
  }

  const first = await supabase.rpc('process_webhook_event', {
    p_provider: provider,
    p_event_id: eventId,
    p_event_type: 'selftest.event',
    p_payload: payload,
  })

  if (first.error) {
    throw new Error(`[${provider}] first process_webhook_event failed: ${first.error.message}`)
  }
  if (!first.data) {
    throw new Error(`[${provider}] first process_webhook_event returned null (expected row id)`)
  }

  const duplicate = await supabase.rpc('process_webhook_event', {
    p_provider: provider,
    p_event_id: eventId,
    p_event_type: 'selftest.event',
    p_payload: payload,
  })

  if (duplicate.error) {
    throw new Error(`[${provider}] duplicate process_webhook_event failed: ${duplicate.error.message}`)
  }
  if (duplicate.data !== null) {
    throw new Error(
      `[${provider}] duplicate call should return null before rollback, got ${duplicate.data}`
    )
  }

  const rollback = await supabase.from('webhook_events').delete().eq('id', first.data)
  if (rollback.error) {
    throw new Error(`[${provider}] rollback delete failed: ${rollback.error.message}`)
  }

  const retry = await supabase.rpc('process_webhook_event', {
    p_provider: provider,
    p_event_id: eventId,
    p_event_type: 'selftest.event',
    p_payload: payload,
  })

  if (retry.error) {
    throw new Error(`[${provider}] retry process_webhook_event failed: ${retry.error.message}`)
  }
  if (!retry.data) {
    throw new Error(`[${provider}] retry returned null after rollback (expected row id)`)
  }

  const cleanup = await supabase.from('webhook_events').delete().eq('id', retry.data)
  if (cleanup.error) {
    throw new Error(`[${provider}] cleanup delete failed: ${cleanup.error.message}`)
  }

  return {
    provider,
    firstId: first.data,
    retryId: retry.data,
  }
}

async function run() {
  loadEnv()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Cannot run webhook retry simulation.'
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const providers = ['stripe', 'paypal', 'wechat', 'alipay']
  const results = []

  for (const provider of providers) {
    const result = await assertRetryFlowForProvider(supabase, provider)
    results.push(result)
    console.log(
      `[OK] ${provider}: first insert ${result.firstId}, duplicate blocked, retry insert ${result.retryId}`
    )
  }

  console.log('\n[OK] Webhook retry simulation completed for all providers.')
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`[FAIL] ${error.message || error}`)
    process.exit(1)
  })
