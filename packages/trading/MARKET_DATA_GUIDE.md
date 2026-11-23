# Market Data Capability Seam — Integration Guide

## Overview

The market data capability seam provides a **unified interface** for real-time market data across multiple underlying providers (Robinhood, Polymarket, browser scraper). This guide explains the architecture, integration patterns, and usage patterns.

## Capability Seam Structure

A capability seam comprises three roles:

1. **Service Definition** (`@deepseek-ai/dsh-market-data`)
   - `MarketDataService` interface (consumer contract)
   - `MarketDataProvider` interface (provider contract)
   - `MarketDataRegistry` service (router/dispatcher)

2. **Service Providers** (register implementations)
   - `@deepseek-ai/dsh-market-data-robinhood` — Quotes, bars, subscriptions via MCP
   - `@deepseek-ai/dsh-market-data-polymarket` — Prediction market odds, sentiment
   - `@deepseek-ai/dsh-market-data-browser` — Browser-scraped sentiment (news, Twitter, analysts)

3. **Consumers** (call the service)
   - Trading strategy engines
   - LLM-facing market tools
   - Risk management gates
   - Backtesting engines

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ Consumer Layer (Trading Engine, LLM Tools, Risk Gates)              │
│                                                                      │
│  const quote = marketData.getQuote('SPY', 'robinhood')              │
│  const bars = marketData.getBars('SPY', '1h', 24)                   │
│  const sentiment = marketData.getSentiment(['SPY'], 'browser')      │
└──────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Service Definition Layer                                             │
│                                                                      │
│  MarketDataService (interface contract)                              │
│  MarketDataRegistry (router + dispatcher)                            │
│                                                                      │
│  - getQuote(symbol, provider?) → Promise<Quote>                     │
│  - getBars(symbol, interval, count, provider?) → Promise<Bar[]>     │
│  - subscribe(symbol, callback, provider?) → Promise<Subscription>   │
│  - getSentiment(symbols, provider?) → Promise<Sentiment[]>          │
└──────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Service Provider Layer (Multi-provider fallback)                     │
│                                                                      │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │
│  │   Robinhood     │  │   Polymarket     │  │    Browser       │    │
│  │                 │  │                  │  │                  │    │
│  │ • getQuote()    │  │ • getQuote()     │  │ • getSentiment() │    │
│  │ • getBars()     │  │ • getSentiment() │  │                  │    │
│  │ • subscribe()   │  │                  │  │                  │    │
│  └─────────────────┘  └──────────────────┘  └──────────────────┘    │
└──────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Data Source Layer                                                    │
│                                                                      │
│  Robinhood MCP → {equity/option quotes, Greeks, bars}               │
│  Polymarket REST → {market odds, volume, event data}                │
│  Browser (Playwright) → {news, Twitter, analyst ratings}            │
└─────────────────────────────────────────────────────────────────────┘
```

## Installation & Registration

### Step 1: Depend on the Service Definition

```json
{
  "peerDependencies": {
    "@deepseek-ai/dsh-market-data": "workspace:*"
  }
}
```

### Step 2: Register Providers

In your plugin or via `cordis.yml`:

```ts
// plugin.ts
import { Context } from '@deepseek-ai/cordis'

export const name = 'my-trading-engine'
export const inject = ['marketData']

export async function apply(ctx: Context) {
  // Providers register in order; first to support an operation wins
  // Robinhood first (preferred for quotes/bars)
  // Polymarket second (fallback, plus sentiment)
  // Browser third (sentiment-only)

  ctx.inject(['marketData'], (ctx, marketData) => {
    // Robinhood provides quotes, bars, subscriptions
    const robinhoodConfig = { subscriptionPollingIntervalMs: 500 }
    // await importRobinhoodProvider(ctx, robinhoodConfig)

    // Polymarket provides sentiment via market odds
    const polymarketConfig = { baseUrl: 'https://clob.polymarket.com' }
    // await importPolymarketProvider(ctx, polymarketConfig)

    // Browser scraper provides news/social sentiment
    const browserConfig = { maxConcurrency: 3 }
    // await importBrowserProvider(ctx, browserConfig)
  })
}
```

Or via `cordis.yml`:

```yaml
presets:
  - name: 'trading-live'
    plugins:
      - '@deepseek-ai/dsh-market-data'
      - '@deepseek-ai/dsh-market-data-robinhood':
          subscriptionPollingIntervalMs: 500
          debug: false
      - '@deepseek-ai/dsh-market-data-polymarket':
          baseUrl: 'https://clob.polymarket.com'
          timeoutMs: 10000
      - '@deepseek-ai/dsh-market-data-browser':
          maxConcurrency: 3
          debug: false
          sources:
            news:
              enabled: true
              weight: 1.0
            twitter:
              enabled: true
              weight: 0.8
            analystRatings:
              enabled: true
              weight: 0.6
```

## Usage Patterns

### Pattern 1: Simple Quote Fetch

```ts
ctx.inject(['marketData'], async (ctx, marketData) => {
  // Get current price with automatic provider selection
  const quote = await marketData.getQuote('SPY')
  console.log(`SPY: $${quote.price}`)

  // Or specify a provider
  const robinhoodQuote = await marketData.getQuote('SPY', 'robinhood')
  const polymarketQuote = await marketData.getQuote(
    'Will S&P 500 close above 6000?',
    'polymarket'
  )
})
```

### Pattern 2: Historical Analysis

```ts
// Get bars for technical analysis
const bars = await marketData.getBars('SPY', '1h', 24, 'robinhood')

const closes = bars.map(b => b.close)
const sma20 = closes.slice(-20).reduce((a, b) => a + b) / 20
const rsi = computeRSI(closes)

console.log(`SMA(20): $${sma20.toFixed(2)}, RSI: ${rsi.toFixed(2)}`)
```

### Pattern 3: Real-Time Subscription

```ts
// Subscribe to real-time updates
const sub = await marketData.subscribe('SPY', async quote => {
  // Called whenever a new quote arrives (typically 500ms polling)
  if (quote.price > 450 && quote.bid > 450) {
    // Place trade...
  }
})

// Cleanup
setTimeout(() => sub.dispose(), 60_000)
```

### Pattern 4: Multi-Data Strategy

```ts
// Combine multiple data sources for a trading signal
const spyQuote = await marketData.getQuote('SPY', 'robinhood')
const marketSentiment = await marketData.getSentiment(['S&P 500 above 6000?'], 'polymarket')
const newsSentiment = await marketData.getSentiment(['SPY'], 'browser')

const ivHigh = spyQuote.impliedVolatility > 0.25
const marketConfident = marketSentiment[0].score > 0.3
const newsPositive = newsSentiment[0].score > 0.2

if (ivHigh && marketConfident && newsPositive) {
  // All signals aligned: sell puts
  console.log('All signals bullish; sell put spread')
}
```

### Pattern 5: Per-Symbol Routing

```ts
// Different providers for different symbols
const spotPrice = await marketData.getQuote('BTC/USD', 'robinhood')
const eventOdds = await marketData.getQuote('Will BTC reach $100k?', 'polymarket')
const socialSentiment = await marketData.getSentiment(['BTC'], 'browser')

// Trader compares: spot price vs. prediction market odds vs. social sentiment
// If prediction market is bullish but social is bearish, potential arbitrage
```

## Multi-Provider Fallback

The registry implements **provider fallback**: if the first provider doesn't support an operation, it tries the next.

```ts
// Without provider filter: auto-fallback
ctx.marketData.register(robinhoodProvider)   // order 1
ctx.marketData.register(polymarketProvider)  // order 2
ctx.marketData.register(browserProvider)     // order 3

// Get bars → tries Robinhood (has getBars), succeeds
const bars = await marketData.getBars('SPY', '1h', 24)

// Get sentiment → tries Robinhood (no getSentiment), Polymarket (no getSentiment),
//                 Browser (has getSentiment), succeeds
const sentiment = await marketData.getSentiment(['SPY'])
```

## Error Handling

```ts
import { MarketDataError } from '@deepseek-ai/dsh-market-data'

try {
  const quote = await marketData.getQuote('INVALID')
} catch (err) {
  if (err instanceof MarketDataError) {
    switch (err.code) {
      case 'PROVIDER_NOT_FOUND':
        console.error('No providers registered')
        break
      case 'OPERATION_NOT_SUPPORTED':
        console.error('No provider supports this operation')
        break
      case 'SYMBOL_NOT_FOUND':
        console.error('Symbol does not exist')
        break
      case 'NETWORK_ERROR':
        console.error('Network request failed')
        break
      case 'AUTH_ERROR':
        console.error('Authentication failed')
        break
      default:
        console.error(`Unknown error: ${err.code}`)
    }
  }
}
```

## Real-Time Trading Loop Example

```ts
import { Context } from '@deepseek-ai/cordis'
import type { MarketDataService } from '@deepseek-ai/dsh-market-data'

export function apply(ctx: Context) {
  ctx.inject(['marketData'], async (ctx, marketData) => {
    // Setup: subscribe to real-time quotes
    let currentPrice: number | null = null
    let currentGreeks: { delta: number; gamma: number } | null = null

    const sub = await marketData.subscribe('SPY', quote => {
      currentPrice = quote.price
      currentGreeks = quote.greeks
        ? { delta: quote.greeks.delta, gamma: quote.greeks.gamma }
        : null
    })

    // Trading loop: check sentiment every 15 minutes
    let lastSentimentCheck = 0

    while (trading) {
      const now = Date.now()

      // Update sentiment infrequently (expensive)
      if (now - lastSentimentCheck > 15 * 60_000) {
        const sentiments = await marketData.getSentiment(['SPY', 'QQQ'], 'browser')
        // Update position sizing based on sentiment
        lastSentimentCheck = now
      }

      // Execute trade logic with latest price
      if (currentPrice && currentGreeks) {
        const signal = computeSignal(currentPrice, currentGreeks, sentiments)
        if (signal === 'BUY') {
          // Place trade
        }
      }

      await sleep(100)
    }

    // Cleanup
    sub.dispose()
  })
}
```

## Testing Providers

### Mock Provider for Unit Tests

```ts
import type { MarketDataProvider, Quote } from '@deepseek-ai/dsh-market-data'

const mockQuote: Quote = {
  symbol: 'SPY',
  price: 450.5,
  bid: 450.4,
  ask: 450.6,
  timestamp: Date.now(),
  volume: 1_000_000,
  changePercent: 0.5,
}

const mockProvider: MarketDataProvider = {
  name: 'mock',
  getQuote: async () => mockQuote,
  getBars: async () => [
    {
      open: 450,
      high: 455,
      low: 445,
      close: 452,
      volume: 1_000_000,
      timestamp: Date.now(),
    },
  ],
}

// In test setup:
ctx.marketData.register(mockProvider)
```

## Performance Considerations

**Latencies (typical):**

- `getQuote()` via Robinhood: 50-500ms
- `getBars()` via Robinhood: 100-2000ms (depends on data size)
- `subscribe()` via Robinhood (polling): 500ms + callback time
- `getSentiment()` via browser: 1-15s (concurrent scrapers)
- `getSentiment()` via Polymarket: 100-500ms

**Optimization strategies:**

1. **Cache quotes**: Store latest quote in memory; subscribe once
2. **Batch sentiment requests**: Fetch sentiment for multiple symbols concurrently
3. **Lazy subscriptions**: Don't subscribe until needed; dispose when done
4. **Provider selection**: Choose fast providers (Robinhood for quotes, Polymarket for odds) in registration order
5. **Concurrency control**: Browser sentiment uses configurable `maxConcurrency` to avoid resource exhaustion

## Extending the Capability Seam

To add a new provider (e.g., `dsh-market-data-alphavantage`):

1. **Implement `MarketDataProvider` interface:**

```ts
export class AlphaVantageProvider implements MarketDataProvider {
  readonly name = 'alphavantage'

  async getQuote(symbol: string): Promise<Quote> {
    // Call Alpha Vantage API
  }

  async getBars(symbol: string, interval: BarInterval, count: number): Promise<Bar[]> {
    // Call Alpha Vantage API
  }

  // Other operations optional
}
```

2. **Register in plugin:**

```ts
export function apply(ctx: Context) {
  const provider = new AlphaVantageProvider(ctx, config)
  ctx.marketData.register(provider)
}
```

3. **Consumers immediately see the new provider:**

```ts
// Automatically uses AlphaVantage if Robinhood is unavailable
const quote = await marketData.getQuote('SPY')

// Or explicitly:
const quote = await marketData.getQuote('SPY', 'alphavantage')
```

## Best Practices

### Do's

- ✅ Inject `marketData` as a dependency; never reach `ctx.get()` without documentation
- ✅ Specify a provider when you need a specific data source
- ✅ Call `dispose()` on subscriptions when done
- ✅ Cache quotes locally to avoid repeated fetches
- ✅ Batch sentiment requests across multiple symbols
- ✅ Handle `MarketDataError` with proper fallback logic

### Don'ts

- ❌ Don't hold subscriptions indefinitely; dispose after trading session
- ❌ Don't assume a provider supports all operations (use error handling)
- ❌ Don't scrape market data sites directly; use providers
- ❌ Don't hardcode provider names in trading logic (allow routing via config)
- ❌ Don't make synchronous market data calls (all operations are async)

## Configuration Examples

### Paper Trading (Mock Providers)

```yaml
presets:
  - name: 'trading-paper'
    plugins:
      - '@deepseek-ai/dsh-market-data'
      - '@deepseek-ai/dsh-market-data-mock':
          responseDelay: 100
          slippagePercent: 0.1
```

### Live Trading (Real Providers)

```yaml
presets:
  - name: 'trading-live'
    plugins:
      - '@deepseek-ai/dsh-market-data'
      - '@deepseek-ai/dsh-market-data-robinhood':
          subscriptionPollingIntervalMs: 500
      - '@deepseek-ai/dsh-market-data-polymarket':
          baseUrl: 'https://clob.polymarket.com'
      - '@deepseek-ai/dsh-market-data-browser':
          maxConcurrency: 3
```

### Backtest (Historical Data Provider)

```yaml
presets:
  - name: 'trading-backtest'
    plugins:
      - '@deepseek-ai/dsh-market-data'
      - '@deepseek-ai/dsh-market-data-historical':
          dataPath: '/data/historical/'
          startDate: '2023-01-01'
          endDate: '2024-12-31'
```

## Related Documentation

- `/packages/trading/market-data/README.md` — Service definition API
- `/packages/trading/market-data-robinhood/README.md` — Robinhood provider details
- `/packages/trading/market-data-polymarket/README.md` — Polymarket provider details
- `/packages/trading/market-data-browser/README.md` — Browser scraper details
- `/packages/trading/execution/README.md` — Order execution (sibling capability seam)
- `/packages/trading/risk-policy/README.md` — Risk management (consumer of market data)
