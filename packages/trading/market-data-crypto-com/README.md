---
description: "Crypto.com authless provider: real-time crypto quotes, order book, and candlestick bars"
---

# @deepseek-ai/dsh-market-data-crypto-com

Crypto.com market data provider: implements quotes (cryptographic assets), historical bars, and order book depth via the public Crypto.com REST API (no authentication required).

## Overview

This is a **Service Provider** that registers with the market data registry. It bridges Crypto.com public API endpoints (get_tickers, get_book, get_candlestick) to the unified market data interface.

**Implements:**
- `getQuote()` — Real-time crypto quotes with bid/ask and volume
- `getBars()` — Historical OHLCV bars (1m, 5m, 15m, 1h, 1d)
- `getOrderBook()` — Order book depth (public helper method)

**Does not implement:**
- `subscribe()` — Crypto.com provider is REST-only (no websocket support)
- `getSentiment()` — Use `dsh-market-data-browser` for sentiment

## Installation

```ts
import { Context } from '@deepseek-ai/cordis'
import { apply as applyCryptocomMarketData } from '@deepseek-ai/dsh-market-data-crypto-com'

export function apply(ctx: Context) {
  applyCryptocomMarketData(ctx, {
    baseUrl: 'https://api.crypto.com/exchange/v1',
    timeoutMs: 10_000,
    cacheTtlMs: 1000,
    debug: false,
  })
}
```

Or via `cordis.yml`:

```yaml
presets:
  - name: 'trading-crypto'
    plugins:
      - '@deepseek-ai/dsh-market-data-crypto-com'
```

## Configuration

```ts
interface CryptocomMarketDataConfig {
  /** Crypto.com API base URL (default: https://api.crypto.com/exchange/v1). */
  baseUrl?: string
  /** Request timeout in milliseconds (default: 10000). */
  timeoutMs?: number
  /** Enable debug logging. */
  debug?: boolean
  /** Cache TTL in milliseconds (default: 1000). */
  cacheTtlMs?: number
}
```

**Default:** 1000ms cache for quotes (reduces redundant API calls within 1 second).

## Usage

```ts
import { Context } from '@deepseek-ai/cordis'

export function apply(ctx: Context) {
  ctx.inject(['marketData'], async (ctx, marketData) => {
    // Crypto quote
    const btcQuote = await marketData.getQuote('BTC_USD', 'crypto-com')
    console.log(`BTC: $${btcQuote.price}`)

    // Multiple cryptos
    const ethQuote = await marketData.getQuote('ETH_USD', 'crypto-com')
    console.log(`ETH: $${ethQuote.price}`)

    // Historical bars
    const bars = await marketData.getBars('BTC_USD', '1h', 24, 'crypto-com')
    console.log(`24-hour high: $${Math.max(...bars.map(b => b.high))}`)

    // Order book depth
    const provider = ctx.marketData.getProvider('crypto-com') as CryptocomMarketDataProvider
    const book = await provider.getOrderBook('BTC_USD')
    console.log(`Best bid: $${book.bids[0]?.price}`)
  })
}
```

## Quote Format

**Crypto quotes** return current price with bid/ask spread:

```ts
{
  symbol: 'BTC_USD',
  price: 42_050,
  bid: 42_000,
  ask: 42_100,
  timestamp: 1234567890000,
  volume: 1_500_000,
  changePercent: 0
}
```

## Bar Intervals

Supported candlestick intervals:

- `1m` — 1 minute
- `5m` — 5 minutes
- `15m` — 15 minutes
- `1h` — 1 hour
- `1d` — 1 day

## Order Book Format

```ts
interface OrderBook {
  symbol: string
  bids: Array<{ price: number; size: number }> // descending price
  asks: Array<{ price: number; size: number }> // ascending price
  timestamp: number
}
```

Example:

```ts
{
  symbol: 'BTC_USD',
  bids: [
    { price: 42_000, size: 1 },
    { price: 41_950, size: 2 },
    { price: 41_900, size: 3 }
  ],
  asks: [
    { price: 42_100, size: 1 },
    { price: 42_150, size: 2 },
    { price: 42_200, size: 3 }
  ],
  timestamp: 1234567890000
}
```

## Supported Symbols

Crypto.com uses underscore-separated pairs:

- **Majors:** BTC_USD, ETH_USD, BNB_USD, XRP_USD, SOL_USD
- **Stablecoins:** USDT_USD, USDC_USD, BUSD_USD
- **Alt pairs:** Most symbols with suffix _USD or _USDT

Full symbol list available via Crypto.com API documentation.

## Caching Behavior

Quotes are cached for `cacheTtlMs` (default: 1000ms) to reduce API load:

```ts
// First call: fetches from API
const quote1 = await marketData.getQuote('BTC_USD')

// Second call within 1 second: returns cached
const quote2 = await marketData.getQuote('BTC_USD')

// After 1 second: fetches fresh
await sleep(1_100)
const quote3 = await marketData.getQuote('BTC_USD')
```

Bars and order book are **not cached** (always fresh from API).

## Multi-Provider Setup

Crypto.com is typically the preferred provider for major crypto assets (liquidity). Set it up first:

```ts
// In cordis.yml or plugin registration order:
// 1. Crypto.com (quotes, bars, order book)
// 2. Robinhood (equity/options fallback)
// 3. Browser scraper (sentiment)

ctx.marketData.register(cryptocomProvider)
ctx.marketData.register(robinhoodProvider)
ctx.marketData.register(browserProvider)
```

## Error Handling

Errors are thrown as `MarketDataError`:

```ts
import { MarketDataError } from '@deepseek-ai/dsh-market-data'

try {
  const quote = await marketData.getQuote('INVALID_PAIR', 'crypto-com')
} catch (err) {
  if (err instanceof MarketDataError) {
    console.error(`${err.code}: ${err.message}`)
  }
}
```

**Common Crypto.com errors:**

- `NETWORK_ERROR` — API unavailable or timeout
- `OPERATION_NOT_SUPPORTED` — Feature not available (e.g., subscriptions)

## Real-Time Trading Loop

```ts
const btcQuote = await marketData.getQuote('BTC_USD', 'crypto-com')

if (btcQuote.price > 42_000) {
  // Execute trade based on price signal
  console.log(`BTC above 42k: ${btcQuote.price}`)
}

// Get order book for slippage estimation
const book = await provider.getOrderBook('BTC_USD')
const totalBidLiquidity = book.bids.reduce((sum, level) => sum + level.size, 0)
console.log(`Available liquidity: ${totalBidLiquidity} BTC`)
```

## REST-Only Architecture

Crypto.com provider uses REST API polling (not websockets):

- **Latency:** 100-500ms (network dependent)
- **Rate limit:** Default 10 requests/second (check Crypto.com API docs)
- **No subscriptions:** Use dsh-market-data-robinhood for real-time streaming

For websocket-based real-time updates, deploy a separate websocket provider or bridge.

## Known Limitations and Deferred Work

- **REST-only:** No websocket subscriptions; polling unavailable. Future versions may add optional websocket bridge.
- **No sentiment data:** Crypto.com provides no social sentiment; consumers should use `dsh-market-data-browser` or Polymarket.
- **Limited historical depth:** Candlestick history varies by symbol (typically 1-2 years for majors).
- **No options support:** Crypto.com public API provides spot markets only (no derivatives or Greeks).
- **Rate limiting:** Public API has fairness limits; high-frequency strategies should cache quotes or deploy dedicated infrastructure.
