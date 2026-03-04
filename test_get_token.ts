import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function getToken() {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'password123',
    });
    console.log(data?.session?.access_token || error?.message);
}
getToken();
