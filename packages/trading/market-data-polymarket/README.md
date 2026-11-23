---
description: "Polymarket prediction market API client: odds, liquidity signals, and sentiment"
---

# @deepseek-ai/dsh-market-data-polymarket

Polymarket market data provider: fetches prediction market odds, volume, and sentiment for event-based markets.

## Overview

This is a **Service Provider** that registers with the market data registry. It bridges the Polymarket REST API to the unified market data interface.

**Implements:**
- `getQuote()` — Market odds (bid/ask) as prices (0-1)
- `getSentiment()` — Trading volume and order flow as bullish/bearish signal

**Does NOT implement:**
- `getBars()` — Polymarket is event-driven (no OHLCV bars)
- `subscribe()` — No websocket feed (stateless REST API only)

## Overview of Polymarket

Polymarket is a prediction market platform where traders bet on real-world outcomes:

- **Markets:** Yes/No outcomes on elections, sports, crypto, economics, etc.
- **Trading:** Contracts trade between 0 (no) and 1 (yes); mid-price represents consensus odds
- **Volume:** Cumulative volume and bid/ask spreads indicate market consensus and conviction
- **Use for LLM:** Polymarket odds + volume provide forward-looking sentiment; "If crypto rally happens, is prediction market pricing it in?"

## Installation

```ts
import { Context } from '@deepseek-ai/cordis'
import { apply as applyPolymarketMarketData } from '@deepseek-ai/dsh-market-data-polymarket'

export function apply(ctx: Context) {
  applyPolymarketMarketData(ctx, {
    baseUrl: 'https://clob.polymarket.com',
    timeoutMs: 10_000,
    debug: false,
  })
}
```

Or via `cordis.yml`:

```yaml
plugins:
  '@deepseek-ai/dsh-market-data-polymarket':
    baseUrl: 'https://clob.polymarket.com'
    timeoutMs: 10000
```

## Configuration

```ts
interface PolymarketMarketDataConfig {
  /** Polymarket API base URL (default: https://clob.polymarket.com). */
  baseUrl?: string
  /** Request timeout in milliseconds (default: 10000). */
  timeoutMs?: number
  /** Enable debug logging. */
  debug?: boolean
}
```

## Usage

### Quotes (Market Odds)

```ts
import { Context } from '@deepseek-ai/cordis'

export function apply(ctx: Context) {
  ctx.inject(['marketData'], async (ctx, marketData) => {
    // Get odds for a specific market
    const quote = await marketData.getQuote('Will BTC be >$100k by end of 2024?', 'polymarket')
    console.log(`Market odds: ${(quote.price * 100).toFixed(1)}%`)
    console.log(`Bid: ${quote.bid}, Ask: ${quote.ask}`)
    console.log(`Volume: ${quote.volume}`)
  })
}
```

**Quote format:**

```ts
{
  symbol: 'Will BTC be >$100k by end of 2024?',
  price: 0.72,          // Mid-odds (yes is 72% likely per market)
  bid: 0.70,            // Best buy price (want yes to happen)
  ask: 0.73,            // Best sell price (want yes NOT to happen)
  timestamp: 1234567890000,
  volume: 5_000_000,    // Total volume traded, in tokens
  changePercent: 0      // Not available for Polymarket
}
```

### Sentiment (Order Flow)

```ts
// Get sentiment from multiple markets
const sentiments = await marketData.getSentiment([
  'Will BTC be >$100k by end of 2024?',
  'Will US inflation be <2% by Q4 2024?',
  'Will S&P 500 close above 6000?',
], 'polymarket')

sentiments.forEach(s => {
  console.log(`${s.symbol}: sentiment = ${s.score.toFixed(2)} (${s.sampleCount} data points)`)
})
```

**Sentiment format:**

```ts
{
  symbol: 'Will BTC be >$100k by end of 2024?',
  score: 0.44,                      // -1 (bearish) to 1 (bullish)
  sampleCount: 500,                 // Volume / sample size
  timestamp: 1234567890000,
  sourceScores: {
    polymarket_odds: 0.44           // Breakdown by source
  }
}
```

**Sentiment interpretation:**

- `score > 0.3` — Strong bullish conviction (market odds >65%)
- `score -0.3 to 0.3` — Neutral (45-55% odds)
- `score < -0.3` — Strong bearish conviction (market odds <35%)

## Multi-Provider Integration

Polymarket is typically used as a **sentiment/liquidity signal** alongside traditional market data:

```ts
// cordis.yml or plugin registration order:
// 1. Robinhood (quotes, bars, subscriptions for stocks/options)
// 2. Polymarket (sentiment, volume signal)
// 3. Browser scraper (news sentiment)

ctx.marketData.register(robinhoodProvider)
ctx.marketData.register(polymarketProvider)
ctx.marketData.register(browserProvider)
```

**Combined trading signal:**

```ts
const spyQuote = await marketData.getQuote('SPY', 'robinhood')
const marketSentiment = await marketData.getSentiment(['Will S&P 500 close above 6000?'], 'polymarket')

const marketConfident = marketSentiment[0].score > 0.3
const ivHigh = spyQuote.impliedVolatility > 0.25

if (ivHigh && marketConfident) {
  // IV is elevated but market is bullish → sell puts (collect premium)
}
```

## Limitations

**Polymarket does not support:**
- Historical bars (use Robinhood for tick history)
- Real-time subscriptions (REST-only; use polling if needed)
- Equities, options, cryptocurrencies directly (uses prediction markets instead)

**Covered outcomes:**

- US Politics (elections, appointments, legislation)
- Sports (championships, MVP predictions)
- Crypto (price targets, adoption)
- Economics (inflation, unemployment, Fed policy)
- Disasters/Geopolitics (war, natural disasters)

## Real-World Examples

### 1. Options Strategy Triggered by Prediction Market

```ts
// Sell call spreads when market predicts sideways/down
const sentiments = await marketData.getSentiment([
  'Will S&P 500 be above 5500 on 2026-11-30?'
], 'polymarket')

if (sentiments[0].score < 0) {
  // Market is bearish; sell call spread
  const quote = await marketData.getQuote('SPY', 'robinhood')
  // Place trade...
}
```

### 2. Crypto Trading with Prediction Market Signal

```ts
// Get Bitcoin market odds
const btcQuote = await marketData.getQuote('Will BTC be >$100k?', 'polymarket')
const btcSpot = await marketData.getQuote('BTC/USD', 'robinhood')

// If market odds are high and spot is not at peak, buy
if (btcQuote.price > 0.7 && btcSpot.price < 95_000) {
  // Market is 70%+ bullish but price hasn't caught up
  // Place buy order...
}
```

### 3. Backtest Filter with Volume Signal

```ts
// Only trade when prediction market volume is high (consensus)
const sentiments = await marketData.getSentiment(symbols)
const liquidMarkets = sentiments.filter(s => s.sampleCount > 100)

// Trade only high-consensus predictions
```

## Error Handling

```ts
import { MarketDataError } from '@deepseek-ai/dsh-market-data'

try {
  const quote = await marketData.getQuote('Invalid Market', 'polymarket')
} catch (err) {
  if (err instanceof MarketDataError) {
    if (err.code === 'OPERATION_NOT_SUPPORTED') {
      // Try alternative provider (e.g., Robinhood for bars)
    }
  }
}
```

## Known Limitations and Deferred Work

- **API rate limits:** No built-in rate-limiting; production use requires request queuing.
- **Market resolution:** No automatic tracking of market outcomes/resolutions; consumers must manage position closure.
- **Latency:** Polymarket CLOB is REST-based (no websockets); 100-500ms latency typical. High-frequency strategies should use `dsh-market-data-robinhood` instead.
- **Coverage gaps:** Inactive markets may have stale quotes; `volume` indicates liquidity.
- **No subscriptions:** Future versions may add polling-based subscriptions or WebSocket integration.
