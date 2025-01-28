import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// List of stock symbols to track
const SYMBOLS = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM', 'V', 'WMT']

interface AlphaVantageResponse {
  'Global Quote': {
    '01. symbol': string
    '02. open': string
    '03. high': string
    '04. low': string
    '05. price': string
    '06. volume': string
    '07. latest trading day': string
    '08. previous close': string
    '09. change': string
    '10. change percent': string
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log('Starting market data fetch...')

    for (const symbol of SYMBOLS) {
      try {
        const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${Deno.env.get('ALPHA_VANTAGE_API_KEY')}`
        const response = await fetch(url)
        const data: AlphaVantageResponse = await response.json()

        if (!data['Global Quote'] || !data['Global Quote']['01. symbol']) {
          console.error(`No data returned for symbol: ${symbol}`)
          continue
        }

        const quote = data['Global Quote']
        const price = parseFloat(quote['05. price'])
        const change = parseFloat(quote['09. change'])
        const changePercent = parseFloat(quote['10. change percent'].replace('%', ''))
        const volume = parseInt(quote['06. volume'])

        const { error } = await supabaseClient
          .from('market_data')
          .upsert({
            symbol: symbol,
            name: symbol, // We could fetch company names from another API endpoint if needed
            asset_type: 'stock',
            price: price,
            change: change,
            change_percentage: changePercent,
            volume: volume,
            market: 'NYSE', // This could be made more accurate with additional API calls
            sector: 'Technology', // This could be made more accurate with additional API calls
          }, {
            onConflict: 'symbol,asset_type'
          })

        if (error) {
          console.error(`Error updating ${symbol}:`, error)
        } else {
          console.log(`Successfully updated ${symbol}`)
        }

        // Add a small delay to respect API rate limits
        await new Promise(resolve => setTimeout(resolve, 1500))
      } catch (error) {
        console.error(`Error processing ${symbol}:`, error)
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