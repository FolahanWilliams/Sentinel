const req = { prompt: "hello", model: "gemini-3-flash-preview" };
const res = await fetch('https://nuccazrwkbmemzhoqnwx.supabase.co/functions/v1/proxy-gemini', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51Y2NhenJ3a2JtZW16aG9xbnd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDQxMTE1OTIsImV4cCI6MjAyMDExMTU5Mn0.THIS_IS_A_MOCK_JWT'
    },
    body: JSON.stringify(req)
});
console.log("Status:", res.status);
console.log("Body:", await res.text());
