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
      .slice(0, 50) // Process 50 stocks for now

    console.log(`Found ${activeStocks.length} active stocks to process`)

    // Process stocks in smaller batches to respect API rate limits
    const batchSize = 5;
    for (let i = 0; i < activeStocks.length; i += batchSize) {
      const batch = activeStocks.slice(i, i + batchSize);
      console.log(`Processing batch ${i/batchSize + 1} of ${Math.ceil(activeStocks.length/batchSize)}`)
      
      // Process each stock in the batch
      for (const stock of batch) {
        try {
          console.log(`Fetching data for ${stock.symbol}...`)
          const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${stock.symbol}&apikey=${Deno.env.get('ALPHA_VANTAGE_API_KEY')}`
          const response = await fetch(quoteUrl)
          const data = await response.json()

          if (data['Global Quote']) {
            const quote = data['Global Quote']
            const price = parseFloat(quote['05. price']) || 0
            const change = parseFloat(quote['09. change']) || 0
            const changePercent = parseFloat(quote['10. change percent'].replace('%', '')) || 0
            const volume = parseInt(quote['06. volume']) || 0

            // Upsert with retry logic
            for (let retry = 0; retry < 3; retry++) {
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
                  onConflict: 'symbol'
                })

              if (!error) {
                console.log(`Successfully updated ${stock.symbol}`)
                break
              } else if (retry === 2) {
                console.error(`Failed to update ${stock.symbol} after 3 retries:`, error)
              }
            }
          }
          
          // Add a small delay between individual API calls
          await new Promise(resolve => setTimeout(resolve, 12000)) // 12 second delay between calls
        } catch (error) {
          console.error(`Error processing ${stock.symbol}:`, error)
        }
      }

      // Add a delay between batches
      if (i + batchSize < activeStocks.length) {
        console.log('Waiting 30 seconds before processing next batch...')
        await new Promise(resolve => setTimeout(resolve, 30000))
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