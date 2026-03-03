const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/SLV?interval=1d&range=1d`;
const yfRes = await fetch(yfUrl);
const data = await yfRes.json();
const meta = data.chart?.result?.[0]?.meta;
console.log(meta);
