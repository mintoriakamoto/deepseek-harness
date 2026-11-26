---
description: "OKX REST API adapter for real-time crypto quotes, order book depth, and historical bars"
---

# @deepseek-ai/dsh-market-data-okx

OKX market data provider: implements quotes, order book depth, historical bars, and real-time subscriptions via the OKX REST API.

## Overview

This is a **Service Provider** that registers with the market data registry. It bridges OKX REST API endpoints to the unified market data interface.

**Implements:**
- `getQuote()` — Real-time crypto quotes with bid/ask/volume
- `getOrderBook()` — Aggregated bid/ask order book at configurable depth
- `getBars()` — Historical OHLCV bars (1m, 5m, 15m, 1h, 1d)
- `subscribe()` — Real-time quote polling (configurable interval)

**Does not implement:**
- `getSentiment()` — Use `dsh-market-data-browser` for sentiment

## Installation

```ts
import { Context } from '@deepseek-ai/cordis'
import { apply as applyOKXMarketData } from '@deepseek-ai/dsh-market-data-okx'

export function apply(ctx: Context) {
  applyOKXMarketData(ctx, {
    baseUrl: 'https://www.okx.com/api/v5',
    subscriptionPollingIntervalMs: 1000,
    timeoutMs: 10000,
    debug: false,
  })
}
```

Or via `cordis.yml`:

```yaml
presets:
  - name: 'trading-paper-okx'
    plugins:
      - '@deepseek-ai/dsh-market-data-okx'
```

## Configuration

```ts
interface OKXMarketDataConfig {
  /** Base URL for OKX API (default: "https://www.okx.com/api/v5"). */
  baseUrl?: string
  /** Polling interval for subscriptions, milliseconds (default: 1000). */
  subscriptionPollingIntervalMs?: number
  /** Request timeout, milliseconds (default: 10000). */
  timeoutMs?: number
  /** Enable debug logging. */
  debug?: boolean
}
```

**Default:** 1000ms polling for subscriptions, 10s request timeout.

## Usage

```ts
import { Context } from '@deepseek-ai/cordis'

export function apply(ctx: Context) {
  ctx.inject(['marketData'], async (ctx, marketData) => {
    // Crypto quote
    const btcQuote = await marketData.getQuote('BTC-USDT', 'okx')
    console.log(`BTC: $${btcQuote.price}`)

    // Order book
    const book = await marketData.getOrderBook('BTC-USDT', 'okx', 10)
    console.log(`Best bid: $${book.bids[0][0]}, size: ${book.bids[0][1]}`)
    console.log(`Best ask: $${book.asks[0][0]}, size: ${book.asks[0][1]}`)

    // Historical bars (1 hour, 24 bars)
    const bars = await marketData.getBars('BTC-USDT', '1h', 24, 'okx')
    console.log(`24-hour high: $${Math.max(...bars.map(b => b.high))}`)

    // Subscribe to real-time updates
    const sub = await marketData.subscribe('ETH-USDT', quote => {
      console.log(`ETH update: $${quote.price}`)
    }, 'okx')

    // Cleanup
    setTimeout(() => sub.dispose(), 60_000)
  })
}
```

## Quote Format

**Crypto quotes** return current market data:

```ts
{
  symbol: 'BTC-USDT',
  price: 45250.5,
  bid: 45250.0,
  ask: 45251.0,
  timestamp: 1701000000000,
  volume: 125000.5,
  changePercent: 2.3
}
```

## Order Book Format

**Order books** return aggregated bids and asks:

```ts
{
  bids: [
    [45250.0, 1.5],  // [price, quantity]
    [45249.5, 2.0],
    [45249.0, 3.5],
  ],
  asks: [
    [45251.0, 2.0],
    [45251.5, 1.8],
    [45252.0, 2.2],
  ]
}
```

Depth can be 1-400 bids/asks per side.

## Historical Bars Format

**Bars** return OHLCV data at specified interval:

```ts
[
  {
    timestamp: 1701000000000,
    open: 45200,
    high: 45300,
    low: 45150,
    close: 45250,
    volume: 125000.5
  },
  ...
]
```

**Supported intervals:** 1m, 5m, 15m, 1h, 1d

## Subscription Behavior

Subscriptions use polling (not websockets) to fetch quotes at the configured interval:

```ts
// Callback invoked every 1000ms (default)
const sub = await marketData.subscribe('BTC-USDT', quote => {
  console.log(`BTC: $${quote.price}`)
})

// Dispose when done
sub.dispose()
```

**Backpressure:** If the callback is async or slow, polling waits for it to complete before fetching the next quote.

**Price change detection:** Callback is only invoked when price changes (or on first poll).

## Multi-Provider Setup

OKX is ideal for crypto trading (most liquid). Set it up first, then add alternatives:

```ts
// In cordis.yml or plugin registration order:
// 1. OKX (crypto quotes, bars, order books)
// 2. Polymarket (prediction market fallback)
// 3. Browser scraper (sentiment)

ctx.marketData.register(okxProvider)
ctx.marketData.register(polymarketProvider)
ctx.marketData.register(browserProvider)
```

## Real-Time Trading Loop

```ts
let currentPrice: number | null = null
let orderBook: { bids: Array<[number, number]>; asks: Array<[number, number]> } | null = null

const sub = await marketData.subscribe('BTC-USDT', quote => {
  currentPrice = quote.price
}, 'okx')

while (trading) {
  // Update order book every 5 seconds
  orderBook = await marketData.getOrderBook('BTC-USDT', 'okx', 20)

  if (currentPrice && currentPrice > 45000) {
    // Calculate slippage from order book
    const spread = orderBook.asks[0][0] - orderBook.bids[0][0]
    console.log(`Spread: $${spread} (${(spread / currentPrice * 100).toFixed(3)}bps)`)
    // Place trade
  }
  await sleep(5000)
}

sub.dispose()
```

## Slippage Estimation

Use order book depth to estimate execution slippage:

```ts
async function estimateSlippage(
  symbol: string,
  quantity: number,
  side: 'buy' | 'sell',
): Promise<number> {
  const book = await marketData.getOrderBook(symbol, 'okx', 100)
  const levels = side === 'buy' ? book.asks : book.bids
  let filled = 0
  let totalCost = 0

  for (const [price, size] of levels) {
    const fillQty = Math.min(quantity - filled, size)
    totalCost += fillQty * price
    filled += fillQty
    if (filled >= quantity) break
  }

  const avgPrice = totalCost / quantity
  const quote = await marketData.getQuote(symbol, 'okx')
  const slippageBps = (Math.abs(avgPrice - quote.price) / quote.price) * 10000
  return slippageBps
}
```

## Error Handling

Errors are thrown as `MarketDataError`:

```ts
import { MarketDataError } from '@deepseek-ai/dsh-market-data'

try {
  const quote = await marketData.getQuote('INVALID', 'okx')
} catch (err) {
  if (err instanceof MarketDataError) {
    console.error(`${err.code}: ${err.message}`)
  }
}
```

**Common OKX errors:**

- `NETWORK_ERROR` — OKX API unavailable or timeout
- `SYMBOL_NOT_FOUND` — Symbol not found in OKX (e.g., invalid trading pair)
- `PROVIDER_EXHAUSTED` — All providers failed

## Known Limitations and Deferred Work

- **Polling-based subscriptions:** Currently polls for quotes at fixed intervals (1s default). Future versions may integrate OKX websocket subscriptions for sub-100ms latency.
- **Polling rate limits:** OKX has rate limits on public endpoints (~30 requests/second). Heavy polling may exceed limits; use longer intervals or batch requests.
- **Historical depth:** OKX public API returns up to 100 candles per request. Multi-request pagination for >100 bars is not yet implemented.
- **Sentiment not supported:** OKX provides no sentiment data; use `dsh-market-data-browser` for social signals.
- **Execution not covered:** This provider supplies quotes and order books only; see `dsh-execution-*` packages for actual trade placement.
