import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import 'https://deno.land/x/dotenv/load.ts'

const supabaseUrl = Deno.env.get('VITE_SUPABASE_URL');
const supabaseKey = Deno.env.get('VITE_SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars');
    Deno.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function signInAndGetToken() {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'password123',
    });

    if (error) {
        console.error('Error signing in:', error.message);
        Deno.exit(1);
    }

    if (!data?.session?.access_token) {
        console.error('No session token returned');
        Deno.exit(1);
    }

    const token = data.session.access_token;
    console.log(`Getting Bearer token...`);

    const response = await fetch(`${supabaseUrl}/functions/v1/proxy-market-data`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            endpoint: 'chart',
            tickerParam: 'AAPL'
        })
    });

    const text = await response.text();
    console.log('Status:', response.status);
    console.log('Response:', text);
}

signInAndGetToken();
