---
description: "LunarCrush social sentiment provider: real-time Twitter, Reddit, Discord sentiment for trading signals"
---

# @deepseek-ai/dsh-market-data-social-alt

LunarCrush social sentiment provider: aggregates real-time social media sentiment from Twitter, Reddit, and Discord to generate trading signals.

## Overview

This is a **Service Provider** that registers with the market data registry. It bridges LunarCrush social sentiment data to the market data interface.

**Implements:**
- `getSentiment()` — Aggregated sentiment from Twitter, Reddit, and Discord with trending metrics

**Does NOT implement:**
- `getQuote()` — Use Robinhood for real-time prices
- `getBars()` — Use Robinhood for historical OHLCV
- `subscribe()` — Use Robinhood for real-time subscriptions

## Installation

```ts
import { Context } from '@deepseek-ai/cordis'
import { apply as applyLunarCrush } from '@deepseek-ai/dsh-market-data-social-alt'

export function apply(ctx: Context) {
  applyLunarCrush(ctx, {
    timeoutMs: 10_000,
    maxConcurrency: 5,
    cacheTtlMs: 300_000,
    debug: false,
    sources: {
      twitter: { enabled: true, weight: 0.5 },
      reddit: { enabled: true, weight: 0.3 },
      discord: { enabled: true, weight: 0.2 },
    },
  })
}
```

Or via `cordis.yml`:

```yaml
plugins:
  '@deepseek-ai/dsh-market-data-social-alt':
    timeoutMs: 10000
    maxConcurrency: 5
    cacheTtlMs: 300000
    sources:
      twitter:
        enabled: true
        weight: 0.5
      reddit:
        enabled: true
        weight: 0.3
      discord:
        enabled: true
        weight: 0.2
```

## Configuration

```ts
interface LunarCrushConfig {
  /** LunarCrush API key. */
  apiKey?: string

  /** API timeout per operation, milliseconds (default: 10000). */
  timeoutMs?: number

  /** Sentiment sources to enable/weight. */
  sources?: {
    twitter?: { enabled?: boolean; weight?: number }
    reddit?: { enabled?: boolean; weight?: number }
    discord?: { enabled?: boolean; weight?: number }
  }

  /** Enable debug logging. */
  debug?: boolean

  /** Max concurrent requests (default: 5). */
  maxConcurrency?: number

  /** Cache TTL in milliseconds (default: 300000 = 5 minutes). */
  cacheTtlMs?: number
}
```

**Defaults:**
- All sources enabled
- Twitter weight: 0.5 (most important — most liquid market signal)
- Reddit weight: 0.3 (community conviction)
- Discord weight: 0.2 (influencer sentiment)
- Max concurrency: 5 (balance speed vs. API rate limits)
- Cache TTL: 5 minutes

## Usage

```ts
import { Context } from '@deepseek-ai/cordis'

export function apply(ctx: Context) {
  ctx.inject(['marketData'], async (ctx, marketData) => {
    // Fetch sentiment for one or more symbols
    const sentiments = await marketData.getSentiment(['SPY', 'TSLA', 'BTC'], 'lunarcrush')

    sentiments.forEach(s => {
      console.log(`${s.symbol}: ${s.score.toFixed(2)} (from ${s.sampleCount} sources)`)
      if (s.sourceScores) {
        console.log(`  Twitter: ${s.sourceScores.twitter?.toFixed(2)}`)
        console.log(`  Reddit: ${s.sourceScores.reddit?.toFixed(2)}`)
        console.log(`  Discord: ${s.sourceScores.discord?.toFixed(2)}`)
        console.log(`  Volume: ${s.sourceScores.volume?.toFixed(2)}`)
      }
    })
  })
}
```

## Sentiment Interpretation

Sentiment score is normalized to -1 (bearish) to 1 (bullish):

- **score > 0.3** — Bullish consensus (buying pressure, positive discussion, high trending rank)
- **0.3 to -0.3** — Neutral (mixed signals, no clear direction)
- **score < -0.3** — Bearish consensus (selling pressure, negative discussion)

**Example interpretation:**

```ts
const sentiments = await marketData.getSentiment(['BTC'], 'lunarcrush')
const sentiment = sentiments[0]

if (sentiment.score > 0.5) {
  // Strong bullish: consider call spreads or long positions
}
if (sentiment.score < -0.5) {
  // Strong bearish: consider put spreads or short positions
}
```

## Sentiment Sources

### Twitter / X

Tracks mentions, sentiment, and influencer activity:

- **Signal:** Retail trader sentiment, viral trends, panic/euphoria (most responsive to price action)
- **Weight:** 50% (primary signal due to market liquidity correlation)
- **Latency:** Real-time (streamed from API)

### Reddit

Aggregates subreddit discussions and community conviction:

- **Source:** Subreddit posts and comments (r/stocks, r/cryptocurrency, r/investing, etc.)
- **Signal:** Community conviction, long-term thesis, retail retail positioning
- **Weight:** 30% (slower-moving, reflects deeper research)
- **Latency:** 1-5 minutes (batch processed)

### Discord

Monitors trader discord servers and influencer sentiment:

- **Source:** Discord channels, trading groups, influencer servers
- **Signal:** Coordinated positioning, real-time reactions, influencer calls
- **Weight:** 20% (supplementary, prone to echo chambers)
- **Latency:** Real-time (pushed from API)

## Trending Metrics

Beyond raw sentiment, the provider incorporates:

- **Trending Rank:** Global rank of symbol mentions (1 = most trending). Boosts sentiment by up to 10%.
- **Volume Increase:** Percent change in social volume. Signals increased interest; boosts sentiment.
- **Influencer Sentiment:** Aggregated sentiment from tracked influencers (included in source breakdown).

## Combining Sentiment with Other Data

**Common pattern: LunarCrush sentiment + technical + options data**

```ts
const spyQuote = await marketData.getQuote('SPY', 'robinhood')
const socialSentiment = await marketData.getSentiment(['SPY'], 'lunarcrush')
const polymarketOdds = await marketData.getQuote('S&P500 above 6000?', 'polymarket')

const ivHigh = spyQuote.impliedVolatility > 0.25
const sentimentBullish = socialSentiment[0].score > 0.3
const marketConfident = polymarketOdds.price > 0.65

if (ivHigh && sentimentBullish && marketConfident) {
  // IV elevated but all signals bullish → sell put spreads
}
```

## Real-Time Trading Loop

Social sentiment updates frequently (tweets posted continuously), but we cache for efficiency:

```ts
while (trading) {
  // Sentiment refreshes every 5 minutes (after cache expires)
  const sentiments = await marketData.getSentiment(watchedSymbols, 'lunarcrush')

  // Update prices every second (from subscription)
  const price = currentQuote.price
  if (shouldTrade(price, sentiment)) {
    // Place trade
  }

  await sleep(1000)
}
```

## Concurrency and Performance

The provider runs LunarCrush API calls concurrently with configurable limits:

```ts
const config = {
  maxConcurrency: 5, // Up to 5 symbols at once
}
```

**Example timing:**

- 1 symbol: 100-500 ms (cached if available)
- 5 symbols (sequential): 500 ms - 2.5 seconds
- 5 symbols (concurrent, maxConcurrency=5): 100-500 ms

## Caching

By default, sentiment is cached for 5 minutes. Configure with `cacheTtlMs`:

```ts
const config = {
  cacheTtlMs: 60_000, // 1 minute cache
}
```

Shorter caches (1-2 minutes) are useful for active trading; longer caches (10+ minutes) reduce API load.

## Debug Mode

Enable debug logging:

```ts
const config = {
  debug: true,
}
```

**Output:**

```
[LunarCrush] getSentiment([SPY, TSLA, BTC])
[LunarCrush] Fetching metrics from LunarCrush for SPY
[LunarCrush] Fetching Twitter sentiment for SPY
[LunarCrush] Fetching Reddit sentiment for SPY
[LunarCrush] Fetching Discord sentiment for SPY
[LunarCrush] Fetching trending data for SPY
...
```

## Multi-Provider Strategy

Social sentiment is typically used as a **confirming signal** alongside technical and options data:

```ts
// cordis.yml or plugin order:
// 1. Robinhood (quotes, bars, subscriptions)
// 2. Polymarket (prediction market sentiment/liquidity)
// 3. LunarCrush (social sentiment)
// 4. Browser scraper (news/analyst sentiment)

ctx.marketData.register(robinhoodProvider)
ctx.marketData.register(polymarketProvider)
ctx.marketData.register(lunarcrushProvider)
ctx.marketData.register(browserProvider)
```

## Known Limitations and Deferred Work

- **API Key Required:** Production use requires LunarCrush API credentials (not included in demo)
- **Rate Limits:** LunarCrush API has rate limits; concurrency and caching help stay within limits
- **Historical Data:** Provider only returns current snapshot; use `market-data-browser` or Robinhood for historical bars
- **Real-Time Streams:** Heavy volume analysis requires streaming mode; this provider polls on-demand
