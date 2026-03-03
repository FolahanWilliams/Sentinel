const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/SLV?interval=1d&range=1d`;
const yfRes = await fetch(yfUrl);
console.log(yfRes.status);
const data = await yfRes.json();
const meta = data.chart?.result?.[0]?.meta;
if (meta) {
    console.log({
        price: meta.regularMarketPrice,
        previousClose: meta.previousClose
    });
} else {
    console.log(JSON.stringify(data, null, 2));
}
