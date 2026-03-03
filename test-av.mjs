const avUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=SLV&apikey=demo`;
const res = await fetch(avUrl);
console.log(await res.json());
