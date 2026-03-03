import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envFile = readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const [key, val] = line.split('=');
    if (key && val) env[key.trim()] = val.trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function test() {
    try {
        const res = await supabase.functions.invoke('proxy-rss', {
            body: { feedUrl: 'https://www.reddit.com/r/wallstreetbets/search.rss?q=AAPL&restrict_sr=1&sort=new' }
        });
        console.log("Status:", res.error ? "Error" : "Success");
        if (res.data) console.log("Data sample:", typeof res.data === 'string' ? res.data.slice(0, 500) : res.data);
        if (res.error) console.log("Error details:", res.error);
    } catch (err) {
        console.error("Caught exception:", err);
    }
}
test();
