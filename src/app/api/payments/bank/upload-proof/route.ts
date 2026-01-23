import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

    const formData = await request.formData()
    const orderId = formData.get('orderId') as string
    const imageFile = formData.get('image') as File
    const bankName = formData.get('bankName') as string
    const transactionNumber = formData.get('transactionNumber') as string
    const transferAmount = formData.get('transferAmount') as string
    const transferDate = formData.get('transferDate') as string

    if (!orderId || !imageFile) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Verify order belongs to user
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, buyer_id, payment_method')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    if (order.buyer_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    if (order.payment_method !== 'bank') {
      return NextResponse.json(
        { error: 'Order is not using bank transfer payment' },
        { status: 400 }
      )
    }

    // Upload image to storage
    const fileExt = imageFile.name.split('.').pop()
    const fileName = `${user.id}/${orderId}/${Date.now()}.${fileExt}`
    const filePath = `bank-proofs/${fileName}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('bank-proofs')
      .upload(filePath, imageFile, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json(
        { error: 'Failed to upload image' },
        { status: 500 }
      )
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('bank-proofs')
      .getPublicUrl(filePath)

    const proofImageUrl = urlData.publicUrl

    // Find or create payment transaction
    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Get or create payment transaction
    let paymentTransactionId: string | null = null
    const { data: existingTransaction } = await supabaseAdmin
      .from('payment_transactions')
      .select('id')
      .eq('type', 'order')
      .eq('provider', 'bank')
      .eq('related_id', orderId)
      .single()

    if (existingTransaction) {
      paymentTransactionId = existingTransaction.id
    } else {
      const { data: newTransaction, error: transError } = await supabaseAdmin
        .from('payment_transactions')
        .insert({
          type: 'order',
          provider: 'bank',
          provider_ref: `bank_${orderId}_${Date.now()}`,
          amount: parseFloat(transferAmount) || order.total_amount,
          currency: 'CNY',
          status: 'pending',
          related_id: orderId,
        })
        .select('id')
        .single()

      if (transError) {
        console.error('Failed to create payment transaction:', transError)
      } else {
        paymentTransactionId = newTransaction.id
      }
    }

    // Create bank payment proof record
    const { data: proof, error: proofError } = await supabaseAdmin
      .from('bank_payment_proofs')
      .insert({
        payment_transaction_id: paymentTransactionId,
        order_id: orderId,
        uploaded_by: user.id,
        proof_image_url: proofImageUrl,
        bank_name: bankName || null,
        transaction_number: transactionNumber || null,
        transfer_amount: transferAmount ? parseFloat(transferAmount) : null,
        transfer_date: transferDate || null,
        status: 'pending',
      })
      .select()
      .single()

    if (proofError) {
      console.error('Failed to create proof record:', proofError)
      return NextResponse.json(
        { error: 'Failed to save proof record' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      proofId: proof.id,
      message: '凭证上传成功，等待审核',
    })
  } catch (error: any) {
    console.error('Bank proof upload error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to upload proof' },
      { status: 500 }
    )
  }
}
