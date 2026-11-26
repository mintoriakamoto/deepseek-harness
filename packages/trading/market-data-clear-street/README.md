# @deepseek-ai/dsh-market-data-clear-street

Clear Street sentiment provider for the market data registry: analyst consensus ratings and bias detection.

## Overview

This provider aggregates analyst Buy/Hold/Sell consensus ratings from Clear Street and exposes them through the unified market data service:

- **getAnalystRatings()**: Raw analyst consensus (buy count, hold count, sell count)
- **getSentiment()**: Normalized sentiment scores [-1 (bearish) to 1 (bullish)]
- **detectBias()**: Consensus bubble detection (>70% analyst agreement)

## Installation

```bash
pnpm add @deepseek-ai/dsh-market-data-clear-street
```

## Usage

### Basic Setup

Register the provider in your Cordis config:

```ts
import { name, inject, apply } from '@deepseek-ai/dsh-market-data-clear-street'

export { name, inject, apply }
```

Or programmatically:

```ts
import { ClearStreetSentimentProvider } from '@deepseek-ai/dsh-market-data-clear-street'

ctx.plugin(ClearStreetSentimentProvider, {
  apiKey: process.env.CLEAR_STREET_API_KEY,
  cacheTtlMs: 300_000, // 5 minutes
})
```

### Fetching Sentiment

```ts
// Get normalized sentiment for symbols
const sentiments = await ctx.marketData.getSentiment(['AAPL', 'MSFT', 'GOOGL'])

for (const sent of sentiments) {
  console.log(`${sent.symbol}: score=${sent.score} (${sent.sampleCount} analysts)`)
  // AAPL: score=0.65 (20 analysts)
  // MSFT: score=0.3 (18 analysts)
  // GOOGL: score=-0.1 (19 analysts)
}
```

### Detecting Analyst Bias

```ts
// Check for consensus bubbles (>70% single rating)
const bias = await provider.detectBias('TSLA')

if (bias.hasBias) {
  console.log(
    `${bias.symbol}: ${bias.dominantPercentage.toFixed(1)}% rate as ${bias.dominantRating}`,
  )
  // TSLA: 85.0% rate as buy
}
```

### Raw Ratings

```ts
// Access raw Buy/Hold/Sell counts
const ratings = await provider.getAnalystRatings('NVDA')

console.log({
  symbol: ratings.symbol,
  buy: ratings.buyCount,
  hold: ratings.holdCount,
  sell: ratings.sellCount,
  consensus: ratings.consensus,
  avgTarget: ratings.avgTarget,
})
// {
//   symbol: 'NVDA',
//   buy: 15,
//   hold: 3,
//   sell: 1,
//   consensus: 'buy',
//   avgTarget: 145.50
// }
```

## Configuration

```ts
interface ClearStreetConfig {
  /** API base URL (default: https://api.clearstreet.io/v1) */
  apiBaseUrl?: string

  /** API key for Clear Street authentication */
  apiKey?: string

  /** Cache time-to-live in milliseconds (default: 300000 = 5 minutes) */
  cacheTtlMs?: number

  /** Enable debug logging (default: false) */
  debug?: boolean
}
```

## Sentiment Score Interpretation

The sentiment score is calculated as `(buy - sell) / total` and normalized to [-1, 1]:

- **1.0**: All analysts bullish (buy)
- **0.5**: 75% buy, 25% sell (strong bullish)
- **0.0**: Neutral (equal buy/sell or all hold)
- **-0.5**: 25% buy, 75% sell (strong bearish)
- **-1.0**: All analysts bearish (sell)

## Bias Detection

Consensus bias is detected when any single rating (buy, hold, or sell) comprises >70% of all analyst ratings:

```ts
interface BiasDetection {
  symbol: string
  hasBias: boolean // true if >70% single rating
  dominantPercentage: number // 0-100
  dominantRating: 'buy' | 'hold' | 'sell'
  totalAnalysts: number
}
```

A bias > 70% may signal:

- Strong market consensus (reliable signal)
- Analyst herding behavior (confirmation bias)
- Recent earnings miss/beat
- Major corporate event

## Caching

Ratings are cached for `cacheTtlMs` (default: 5 minutes) to reduce API calls:

```ts
// First call: hits API
const r1 = await provider.getAnalystRatings('AAPL') // Network request

// Second call within 5 minutes: cache hit
const r2 = await provider.getAnalystRatings('AAPL') // Instant

// After 5 minutes: cache expired
const r3 = await provider.getAnalystRatings('AAPL') // Network request again
```

## Error Handling

```ts
import { MarketDataError } from '@deepseek-ai/dsh-market-data'

try {
  const sent = await ctx.marketData.getSentiment(['INVALID'])
} catch (err) {
  if (err instanceof MarketDataError) {
    console.error(`${err.code}: ${err.message}`)
  }
}
```

## Multi-Provider Fallback

Register multiple sentiment providers; the market data service tries each in order:

```ts
ctx.plugin(ClearStreetSentimentProvider, { apiKey: process.env.CLEAR_STREET_KEY })
ctx.plugin(YFinanceSentimentProvider, {}) // fallback
```

Then query:

```ts
// Uses first available provider
const sent = await ctx.marketData.getSentiment(['AAPL'])

// Or specify provider explicitly
const sent = await ctx.marketData.getSentiment(['AAPL'], 'clear-street')
```

## Model Experience

Analyst consensus sentiment provides forward-looking bias for trading strategies:

- **Input tokens**: ~100 per symbol (cached)
- **Output tokens**: ~50 per symbol sentiment result
- **Cache effect**: 5-minute TTL reduces API calls by ~90% under typical usage

## Known Limitations and Deferred Work

- **API integration**: Currently uses mock data; production integration requires Clear Street API credentials
- **Real-time updates**: Analyst ratings update daily; for intraday sentiment, combine with other sources (news, social)
- **Bias threshold**: 70% threshold is configurable but hardcoded in this version; future versions may allow customization
- **Historical data**: Provider returns only current consensus; historical rating changes not available
- **Rate limiting**: No built-in rate limiting; configure externally if needed

## See Also

- [@deepseek-ai/dsh-market-data](../market-data) — Market data service and types
- Robinhood provider: Real-time quotes and Greeks
- Polymarket provider: Prediction market data
