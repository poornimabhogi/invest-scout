import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface StockListing {
  symbol: string;
  name: string;
  exchange: string;
  assetType: string;
  ipoDate: string;
  status: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('Starting market data fetch...')
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Fetch listing of active stocks
    const listingUrl = `https://www.alphavantage.co/query?function=LISTING_STATUS&apikey=${Deno.env.get('ALPHA_VANTAGE_API_KEY')}`
    const listingResponse = await fetch(listingUrl)
    const csvText = await listingResponse.text()
    
    // Parse CSV (skip header row)
    const rows = csvText.split('\n').slice(1)
    const activeStocks = rows
      .map(row => {
        const [symbol, name, exchange, assetType, ipoDate, status] = row.split(',')
        return { symbol, name, exchange, assetType, ipoDate, status }
      })
      .filter(stock => stock.status === 'Active' && (stock.exchange === 'NYSE' || stock.exchange === 'NASDAQ'))
      .slice(0, 100) // Limit to first 100 stocks due to API rate limits

    console.log(`Found ${activeStocks.length} active stocks`)

    // Fetch current prices for each stock
    for (const stock of activeStocks) {
      try {
        const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${stock.symbol}&apikey=${Deno.env.get('ALPHA_VANTAGE_API_KEY')}`
        const response = await fetch(quoteUrl)
        const data = await response.json()

        if (data['Global Quote']) {
          const quote = data['Global Quote']
          const price = parseFloat(quote['05. price'])
          const change = parseFloat(quote['09. change'])
          const changePercent = parseFloat(quote['10. change percent'].replace('%', ''))
          const volume = parseInt(quote['06. volume'])

          const { error } = await supabaseClient
            .from('market_data')
            .upsert({
              symbol: stock.symbol,
              name: stock.name,
              asset_type: stock.assetType,
              price: price,
              change: change,
              change_percentage: changePercent,
              volume: volume,
              market: stock.exchange,
              sector: 'N/A', // Alpha Vantage basic API doesn't provide sector info
            }, {
              onConflict: 'symbol,asset_type'
            })

          if (error) {
            console.error(`Error updating ${stock.symbol}:`, error)
          } else {
            console.log(`Successfully updated ${stock.symbol}`)
          }
        }

        // Add a delay to respect API rate limits (5 calls per minute on free tier)
        await new Promise(resolve => setTimeout(resolve, 12000))
      } catch (error) {
        console.error(`Error processing ${stock.symbol}:`, error)
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in fetch-market-data function:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})