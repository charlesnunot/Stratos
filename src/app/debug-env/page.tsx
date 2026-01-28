export default function DebugEnvPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
      <h1>🔍 Environment Variables Debug Page</h1>
      <div style={{ marginTop: '20px', backgroundColor: '#f5f5f5', padding: '10px' }}>
        <p><strong>NEXT_PUBLIC_SUPABASE_URL:</strong></p>
        <p>{supabaseUrl ? `✅ ${supabaseUrl}` : '❌ NOT SET'}</p>
        
        <p style={{ marginTop: '20px' }}><strong>NEXT_PUBLIC_SUPABASE_ANON_KEY:</strong></p>
        <p>{supabaseKey ? `✅ ${supabaseKey.substring(0, 50)}...` : '❌ NOT SET'}</p>
        
        <p style={{ marginTop: '20px' }}><strong>NODE_ENV:</strong></p>
        <p>{process.env.NODE_ENV}</p>
      </div>
    </div>
  )
}
