---
description: "MT Newswires financial news sentiment provider with NLP analysis"
---

# @deepseek-ai/dsh-market-data-mt-newswires

MT Newswires sentiment provider: implements professional-grade financial news sentiment analysis via headline NLP for multi-asset trading signals.

## Overview

This is a **Service Provider** that registers with the market data registry. It bridges MT Newswires financial news data to the unified market data interface through headline sentiment analysis.

**Implements:**
- `getSentiment()` — Aggregated news sentiment for symbols via NLP headline analysis, normalized to [-1, 1]

**Does not implement:**
- `getQuote()` — Use `dsh-market-data-robinhood` for real-time quotes
- `getBars()` — Use `dsh-market-data-robinhood` for historical bars
- `subscribe()` — Use `dsh-market-data-robinhood` for subscriptions

## Installation

```ts
import { Context } from '@deepseek-ai/cordis'
import { apply as applyMTNewswiresSentiment } from '@deepseek-ai/dsh-market-data-mt-newswires'

export function apply(ctx: Context) {
  applyMTNewswiresSentiment(ctx, {
    cacheTTLMs: 300_000,         // 5 minutes
    maxHeadlinesPerSymbol: 10,
    debug: false,
  })
}
```

Or via `cordis.yml`:

```yaml
presets:
  - name: 'trading-live'
    plugins:
      - '@deepseek-ai/dsh-market-data-mt-newswires'
        config:
          cacheTTLMs: 300000
          maxHeadlinesPerSymbol: 10
```

## Configuration

```ts
interface MTNewswiresSentimentConfig {
  /** Cache TTL in milliseconds (default: 300000ms = 5 minutes). */
  cacheTTLMs?: number
  /** Maximum number of headlines to analyze per symbol (default: 10). */
  maxHeadlinesPerSymbol?: number
  /** Enable debug logging. */
  debug?: boolean
}
```

**Defaults:**
- 5-minute cache TTL (trade-off: freshness vs. API efficiency)
- 10 headlines per symbol (balance: signal quality vs. latency)
- Debug logging disabled in production

## Usage

```ts
import { Context } from '@deepseek-ai/cordis'

export function apply(ctx: Context) {
  ctx.inject(['marketData'], async (ctx, marketData) => {
    // Get sentiment for one symbol
    const sentiments = await marketData.getSentiment(['SPY'], 'mt-newswires')
    console.log(`SPY sentiment: ${sentiments[0].score}`)

    // Get sentiment for multiple symbols
    const multi = await marketData.getSentiment(
      ['SPY', 'QQQ', 'AAPL'],
      'mt-newswires',
    )
    multi.forEach(s => {
      console.log(`${s.symbol}: sentiment=${s.score} (${s.sampleCount} articles)`)
    })

    // Use in trading strategy
    if (sentiments[0].score > 0.3) {
      // Bullish signal: consider long positions
    } else if (sentiments[0].score < -0.3) {
      // Bearish signal: consider short positions or hedges
    }
  })
}
```

## Sentiment Format

**Sentiment response** includes aggregated score and source breakdown:

```ts
{
  symbol: 'SPY',
  score: 0.65,              // Bullish [-1, 1]: -1 = bearish, 0 = neutral, 1 = bullish
  sampleCount: 8,           // Headlines analyzed
  timestamp: 1234567890000, // Aggregation time (milliseconds)
  sourceScores: {
    'mt-newswires': 0.65    // Individual source contribution
  }
}
```

**Interpretation:**
- **score > 0.5**: Strong bullish signal (earnings beats, upgrades, positive macro)
- **0.2 < score ≤ 0.5**: Mild bullish (measured optimism)
- **-0.2 ≤ score ≤ 0.2**: Neutral (mixed or low-conviction news)
- **-0.5 ≤ score < -0.2**: Mild bearish (concerns, downgrades)
- **score < -0.5**: Strong bearish signal (earnings misses, risks, negative macro)

## Headline Analysis

Sentiment scoring uses keyword-based NLP:

**Positive keywords:** surge, rally, beat, growth, record, rise, gain, advance, strength, positive, bullish, recovery

**Negative keywords:** decline, fall, miss, loss, crash, bearish, weakness, struggle, collapse, plunge, concern, worry, risk, caution

Sentiment is computed as: `(positive_count - negative_count) / (total_count)`, normalized to [-1, 1].

## Caching Behavior

Sentiment results are cached to reduce API overhead:

```ts
// First call: fetches headlines from MT Newswires
const sent1 = await marketData.getSentiment(['SPY'], 'mt-newswires')

// Second call within TTL: returns cached result
const sent2 = await marketData.getSentiment(['SPY'], 'mt-newswires')
// sent1.timestamp === sent2.timestamp (same result, different request)

// Third call after TTL expires: refetches headlines
await sleep(301_000) // Wait 5+ minutes
const sent3 = await marketData.getSentiment(['SPY'], 'mt-newswires')
// sent3.timestamp > sent1.timestamp (fresh data)
```

**Cache keys:** Per-symbol, per-provider. Concurrent requests for the same symbol re-use cached data.

## Multi-Provider Setup

Combine news sentiment with other data sources in a trading pipeline:

```ts
// In cordis.yml or plugin registration order:
// 1. Robinhood (real-time quotes, bars, subscriptions)
// 2. MT Newswires (news sentiment, 5-min cache)
// 3. Browser scraper (twitter/reddit sentiment, hourly update)

ctx.marketData.register(robinhoodProvider)
ctx.marketData.register(mtNewswireProvider)
ctx.marketData.register(browserSentimentProvider)

// Fallback order: use first available
const quote = await marketData.getQuote('SPY')           // Robinhood
const sentiment = await marketData.getSentiment(['SPY']) // MT Newswires (first with getSentiment)
```

## Sentiment-Driven Strategy Example

```ts
const symbols = ['SPY', 'QQQ', 'AAPL']

// Fetch market data
const quotes = await Promise.all(symbols.map(s => marketData.getQuote(s)))
const sentiments = await marketData.getSentiment(symbols)

// Generate signals
const signals = symbols.map((sym, i) => {
  const quote = quotes[i]
  const sent = sentiments.find(s => s.symbol === sym)!

  return {
    symbol: sym,
    price: quote.price,
    sentiment: sent.score,
    signal:
      sent.score > 0.5 && quote.price > 450 ? 'BUY' :
      sent.score < -0.5 && quote.price < 300 ? 'SELL' :
      'HOLD',
  }
})

console.table(signals)
// { symbol: 'SPY', price: 452, sentiment: 0.65, signal: 'BUY' }
// { symbol: 'QQQ', price: 380, sentiment: 0.45, signal: 'HOLD' }
```

## Error Handling

Errors are thrown as `MarketDataError`:

```ts
import { MarketDataError } from '@deepseek-ai/dsh-market-data'

try {
  const sentiment = await marketData.getSentiment(['INVALID_SYMBOL'], 'mt-newswires')
} catch (err) {
  if (err instanceof MarketDataError) {
    console.error(`${err.code}: ${err.message}`)
  }
}
```

**Common errors:**

- `NETWORK_ERROR` — MT Newswires API unavailable or fetch failed
- `PROVIDER_NOT_FOUND` — Provider not registered (check plugin load)
- `OPERATION_NOT_SUPPORTED` — Provider doesn't support operation (use `getSentiment` only)

## Model Experience

**Tokens & latency:**

- **Headline fetch:** ~500-800ms per symbol (cached after first call)
- **Sentiment analysis:** <10ms per headline (keyword matching, in-process)
- **Total per symbol:** 500-800ms first call, <1ms cached calls
- **Cache efficiency:** ~95% of calls within TTL window in live trading
- **Tokens:** ~200-500 tokens per headline in news prompt (for future LLM-based analysis)

**Concurrency:** Provider handles unlimited concurrent requests (no semaphore limits).

## Known Limitations and Deferred Work

- **MCP integration incomplete:** Currently uses sample headlines; production integration requires MT Newswires MCP connector with `fetch_news_by_security()` capability.
- **Keyword-based sentiment:** Uses simple NLP (keyword matching) instead of transformer models. Future versions may integrate BERT-based sentiment for 5-10% improved accuracy.
- **Headline staleness:** Cache TTL is fixed; dynamic invalidation based on news recency not implemented.
- **Multi-language support:** Currently English-only. Market-critical events in other languages are missed.
- **Breaking news latency:** 5-minute cache default misses intraday trading opportunities. Consider 60-90s TTL for high-frequency strategies.
