# Alpha Vantage Market Data Provider

Fallback market data provider using the [Alpha Vantage HTTP API](https://www.alphavantage.co/documentation/). Provides real-time quotes and historical OHLCV bars with caching and rate-limit protection.

## Features

- **Real-time quotes**: Get current price, bid/ask, volume, and change percent for equities and ETFs
- **Historical bars**: Fetch OHLCV data across multiple intervals (1m, 5m, 15m, 1h, 1d, 1w, 1mo)
- **Multi-level caching**: 5-minute TTL on quotes to minimize API calls and rate-limit issues
- **Timeout protection**: 10-second default timeout per request to prevent hangs
- **Error handling**: Structured error codes for network, rate-limit, and API errors
- **Graceful degradation**: Returns typed errors; consumers can fall back to other providers

## Installation

```sh
pnpm add @deepseek-ai/dsh-market-data-alpha-vantage
```

## Configuration

Register as a Cordis plugin in `cordis.yml`:

```yaml
plugins:
  - name: '@deepseek-ai/dsh-market-data-alpha-vantage'
    config:
      apiKey: ${ALPHA_VANTAGE_API_KEY}
      quoteCacheTtlMs: 300000  # 5 minutes
      requestTimeoutMs: 10000  # 10 seconds
      debug: false
```

Or configure via environment variable:

```sh
export ALPHA_VANTAGE_API_KEY=your_api_key_here
```

## API Reference

### `AlphaVantageProvider`

Implements `MarketDataProvider` interface from `@deepseek-ai/dsh-market-data`.

#### `getQuote(symbol: string): Promise<Quote>`

Fetch a real-time quote. Checks cache first (5-minute TTL).

```typescript
const quote = await provider.getQuote('AAPL')
console.log(quote.price, quote.bid, quote.ask)
```

#### `getBars(symbol: string, interval: BarInterval, count: number): Promise<Bar[]>`

Fetch historical OHLCV bars in ascending time order (oldest first).

```typescript
const bars = await provider.getBars('AAPL', '1d', 30)
bars.forEach(bar => {
  console.log(bar.open, bar.high, bar.low, bar.close, bar.volume, bar.timestamp)
})
```

Supported intervals:
- `'1m'`, `'5m'`, `'15m'`, `'1h'` → TIME_SERIES_INTRADAY
- `'1d'` → TIME_SERIES_DAILY
- `'1w'` → TIME_SERIES_WEEKLY  (not aliased; use '1d' for best compatibility)
- `'1mo'` → TIME_SERIES_MONTHLY (not aliased; use '1d' for best compatibility)

#### `getSentiment(symbols: readonly string[]): Promise<readonly Sentiment[]>`

Not supported; throws `MarketDataError` with code `'OPERATION_NOT_SUPPORTED'`.

## Error Handling

All errors are wrapped in `MarketDataError`:

```typescript
import { MarketDataError } from '@deepseek-ai/dsh-market-data'

try {
  const quote = await marketData.getQuote('INVALID')
} catch (err) {
  if (err instanceof MarketDataError) {
    console.error(err.code)  // 'NETWORK_ERROR', 'OPERATION_NOT_SUPPORTED', etc.
    console.error(err.statusCode)  // HTTP status or 500
  }
}
```

Common error codes:
- `'NETWORK_ERROR'`: Network failure, timeout, or API error
- `'OPERATION_NOT_SUPPORTED'`: Operation (e.g., sentiment) not supported
- Rate limits appear as network errors with retry guidance in message

## Rate Limiting

Alpha Vantage free tier: 5 calls/minute. Paid: up to 500/minute.

Provider handles rate-limit errors:
- Returns `MarketDataError` with code `'NETWORK_ERROR'`
- Quote cache (5min TTL) reduces redundant calls
- Consumers should retry later or fall back to another provider

## Model Experience

No tokens consumed directly; Alpha Vantage calls happen in-band during tool execution.
Quotes and bars are deterministic external data; no synthetic variation.

## Known Limitations and Deferred Work

- **No real-time subscriptions**: Unlike Robinhood provider, this is HTTP-only; no websocket support
- **No options Greeks**: Alpha Vantage does not provide implied volatility or option Greeks
- **No sentiment data**: Social/news sentiment not available; use browser provider for that
- **Limited intraday granularity**: Free tier capped at 100 bars per call; use `count: 100` and paginate if needed
- **No crypto support**: Alpha Vantage equity/forex focus; use Polymarket or other providers for crypto

## Testing

```sh
cd packages/trading/market-data-alpha-vantage
pnpm test
```

8 test cases cover:
1. Quote fetch success
2. Bar fetch with interval mapping
3. API timeout handling
4. Rate limit handling
5. Invalid symbol handling
6. Cache hit verification
7. Concurrent requests
8. Fallback graceful when API down

## See Also

- [Market data service](../market-data/README.md)
- [Robinhood provider](../market-data-robinhood/README.md) (primary)
- [Polymarket provider](../market-data-polymarket/README.md) (prediction markets)
- [Browser provider](../market-data-browser/README.md) (sentiment)
