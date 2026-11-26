---
description: "Unified market data service: quotes, bars, subscriptions, and sentiment across multiple providers"
---

# @deepseek-ai/dsh-market-data

Market data service definition: unified interface for fetching real-time quotes, historical OHLCV bars, real-time subscriptions, and aggregated sentiment scores. Supports multi-provider fallback and consumer-specified routing.

## Overview

`dsh-market-data` is a **Service Definition** (capability seam) that abstracts market data retrieval across multiple underlying providers. Consumers call the service interface; providers register implementations supporting any subset of operations (getQuote, getBars, subscribe, getSentiment).

### Capability Seam

- **Service Definition**: `MarketDataService`, `MarketDataRegistry`
- **Consumer role**: Any plugin calling `marketData.getQuote()` / `getBars()` / `subscribe()` / `getSentiment()`
- **Provider role**: Plugins implementing `MarketDataProvider` and registering via `ctx.marketData.register()`

### Provider Examples

| Provider Package | Implements | Source |
|---|---|---|
| `dsh-market-data-robinhood` | getQuote, getBars, subscribe | Robinhood MCP adapter |
| `dsh-market-data-polymarket` | getQuote, getSentiment | Polymarket REST API |
| `dsh-market-data-browser` | getSentiment | Playwright scraper |

## API

### Service: `MarketDataService`

```ts
interface MarketDataService {
  // Fetch real-time quote: price, bid/ask, volume, Greeks (for options)
  getQuote(symbol: string, provider?: string): Promise<Quote>

  // Fetch historical OHLCV bars
  getBars(symbol: string, interval: BarInterval, count: number, provider?: string): Promise<Bar[]>

  // Subscribe to real-time updates (callback invoked on each quote)
  subscribe(symbol: string, callback: QuoteSubscriptionCallback, provider?: string): Promise<QuoteSubscription>

  // Fetch aggregated sentiment for symbols
  getSentiment(symbols: string[], provider?: string): Promise<Sentiment[]>
}
```

### Types

**Quote** — Real-time market price with bid/ask, volume, timestamp, and optional Greeks (options).

```ts
interface Quote {
  symbol: string
  price: number
  bid: number
  ask: number
  timestamp: number
  volume: number
  changePercent: number
  greeks?: { delta: number; gamma: number; vega: number; theta: number }
  impliedVolatility?: number
  underlyingSymbol?: string
  expirationDate?: string
}
```

**Bar** — OHLCV historical bar.

```ts
interface Bar {
  open: number
  high: number
  low: number
  close: number
  volume: number
  timestamp: number
}
```

**Sentiment** — Aggregated sentiment score and source breakdown.

```ts
interface Sentiment {
  symbol: string
  score: number // -1 (bearish) to 1 (bullish)
  sampleCount: number
  timestamp: number
  sourceScores?: Record<string, number>
}
```

**BarInterval** — `'1m' | '5m' | '15m' | '1h' | '1d'`

## Consumer Usage

```ts
import { MarketDataService } from '@deepseek-ai/dsh-market-data'

export function apply(ctx: Context) {
  ctx.inject(['marketData'], async (ctx, marketData) => {
    // Get a live quote
    const quote = await marketData.getQuote('SPY')
    console.log(`SPY: $${quote.price} (bid: $${quote.bid}, ask: $${quote.ask})`)

    // Fetch historical bars
    const bars = await marketData.getBars('SPY', '1h', 24)
    console.log(`Last 24 hourly bars: ${bars.length} candles`)

    // Subscribe to real-time updates
    const sub = await marketData.subscribe('QQQ', quote => {
      console.log(`QQQ updated: $${quote.price}`)
    })

    // Later: unsubscribe
    sub.dispose()

    // Get sentiment
    const sentiments = await marketData.getSentiment(['BTC', 'ETH'])
    console.log(`BTC sentiment: ${sentiments[0].score}`)
  })
}
```

## Provider Registration

Providers register implementations supporting any subset of operations:

```ts
export function apply(ctx: Context) {
  const robinhoodProvider: MarketDataProvider = {
    name: 'robinhood',
    getQuote: async symbol => { /* MCP adapter call */ },
    getBars: async (symbol, interval, count) => { /* ... */ },
    subscribe: async (symbol, callback) => { /* ... */ },
  }

  ctx.marketData.register(robinhoodProvider)
}
```

**Fallback:** If a provider doesn't support an operation, the registry tries the next registered provider. If none support it, `MarketDataError` with code `OPERATION_NOT_SUPPORTED` is raised.

**Provider Filter:** Consumers can request a specific provider:

```ts
const quote = await marketData.getQuote('TSLA', 'robinhood') // Use Robinhood only
```

## Error Handling

All operations throw `MarketDataError` on failure:

```ts
export class MarketDataError extends Error {
  constructor(message: string, code: string, statusCode?: number)
}
```

**Common error codes:**

- `PROVIDER_NOT_FOUND` — No provider registered
- `OPERATION_NOT_SUPPORTED` — Provider doesn't support the operation
- `PROVIDER_EXHAUSTED` — All providers failed
- `NETWORK_ERROR` — Network request failed
- `AUTH_ERROR` — Authentication/authorization failed
- `SYMBOL_NOT_FOUND` — Symbol/instrument not found

## Subscription Lifecycle

Subscriptions are created on-demand by consumers and disposed independently:

```ts
const sub = await marketData.subscribe('SPY', quote => {
  // Invoked on each quote update (typically 100ms-1s)
  console.log(quote.price)
})

// When done:
sub.dispose() // Idempotent; safe to call multiple times
```

**Backpressure:** If the callback is async, the provider awaits each invocation (queues new updates if callback is slow).

## Real-Time Usage Pattern

For trading strategies that need continuous updates:

```ts
// Subscribe once during setup
let currentQuote: Quote | null = null
const sub = await marketData.subscribe('SPX', quote => {
  currentQuote = quote
})

// In the trading loop, read the latest quote
while (trading) {
  if (currentQuote && shouldTrade(currentQuote)) {
    // Place trade
  }
  await sleep(100)
}

// Cleanup
sub.dispose()
```

## Multi-Provider Strategies

Providers can be registered in priority order:

```ts
// Register Robinhood first (preferred), then polymarket as fallback
ctx.marketData.register(robinhoodProvider)
ctx.marketData.register(polymarketProvider)

// Automatically uses Robinhood if available, falls back to Polymarket
const quote = await marketData.getQuote('SPY')
```

**Different operations from different providers:**

```ts
// Robinhood provides live quotes and bars
const quote = await marketData.getQuote('SPY') // Uses Robinhood
const bars = await marketData.getBars('SPY', '1h', 24) // Uses Robinhood

// Browser scraper provides sentiment
const sentiment = await marketData.getSentiment(['SPY']) // Uses browser provider
```

## Model Experience

**Latency:**

- `getQuote()` — 50-500ms (depends on provider network)
- `getBars()` — 100-2000ms (data size; API round-trip)
- `getSentiment()` — 1-10s (browser scraping; runs concurrently)

**Token overhead:** Minimal; market data is passed to trading tools, not directly in prompts.

## Known Limitations and Deferred Work

- **Subscription broadcast**: Current implementation broadcasts quotes to all subscribers per symbol; future versions may optimize with eager subscription grouping (single websocket per symbol across all providers).
- **Provider metrics**: No latency or error rate tracking per provider; fallback is deterministic (first-come-first-served). Future: load-based selection or health checks.
- **Sentiment aggregation**: Browser scraper runs synchronously per symbol; future versions may parallelize or cache results.
- **Historical depth**: Provider-dependent; Robinhood limited to ~5 years; Polymarket limited to market inception.
