/**
 * User support tickets API
 * POST: Create ticket (auth required, logAudit)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/api/audit'
import { sanitizeContent } from '@/lib/utils/sanitize-content'

const TITLE_MAX_LENGTH = 200
const DESCRIPTION_MAX_LENGTH = 5000
const TICKET_TYPES = ['general', 'technical', 'billing', 'refund', 'other'] as const
const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: { title?: string; description?: string; ticket_type?: string; priority?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const rawTitle = typeof body.title === 'string' ? body.title.trim() : ''
    const rawDescription = typeof body.description === 'string' ? body.description.trim() : ''

    if (!rawTitle || !rawDescription) {
      return NextResponse.json(
        { error: 'Title and description are required' },
        { status: 400 }
      )
    }
    if (rawTitle.length > TITLE_MAX_LENGTH) {
      return NextResponse.json(
        { error: `Title must be at most ${TITLE_MAX_LENGTH} characters` },
        { status: 400 }
      )
    }
    if (rawDescription.length > DESCRIPTION_MAX_LENGTH) {
      return NextResponse.json(
        { error: `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters` },
        { status: 400 }
      )
    }

    const title = sanitizeContent(rawTitle)
    const description = sanitizeContent(rawDescription)
    const ticket_type = TICKET_TYPES.includes((body.ticket_type as any) as (typeof TICKET_TYPES)[number])
      ? (body.ticket_type as (typeof TICKET_TYPES)[number])
      : 'general'
    const priority = PRIORITIES.includes((body.priority as any) as (typeof PRIORITIES)[number])
      ? (body.priority as (typeof PRIORITIES)[number])
      : 'medium'

    const admin = await getSupabaseAdmin()
    const { data: ticket, error: insertError } = await admin
      .from('support_tickets')
      .insert({
        user_id: user.id,
        title,
        description,
        ticket_type,
        priority,
        status: 'open',
      })
      .select('id')
      .single()

    if (insertError) {
      logAudit({
        action: 'create_support_ticket',
        userId: user.id,
        resourceId: undefined,
        resourceType: 'support_ticket',
        result: 'fail',
        timestamp: new Date().toISOString(),
        meta: { reason: insertError.message },
      })
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      )
    }

    logAudit({
      action: 'create_support_ticket',
      userId: user.id,
      resourceId: ticket.id,
      resourceType: 'support_ticket',
      result: 'success',
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({ ok: true, ticketId: ticket.id }, { status: 201 })
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[support/tickets POST]', error)
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
