---
description: "Browser-based sentiment scraper: news, social, and analyst data for trading signals"
---

# @deepseek-ai/dsh-market-data-browser

Browser-based sentiment provider: scrapes news headlines, social sentiment, and analyst ratings to generate trading signals.

## Overview

This is a **Service Provider** that registers with the market data registry. It bridges web-scraped sentiment data (via Playwright) to the market data interface.

**Implements:**
- `getSentiment()` — Aggregated sentiment from news, Twitter, and analyst platforms

**Does NOT implement:**
- `getQuote()` — Use Robinhood for real-time prices
- `getBars()` — Use Robinhood for historical OHLCV
- `subscribe()` — Use Robinhood for real-time subscriptions

## Installation

```ts
import { Context } from '@deepseek-ai/cordis'
import { apply as applyBrowserSentiment } from '@deepseek-ai/dsh-market-data-browser'

export function apply(ctx: Context) {
  applyBrowserSentiment(ctx, {
    timeoutMs: 30_000,
    maxConcurrency: 3,
    debug: false,
    sources: {
      news: { enabled: true, weight: 1.0 },
      twitter: { enabled: true, weight: 0.8 },
      analystRatings: { enabled: true, weight: 0.6 },
    },
  })
}
```

Or via `cordis.yml`:

```yaml
plugins:
  '@deepseek-ai/dsh-market-data-browser':
    timeoutMs: 30000
    maxConcurrency: 3
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

## Configuration

```ts
interface BrowserSentimentConfig {
  /** Playwright timeout per operation, milliseconds (default: 30000). */
  timeoutMs?: number

  /** Sentiment sources to enable/weight. */
  sources?: {
    news?: { enabled?: boolean; weight?: number }
    twitter?: { enabled?: boolean; weight?: number }
    analystRatings?: { enabled?: boolean; weight?: number }
  }

  /** Enable debug logging and screenshots. */
  debug?: boolean

  /** Max concurrent browser instances (default: 3). */
  maxConcurrency?: number
}
```

**Defaults:**
- All sources enabled
- News weight: 1.0 (most important)
- Twitter weight: 0.8 (social confirmation)
- Analyst weight: 0.6 (supplementary)
- Max concurrency: 3 (balance speed vs. resource usage)

## Usage

```ts
import { Context } from '@deepseek-ai/cordis'

export function apply(ctx: Context) {
  ctx.inject(['marketData'], async (ctx, marketData) => {
    // Fetch sentiment for one or more symbols
    const sentiments = await marketData.getSentiment(['SPY', 'TSLA', 'BTC'], 'browser')

    sentiments.forEach(s => {
      console.log(`${s.symbol}: ${s.score.toFixed(2)} (from ${s.sampleCount} sources)`)
      if (s.sourceScores) {
        console.log(`  News: ${s.sourceScores.news?.toFixed(2)}`)
        console.log(`  Twitter: ${s.sourceScores.twitter?.toFixed(2)}`)
        console.log(`  Analyst: ${s.sourceScores.analystRatings?.toFixed(2)}`)
      }
    })
  })
}
```

## Sentiment Interpretation

Sentiment score is normalized to -1 (bearish) to 1 (bullish):

- **score > 0.3** — Bullish consensus (buy signals, positive headlines, analyst upgrades)
- **0.3 to -0.3** — Neutral (mixed signals, no clear direction)
- **score < -0.3** — Bearish consensus (sell signals, negative headlines, analyst downgrades)

**Example interpretation:**

```ts
const sentiments = await marketData.getSentiment(['SPY'], 'browser')
const sentiment = sentiments[0]

if (sentiment.score > 0.5) {
  // Strong bullish: consider call spreads or long positions
}
if (sentiment.score < -0.5) {
  // Strong bearish: consider put spreads or short positions
}
```

## Sentiment Sources

### News Headlines

Scrapes financial news sites for mentions and sentiment:

- **Sites:** Yahoo Finance, MarketWatch, Seeking Alpha, CNBC, Bloomberg
- **Signal:** Positive/negative news drives short-term sentiment
- **Latency:** 1-5 seconds to scrape and parse

### Twitter / Social Media

Tracks mentions and tone of tweets about symbols:

- **Source:** Twitter API or X crawler (placeholder in demo)
- **Signal:** Retail trader sentiment, viral trends, panic/euphoria
- **Latency:** 2-10 seconds (depends on rate limits)

### Analyst Ratings

Aggregates buy/hold/sell recommendations:

- **Sites:** TradingView, Seeking Alpha, Zacks, Yahoo Finance
- **Signal:** Institutional conviction, long-term outlook
- **Latency:** 3-15 seconds (pages load slowly)

## Combining Sentiment with Other Data

**Common pattern: sentiment + technical + options data**

```ts
const spyQuote = await marketData.getQuote('SPY', 'robinhood')
const sentiment = await marketData.getSentiment(['SPY'], 'browser')
const polymarketOdds = await marketData.getQuote('S&P500 above 6000?', 'polymarket')

const ivHigh = spyQuote.impliedVolatility > 0.25
const sentimentBullish = sentiment[0].score > 0.3
const marketConfident = polymarketOdds.price > 0.65

if (ivHigh && sentimentBullish && marketConfident) {
  // IV elevated but all signals bullish → sell put spreads
}
```

## Real-Time Trading Loop

Sentiment changes slowly (news-driven), so polling every 5-30 minutes is sufficient:

```ts
while (trading) {
  // Update sentiment every 15 minutes
  if (Date.now() % (15 * 60_000) < 1000) {
    const sentiments = await marketData.getSentiment(watchedSymbols, 'browser')
    // Update trading logic with fresh sentiment
  }

  // Update prices every second (from subscription)
  const price = currentQuote.price
  if (shouldTrade(price, sentiment)) {
    // Place trade
  }

  await sleep(1000)
}
```

## Concurrency and Performance

The provider runs scrapers concurrently with configurable limits:

```ts
const config = {
  maxConcurrency: 5, // Up to 5 symbols at once
}
```

**Example timing:**

- 1 symbol: 1-5 seconds
- 5 symbols (sequential): 5-25 seconds
- 5 symbols (concurrent, maxConcurrency=5): 1-5 seconds

## Debug Mode

Enable debug logging and optional screenshots:

```ts
const config = {
  debug: true,
}
```

**Output:**

```
[BrowserSentiment] getSentiment([SPY, TSLA, BTC])
[BrowserSentiment] Scraping news sentiment for SPY
[BrowserSentiment] Scraping Twitter sentiment for SPY
[BrowserSentiment] Scraping analyst ratings for SPY
...
```

## Multi-Provider Strategy

Sentiment is typically used as a **confirming signal** alongside technical/options data:

```ts
// corids.yml or plugin order:
// 1. Robinhood (quotes, bars, subscriptions)
// 2. Polymarket (prediction market sentiment/liquidity)
// 3. Browser scraper (news/social sentiment)

ctx.marketData.register(robinhoodProvider)
ctx.marketData.register(polymarketProvider)
ctx.marketData.register(browserProvider)
```

## Error Handling

```ts
import { MarketDataError } from '@deepseek-ai/dsh-market-data'

try {
  const sentiments = await marketData.getSentiment(['SPY', 'INVALID'], 'browser')
} catch (err) {
  if (err instanceof MarketDataError) {
    if (err.code === 'OPERATION_NOT_SUPPORTED') {
      // Try different provider
    }
  }
}
```

**Common errors:**

- `OPERATION_NOT_SUPPORTED` — Browser scraper only supports `getSentiment()`
- `NETWORK_ERROR` — Unable to reach news/social sites
- `TIMEOUT` — Scraper took longer than configured timeout

## Known Limitations and Deferred Work

- **Playwright dependency:** Currently requires Playwright for scraping (future: integrate real API feeds for speed).
- **Rate limiting:** No built-in rate-limiting for concurrent requests; production use should add request queuing.
- **NLP sentiment:** Current implementation uses placeholder scores; production should integrate real NLP/ML sentiment analysis.
- **Cache invalidation:** Sentiment is re-scraped on each request; future versions should cache with TTL (e.g., 5-30 min).
- **Source reliability:** News/social sites change HTML structure frequently; selectors may break (requires maintenance).
- **Privacy/Terms of Service:** Web scraping may violate TOS on some sites; consider using official APIs (Reuters, Bloomberg, etc.) for production.
- **Latency:** 1-15 seconds per batch; not suitable for ultra-high-frequency strategies.
