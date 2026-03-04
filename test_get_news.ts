import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function test() {
  const { data: { user }, error: authErr } = await supabase.auth.signInAnonymously()
  if (authErr) { console.error("Auth error:", authErr); return }
  const { data: session } = await supabase.auth.getSession()
  const token = session.session?.access_token

  console.log("Got anon token. Requesting news...")
  const res = await fetch("http://127.0.0.1:54321/functions/v1/proxy-market-data", {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'news_sentiment', tickerParam: '&tickers=AAPL' })
  })
  console.log(`Status: ${res.status}`)
  console.log("Body:", await res.text())
}
test()
