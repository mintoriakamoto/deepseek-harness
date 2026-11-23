---
description: "Robinhood MCP adapter for real-time options quotes, Greeks, and historical bars"
---

# @deepseek-ai/dsh-market-data-robinhood

Robinhood market data provider: implements quotes (equity and options), historical bars, and real-time subscriptions via the Robinhood MCP adapter.

## Overview

This is a **Service Provider** that registers with the market data registry. It bridges Robinhood MCP tools (get_equity_quotes, get_option_quotes, get_equity_historicals, get_option_historicals) to the unified market data interface.

**Implements:**
- `getQuote()` — Equity and option quotes with Greeks, IV, underlying, expiration
- `getBars()` — Historical OHLCV bars (1m, 5m, 15m, 1h, 1d)
- `subscribe()` — Real-time quote polling (configurable interval)

**Does not implement:**
- `getSentiment()` — Use `dsh-market-data-browser` for sentiment

## Installation

```ts
import { Context } from '@deepseek-ai/cordis'
import { apply as applyRobinhoodMarketData } from '@deepseek-ai/dsh-market-data-robinhood'

export function apply(ctx: Context) {
  applyRobinhoodMarketData(ctx, {
    subscriptionPollingIntervalMs: 500,
    debug: false,
  })
}
```

Or via `cordis.yml`:

```yaml
presets:
  - name: 'trading-live'
    plugins:
      - '@deepseek-ai/dsh-market-data-robinhood'
```

## Configuration

```ts
interface RobinhoodMarketDataConfig {
  /** Polling interval for subscriptions, milliseconds (default: 500). */
  subscriptionPollingIntervalMs?: number
  /** Enable debug logging. */
  debug?: boolean
}
```

**Default:** 500ms polling for subscriptions (responsive without excessive API calls).

## Usage

```ts
import { Context } from '@deepseek-ai/cordis'

export function apply(ctx: Context) {
  ctx.inject(['marketData'], async (ctx, marketData) => {
    // Equity quote
    const spyQuote = await marketData.getQuote('SPY', 'robinhood')
    console.log(`SPY: $${spyQuote.price}`)

    // Option quote with Greeks
    const optionQuote = await marketData.getQuote('SPY_20261218C450', 'robinhood')
    console.log(`SPY call delta: ${optionQuote.greeks?.delta}`)

    // Historical bars
    const bars = await marketData.getBars('SPY', '1h', 24, 'robinhood')
    console.log(`24-hour high: $${Math.max(...bars.map(b => b.high))}`)

    // Subscribe to real-time updates
    const sub = await marketData.subscribe('SPY', quote => {
      console.log(`SPY update: $${quote.price}`)
    }, 'robinhood')

    // Cleanup
    setTimeout(() => sub.dispose(), 60_000)
  })
}
```

## Quote Format

**Equity quotes** return basic OHLC data:

```ts
{
  symbol: 'SPY',
  price: 450.5,
  bid: 450.4,
  ask: 450.6,
  timestamp: 1234567890000,
  volume: 1_000_000,
  changePercent: 0.5
}
```

**Option quotes** include Greeks and IV:

```ts
{
  symbol: 'SPY_20261218C450',
  price: 2.5,
  bid: 2.45,
  ask: 2.55,
  timestamp: 1234567890000,
  volume: 50_000,
  changePercent: 1.2,
  greeks: {
    delta: 0.65,
    gamma: 0.02,
    vega: -0.15,
    theta: -0.05
  },
  impliedVolatility: 0.28,
  underlyingSymbol: 'SPY',
  expirationDate: '2026-12-18'
}
```

## Subscription Behavior

Subscriptions use polling (not websockets) to fetch quotes at the configured interval:

```ts
// Callback invoked every 500ms (default)
const sub = await marketData.subscribe('SPY', quote => {
  console.log(`SPY: $${quote.price}`)
})

// Dispose when done
sub.dispose()
```

**Backpressure:** If the callback is async or slow, polling waits for it to complete before fetching the next quote.

## Historical Data Depth

- **Equities:** ~5 years of historical data available via Robinhood
- **Options:** Limited to available contract history (typically 1-2 years)

## Multi-Provider Setup

Robinhood is typically the preferred provider for options (most liquid). Set it up first:

```ts
// In cordis.yml or plugin registration order:
// 1. Robinhood (quotes, bars, subscriptions)
// 2. Polymarket (prediction market fallback)
// 3. Browser scraper (sentiment)

ctx.marketData.register(robinhoodProvider)
ctx.marketData.register(polymarketProvider)
ctx.marketData.register(browserProvider)
```

## Real-Time Trading Loop

```ts
let currentPrice: number | null = null

const sub = await marketData.subscribe('SPY', quote => {
  currentPrice = quote.price
}, 'robinhood')

while (trading) {
  if (currentPrice && currentPrice > 450) {
    // Place trade
  }
  await sleep(100)
}

sub.dispose()
```

## Error Handling

Errors are thrown as `MarketDataError`:

```ts
import { MarketDataError } from '@deepseek-ai/dsh-market-data'

try {
  const quote = await marketData.getQuote('INVALID', 'robinhood')
} catch (err) {
  if (err instanceof MarketDataError) {
    console.error(`${err.code}: ${err.message}`)
  }
}
```

**Common Robinhood errors:**

- `NETWORK_ERROR` — Robinhood API unavailable
- `AUTH_ERROR` — Credentials invalid or expired
- `SYMBOL_NOT_FOUND` — Symbol not found in Robinhood
- `PROVIDER_EXHAUSTED` — All providers failed

## Known Limitations and Deferred Work

- **Polling-based subscriptions:** Currently polls for quotes at fixed intervals (500ms default). Future versions may integrate true websocket subscriptions for sub-100ms latency.
- **Historical depth:** Robinhood's historical depth is provider-limited (~5 years). Backtest strategies require external data sources.
- **Sentiment not supported:** Robinhood provides no sentiment data; consumers should use `dsh-market-data-browser` or Polymarket for aggregated signals.
- **Partial fills & slippage:** Live trading uses Robinhood's execution APIs (not covered here); see `dsh-execution-robinhood` for order management.
