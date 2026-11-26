# @deepseek-ai/dsh-market-data-coindesk

CoinDesk crypto market data provider for the DeepSeek Harness trading system. Provides spot prices, historical bars (OHLCV), and implied volatility surfaces for derivatives pricing.

## Features

- **Spot Price Quotes**: Real-time crypto prices with 24h statistics
- **Historical Bars**: OHLCV data at configurable intervals (1m, 5m, 1h, 1d, etc.)
- **Volatility Surfaces**: Implied volatility smile and term structure for options pricing
- **Caching**: Built-in cache with configurable TTL for reducing API calls
- **Concurrency Support**: Handles multiple concurrent requests
- **Timeout Protection**: Configurable request timeouts
- **Symbol Normalization**: Automatic uppercase conversion for crypto symbols

## Installation

```bash
pnpm add @deepseek-ai/dsh-market-data-coindesk
```

## Usage

### Basic Quote Fetching

```typescript
import { CoinDeskProvider } from '@deepseek-ai/dsh-market-data-coindesk';

const provider = new CoinDeskProvider();

// Get spot price for Bitcoin
const btcQuote = await provider.getQuote('BTC');
console.log(`BTC Price: $${btcQuote.price}`);
console.log(`24h Change: ${btcQuote.change24h}%`);
```

### Historical Bars

```typescript
// Get 100 daily bars for Ethereum
const bars = await provider.getBars('ETH', '1d', 100);

// Get hourly bars with custom limit
const hourlyBars = await provider.getBars('SOL', '1h', 50);

for (const bar of bars) {
  console.log(`${bar.timestamp}: O=${bar.open} H=${bar.high} L=${bar.low} C=${bar.close} V=${bar.volume}`);
}
```

### Implied Volatility Surface

```typescript
// Get IV surface for options pricing
const surface = await provider.getVolatilitySurface('BTC', 42000);

console.log(`Symbol: ${surface.symbol}`);
console.log(`Spot Price: ${surface.spotPrice}`);
console.log(`Generated: ${surface.timestamp}`);

// IV smile: grouped by time to expiration
const byDTE = new Map<number, typeof surface.points>();
for (const point of surface.points) {
  if (!byDTE.has(point.daysToExpiration)) {
    byDTE.set(point.daysToExpiration, []);
  }
  byDTE.get(point.daysToExpiration)!.push(point);
}

// Use IV points for derivatives pricing
for (const [dte, points] of byDTE) {
  console.log(`\nDTE=${dte}:`);
  for (const point of points) {
    console.log(`  Strike=${point.strike}% IV=${(point.impliedVol * 100).toFixed(2)}%`);
  }
}
```

### Configuration

```typescript
const provider = new CoinDeskProvider({
  baseUrl: 'https://api.coindesk.com/v1',
  timeoutMs: 5000,
  enableCache: true,
  cacheTtlSeconds: 60,
});
```

#### Configuration Options

- `baseUrl` (string): CoinDesk API base URL
- `timeoutMs` (number): Request timeout in milliseconds (default: 5000)
- `enableCache` (boolean): Enable response caching (default: true)
- `cacheTtlSeconds` (number): Cache time-to-live in seconds (default: 60)

### Caching

```typescript
// Cache is enabled by default
const provider = new CoinDeskProvider();

// Get quote (cached)
const quote1 = await provider.getQuote('BTC');
const quote2 = await provider.getQuote('BTC');

// Same object returned from cache
console.log(quote1 === quote2); // true

// Check cache statistics
const stats = provider.getCacheStats();
console.log(`Cache size: ${stats.size}`);
console.log(`Cached entries: ${stats.entries}`);

// Clear cache
provider.clearCache();
```

### Concurrent Requests

```typescript
// Fetch multiple assets concurrently
const [btc, eth, sol] = await Promise.all([
  provider.getQuote('BTC'),
  provider.getQuote('ETH'),
  provider.getQuote('SOL'),
]);

// Or mix different data types
const results = await Promise.all([
  provider.getQuote('BTC'),
  provider.getBars('ETH', '1d', 50),
  provider.getVolatilitySurface('SOL', 150),
]);
```

## Types

### Quote

Spot price quote with 24h statistics:

```typescript
interface Quote {
  symbol: string;           // e.g., "BTC"
  price: number;            // Current price in USD
  timestamp: string;        // ISO 8601 timestamp
  change24h: number;        // Percentage change
  high24h: number;          // 24h high price
  low24h: number;           // 24h low price
  volume24h: number;        // 24h volume in USD
}
```

### Bar

OHLCV bar data:

```typescript
interface Bar {
  timestamp: string;        // ISO 8601 timestamp
  open: number;             // Opening price
  high: number;             // Highest price
  low: number;              // Lowest price
  close: number;            // Closing price
  volume: number;           // Trading volume
}
```

### VolatilitySurface

IV surface for derivatives pricing:

```typescript
interface VolatilitySurface {
  symbol: string;           // Asset symbol
  spotPrice: number;        // Spot price at generation
  timestamp: string;        // Surface timestamp
  points: IVPoint[];        // Surface points
  minStrike: number;        // Min strike (% of spot)
  maxStrike: number;        // Max strike (% of spot)
  minDTE: number;           // Min days to expiration
  maxDTE: number;           // Max days to expiration
}

interface IVPoint {
  strike: number;           // Strike (% of spot)
  daysToExpiration: number; // Time to expiration (days)
  impliedVol: number;       // IV (decimal, 0.25 = 25%)
  midPrice?: number;        // Optional mid price
}
```

## Model Experience

### Request Processing

- Requests are processed asynchronously with configurable timeouts
- Multiple concurrent requests are handled efficiently
- Responses are cached with configurable TTL

### Output Format

- Prices and volatilities are numeric decimals
- Timestamps are ISO 8601 strings
- Volatility is represented as decimals (0.25 = 25%)
- Strikes in IV surface are percentage of spot (100 = ATM)

### Token Usage

- Each `getQuote()` call: ~100 tokens for model context
- Each `getBars()` call with N bars: ~50 + 10*N tokens
- Each `getVolatilitySurface()` call: ~200 tokens for model context

## Known Limitations and Deferred Work

- Currently generates synthetic data for development. Real CoinDesk API integration is deferred.
- Real-time updates require polling; WebSocket support is not yet implemented.
- Options chain construction from IV surface is a consumer responsibility.
- Spot price normalization follows standard symbol conventions; exotic symbols may need custom mapping.

## Testing

```bash
# Run all tests
pnpm run test

# Run with coverage
pnpm run test:coverage

# Run specific test file
pnpm run test -- packages/trading/market-data-coindesk
```

## License

MIT
