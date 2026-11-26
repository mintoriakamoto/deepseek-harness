# @deepseek-ai/dsh-market-data-financial-datasets

Financial Datasets provider for the market data service: earnings calendar, insider transactions, and derived sentiment.

## Overview

This provider implements `MarketDataProvider` to deliver fundamental analysis signals via:

- **`getEarningsCalendar(symbol)`** — Upcoming and historical earnings dates, consensus EPS estimates, actual results, and surprise percentages.
- **`getBeneficialOwners(symbol)`** — SEC Form 4 filings: insider buy/sell transactions with volume and filing dates.
- **`getSentiment(symbols[])`** — Aggregated sentiment derived from earnings accuracy (beat rate) and insider net-buy signals.

Sentiment combines:
- **Earnings beat rate** (past 4 quarters) → positive if >50% beats
- **Insider net buys** (past 30 days) → positive if more buys than sells
- **Upcoming earnings timing** → slight downward bias due to announcement uncertainty

Score range: -1 (strong bearish) to 1 (strong bullish), 0 (neutral).

## Installation

```bash
pnpm install @deepseek-ai/dsh-market-data-financial-datasets
```

## Registration

Register the provider in your Cordis context or `cordis.yml`:

```ts
import { Context } from '@deepseek-ai/cordis'
import { FinancialDatasetsProvider } from '@deepseek-ai/dsh-market-data-financial-datasets'

export const apply = (ctx: Context) => {
  const provider = new FinancialDatasetsProvider(ctx, {
    debug: true,
    earningsCacheTtlMs: 3_600_000, // 1 hour
    insiderCacheTtlMs: 1_800_000,  // 30 minutes
  })

  // Register with market data service
  ctx.get('marketData').register(provider)
}
```

Or via `cordis.yml`:

```yaml
plugins:
  - '@deepseek-ai/dsh-market-data'
  - '@deepseek-ai/dsh-market-data-financial-datasets':
      debug: false
      earningsCacheTtlMs: 3600000
      insiderCacheTtlMs: 1800000
```

## Usage

### Get Earnings Calendar

```ts
const earnings = await marketData.getEarningsCalendar('AAPL')
// Returns:
// [
//   {
//     symbol: 'AAPL',
//     announcementDate: '2026-01-27',
//     epsEstimate: 2.15,
//     epsActual: 2.18,
//     epsSurprisePercent: 1.4,
//     ...
//   },
//   ...
// ]
```

### Get Insider Transactions

```ts
const transactions = await marketData.getBeneficialOwners('TSLA')
// Returns:
// [
//   {
//     symbol: 'TSLA',
//     owner: 'CEO',
//     transactionType: 'buy',
//     shares: 50000,
//     pricePerShare: 245.50,
//     filingDate: '2026-11-20',
//     ...
//   },
//   ...
// ]
```

### Get Sentiment from Fundamental Data

```ts
const sentiments = await marketData.getSentiment(['AAPL', 'MSFT'])
// Returns:
// [
//   {
//     symbol: 'AAPL',
//     score: 0.35,         // Bullish
//     sampleCount: 42,     // 5 earnings + 37 insider transactions
//     sourceScores: {
//       earnings: 0.5,     // 60% beat rate
//       insider: 0.2       // Net positive insider buys
//     }
//   },
//   ...
// ]
```

## Configuration

### `debug?: boolean`

Enable debug logging to console (default: false).

### `earningsCacheTtlMs?: number`

Cache TTL for earnings calendar data in milliseconds (default: 3,600,000 = 1 hour).

### `insiderCacheTtlMs?: number`

Cache TTL for insider transaction data in milliseconds (default: 1,800,000 = 30 minutes).

## Model Experience

This provider reduces model context by pre-computing sentiment from fundamental data:

- **Earnings accuracy metric** (beat rate) reduces need to fetch and analyze historical surprises
- **Insider transaction summary** (net buys/sells) replaces full transaction log parsing
- **Derived sentiment score** provides single normalized signal vs. requiring model to interpret raw data

**Token savings**: ~200 tokens per symbol (vs. raw earnings + insider data)

**Latency**: <100ms cached, ~500ms first fetch

**Cache invalidation**: 1 hour earnings, 30 minutes insider (configurable)

## Known Limitations and Deferred Work

1. **Mock data only** — Currently generates realistic mock data for development. Production implementation requires integration with Financial Datasets API, SEC Edgar, or similar data providers.

2. **No real-time updates** — Earnings and insider data are cached; real-time updates would require event-based refresh or polling infrastructure.

3. **Limited historical depth** — Earnings limited to past 4 quarters + 1 upcoming; insider transactions limited to past 30 days. Production should support longer lookback windows.

4. **No corporate actions** — Does not adjust historical data for splits, dividends, or other corporate actions.

5. **Sentiment derivation heuristic** — Current 60/40 weighting of earnings/insider sentiment is empirically chosen, not ML-tuned. Should be calibrated against actual performance.

6. **No API error recovery** — Does not implement exponential backoff, circuit breakers, or failover logic for external API calls.

## Testing

Run tests with:

```bash
pnpm run test
```

Coverage: 6 test suites covering earnings fetch, insider transactions, sentiment derivation, error handling, concurrent operations, and caching.

## See Also

- `@deepseek-ai/dsh-market-data` — Service definition and registry
- `@deepseek-ai/dsh-market-data-robinhood` — Quotes and bars from Robinhood MCP
- `@deepseek-ai/dsh-market-data-polymarket` — Prediction market sentiment
- `@deepseek-ai/dsh-market-data-browser` — Social/news sentiment via Playwright
