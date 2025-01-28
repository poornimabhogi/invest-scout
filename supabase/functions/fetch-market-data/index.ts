import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AlphaVantageQuote {
  "Global Quote": {
    "01. symbol": string;
    "02. open": string;
    "03. high": string;
    "04. low": string;
    "05. price": string;
    "06. volume": string;
    "07. latest trading day": string;
    "08. previous close": string;
    "09. change": string;
    "10. change percent": string;
  }
}

interface CompanyOverview {
  Symbol: string;
  Name: string;
  Sector: string;
  MarketCapitalization: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const ALPHA_VANTAGE_API_KEY = Deno.env.get('ALPHA_VANTAGE_API_KEY')
    if (!ALPHA_VANTAGE_API_KEY) {
      throw new Error('Alpha Vantage API key not found')
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not found')
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey)

    // List of popular stocks to fetch (you can expand this list)
    const symbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'JPM', 'V', 'WMT']

    console.log('Starting to fetch market data...')

    for (const symbol of symbols) {
      try {
        // Fetch quote data
        const quoteResponse = await fetch(
          `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`
        )
        const quoteData: AlphaVantageQuote = await quoteResponse.json()

        // Fetch company overview
        const overviewResponse = await fetch(
          `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`
        )
        const overviewData: CompanyOverview = await overviewResponse.json()

        if (quoteData["Global Quote"] && overviewData.Symbol) {
          const quote = quoteData["Global Quote"]
          const marketData = {
            symbol: quote["01. symbol"],
            name: overviewData.Name,
            price: parseFloat(quote["05. price"]),
            change: parseFloat(quote["09. change"]),
            change_percentage: parseFloat(quote["10. change percent"].replace('%', '')),
            market_cap: parseFloat(overviewData.MarketCapitalization),
            volume: parseFloat(quote["06. volume"]),
            market: 'NYSE', // This is simplified, you might want to determine this dynamically
            sector: overviewData.Sector,
            asset_type: 'stock'
          }

          // Upsert the data into the market_data table
          const { error } = await supabase
            .from('market_data')
            .upsert(
              marketData,
              { onConflict: 'symbol,asset_type' }
            )

          if (error) {
            console.error(`Error upserting data for ${symbol}:`, error)
          } else {
            console.log(`Successfully updated data for ${symbol}`)
          }
        }

        // Add a small delay to respect API rate limits
        await new Promise(resolve => setTimeout(resolve, 1500))
      } catch (error) {
        console.error(`Error processing ${symbol}:`, error)
      }
    }

    return new Response(
      JSON.stringify({ message: 'Market data update completed' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})