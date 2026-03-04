import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

async function test() {
  const apiKey = process.env.MARKET_DATA_API_KEY || process.env.ALPHA_VANTAGE_KEY
  console.log("Using API key:", apiKey?.substring(0, 5) + "...")
  
  const newsUrl = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=AAPL&apikey=${apiKey}&sort=LATEST&limit=50`
  const res = await fetch(newsUrl)
  console.log("Status:", res.status)
  
  const data = await res.json()
  console.log("Response:", JSON.stringify(data).substring(0, 800))
}
test()
