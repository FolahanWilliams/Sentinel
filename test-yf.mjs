const yfUrl = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=SLV`;
const yfRes = await fetch(yfUrl, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
    }
});
console.log(yfRes.status);
const data = await yfRes.json();
console.log(JSON.stringify(data, null, 2));
