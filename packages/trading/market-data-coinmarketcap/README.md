# @deepseek-ai/dsh-market-data-coinmarketcap

CoinMarketCap on-chain provider: whale wallet distribution, exchange inflows, and sentiment derivation.

## Overview

This provider implements the `MarketDataProvider` interface to supply on-chain sentiment signals derived from whale wallet behavior and exchange inflows. It is designed to integrate with the market data service and feed on-chain signals into the trading system.

## Signals

### Whale Wallet Concentration

Tracks the percentage of token supply held by the top 10 addresses. High concentration (>50%) indicates centralization risk and is scored as bearish.

### Exchange Inflow

Measures tokens flowing into major exchange wallets over 24 hours. High inflow (>0.5 normalized) suggests potential whale distribution and is scored as bearish.

### Whale Activity

Counts large transactions (whale moves) in the 24-hour window. High activity (>10 txs) indicates possible market movement and is scored as bearish.

## Sentiment Formula

Sentiment is derived by aggregating on-chain signals:

```
score = 0 (neutral baseline)
score -= 0.5 * (whale_concentration / 100)        // Up to -0.5 for concentration
score -= 0.3 * exchange_inflow_score              // Up to -0.3 for inflow
score -= 0.2 * min(whale_activity_count / 50, 1) // Up to -0.2 for activity
score = clamp(score, -1, 1)
```

Result is normalized to [-1, 1]:
- **-1.0**: Extreme bearish (high concentration + high inflow + high activity)
- **-0.3 to -0.7**: Bearish (one or more signals triggered)
- **0**: Neutral (no signals)
- **0 to 1**: Bullish (potential whale support, low concentration, low inflow)

## Usage

### Registration

Register the provider with the market data service:

```ts
ctx.plugin(CoinMarketCapOnChainPlugin, {
  debug: false,
  cacheTtlMs: 60_000,
  whaleThresholdPercent: 50,
  exchangeInflowThreshold: 0.5,
})
```

### Getting Sentiment

```ts
const sentiments = await marketData.getSentiment(['BTC', 'ETH'])
// Returns: [
//   {
//     symbol: 'BTC',
//     score: -0.4,
//     sampleCount: 3,
//     timestamp: 1234567890,
//     sourceScores: {
//       'whale-concentration': -0.3,
//       'exchange-inflow': -0.1,
//       'whale-activity': 0
//     }
//   },
//   ...
// ]
```

### Direct Metrics Access

```ts
const metrics = await provider.getOnChainMetrics('BTC')
// Returns: {
//   symbol: 'BTC',
//   whaleConcentration: 65,
//   exchangeInflowScore: 0.3,
//   whaleActivityCount: 15,
//   timestamp: 1234567890
// }
```

## Configuration

- **`debug`**: Enable debug logging (default: `false`)
- **`cacheTtlMs`**: Metrics cache TTL in milliseconds (default: `60_000`)
- **`whaleThresholdPercent`**: Whale concentration threshold above which to trigger bearish signal (default: `50`)
- **`exchangeInflowThreshold`**: Exchange inflow threshold (normalized to [-1, 1]) above which to trigger bearish signal (default: `0.5`)

## Caching

The provider caches on-chain metrics per symbol for the configured TTL. Cache is in-memory and not shared across provider instances. Call `clearCache()` to manually clear the cache.

## Testing

8 test cases cover:

1. **Metrics fetch**: Verify metrics are retrieved with valid ranges
2. **Sentiment derivation**: Confirm sentiment scores normalize to [-1, 1]
3. **Exchange inflow detection**: Validate bearish scoring on high inflow
4. **Whale concentration impact**: Confirm concentration-driven sentiment
5. **API error handling**: Graceful handling of errors
6. **Concurrent requests**: Handle multiple simultaneous calls
7. **Cache behavior**: Verify caching and TTL expiry
8. **Normalization**: Confirm all scores are within [-1, 1]

Run tests with:

```sh
pnpm run test
```

## Known Limitations and Deferred Work

- **Mock data generation**: Currently generates deterministic mock metrics based on symbol hash. Production implementation requires integration with CoinMarketCap API or on-chain data provider (e.g., blockchain RPC).
- **Sentiment threshold tuning**: Thresholds are conservative defaults; production deployment should calibrate based on backtesting.
- **Exchange detection**: Current implementation assumes all inflows are bearish; refinement needed to distinguish accumulation by long-term holders.
- **Multi-blockchain support**: Currently assumes EVM; extension to Bitcoin, Solana, etc., requires wallet address normalization.
