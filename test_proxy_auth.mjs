import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function signInAndGetToken() {
    let email = `testauth${Date.now()}@example.com`;
    // Try anonymous signin or signup to get a token
    let { data, error } = await supabase.auth.signUp({
        email: email,
        password: 'password123',
    });

    if (error && error.message.includes('User already registered')) {
        const res = await supabase.auth.signInWithPassword({
            email: email,
            password: 'password123',
        });
        data = res.data;
        error = res.error;
    }

    if (error || !data?.session?.access_token) {
        console.error('Error signing in:', error?.message);
        process.exit(1);
    }

    const token = data.session.access_token;
    console.log(`Sending token...`);

    const response = await fetch(`${supabaseUrl}/functions/v1/proxy-market-data`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            endpoint: 'quote',
            ticker: 'AAPL'
        })
    });

    const text = await response.text();
    console.log('Status:', response.status);
    console.log('Response:', text);
}

signInAndGetToken();
