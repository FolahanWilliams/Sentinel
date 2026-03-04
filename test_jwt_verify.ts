import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL') || process.env.VITE_SUPABASE_URL || '';
const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testToken() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'brian.folahan@gmail.com',
    password: 'Password123!'
  });
  
  if (error) {
    console.error("Login failed:", error.message);
    return;
  }
  
  const token = data.session.access_token;
  console.log("Got token.");
  
  // Try getUser
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  console.log("getUser error:", userError?.message);
  console.log("getUser success:", !!userData?.user);
}

testToken();
