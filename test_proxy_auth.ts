import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Just a dummy script to test the auth
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';

console.log("URL:", SUPABASE_URL);
console.log("ANON:", SUPABASE_ANON_KEY.substring(0, 5) + "...");
