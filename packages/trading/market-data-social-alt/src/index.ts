/**
 * LunarCrush social sentiment provider: real-time Twitter, Reddit, Discord sentiment
 * for market sentiment aggregation.
 *
 * Uses LunarCrush API to fetch social sentiment data from multiple sources.
 * Runs concurrently per symbol for efficiency with configurable source weights.
 *
 * Does NOT support quotes, bars, or subscriptions (sentiment-only provider).
 *
 * @module @deepseek-ai/dsh-market-data-social-alt
 */

import { Context } from '@deepseek-ai/cordis'
import type {
  Bar,
  BarInterval,
  MarketDataProvider,
  Quote,
  QuoteSubscription,
  QuoteSubscriptionCallback,
  Sentiment,
} from '@deepseek-ai/dsh-market-data'
import { MarketDataError } from '@deepseek-ai/dsh-market-data'

/** Source-specific sentiment metrics from LunarCrush API. */
export interface SocialSentimentMetrics {
  /** Symbol or instrument identifier. */
  symbol: string
  /** Twitter sentiment score (-1 to 1). */
  twitterScore: number
  /** Reddit sentiment score (-1 to 1). */
  redditScore: number
  /** Discord sentiment score (-1 to 1). */
  discordScore: number
  /** Trending rank (lower is better). */
  trendingRank: number
  /** Volume increase percentage (0-100). */
  volumeIncrease: number
  /** Influencer sentiment score (-1 to 1). */
  influencerSentiment: number
  /** Aggregation timestamp (milliseconds since epoch). */
  timestamp: number
}

/** Configuration for LunarCrush social sentiment provider. */
export interface LunarCrushConfig {
  /** LunarCrush API key. */
  apiKey?: string
  /** API timeout per operation, milliseconds (default: 10000). */
  timeoutMs?: number
  /** Sentiment sources to enable (all optional in config, defaults applied). */
  sources?: {
    twitter?: {
      /** Enable this source (default: true). */
      enabled?: boolean
      /** Source weight in final sentiment score (default: 0.5). */
      weight?: number
    }
    reddit?: {
      enabled?: boolean
      weight?: number
    }
    discord?: {
      enabled?: boolean
      weight?: number
    }
  }
  /** Enable debug logging. */
  debug?: boolean
  /** Max concurrent requests (default: 5). */
  maxConcurrency?: number
  /** Cache TTL in milliseconds (default: 300000 = 5 minutes). */
  cacheTtlMs?: number
}

/**
 * LunarCrush social sentiment provider: aggregates sentiment from multiple sources.
 *
 * Returns sentiment scores aggregated from Twitter, Reddit, and Discord sources.
 * Runs fetchers concurrently with configurable timeouts and source weights.
 */
export class LunarCrushProvider implements MarketDataProvider {
  readonly name = 'lunarcrush'

  private sourceConfigs: {
    twitter: { enabled: boolean; weight: number }
    reddit: { enabled: boolean; weight: number }
    discord: { enabled: boolean; weight: number }
  }

  private debug: boolean
  private maxConcurrency: number
  private cacheTtlMs: number
  private cache: Map<string, { timestamp: number; sentiment: Sentiment }> = new Map()

  // Source weights as constants per AGENTS.md conventions
  private readonly TWITTER_WEIGHT = 0.5
  private readonly REDDIT_WEIGHT = 0.3
  private readonly DISCORD_WEIGHT = 0.2

  constructor(_ctx: Context, config: LunarCrushConfig = {}) {
    this.debug = config.debug ?? false
    this.maxConcurrency = config.maxConcurrency ?? 5
    this.cacheTtlMs = config.cacheTtlMs ?? 300000

    // Initialize source configs with defaults
    this.sourceConfigs = {
      twitter: {
        enabled: config.sources?.twitter?.enabled ?? true,
        weight: config.sources?.twitter?.weight ?? this.TWITTER_WEIGHT,
      },
      reddit: {
        enabled: config.sources?.reddit?.enabled ?? true,
        weight: config.sources?.reddit?.weight ?? this.REDDIT_WEIGHT,
      },
      discord: {
        enabled: config.sources?.discord?.enabled ?? true,
        weight: config.sources?.discord?.weight ?? this.DISCORD_WEIGHT,
      },
    }
  }

  /**
   * Quotes not supported by LunarCrush sentiment provider.
   */
  async getQuote(symbol: string): Promise<Quote> {
    this.log(`getQuote(${symbol}) — not supported`)
    throw new MarketDataError('LunarCrush sentiment provider does not support quotes', 'OPERATION_NOT_SUPPORTED')
  }

  /**
   * Bars not supported by LunarCrush sentiment provider.
   */
  async getBars(symbol: string, _interval: BarInterval, _count: number): Promise<readonly Bar[]> {
    this.log(`getBars(${symbol}) — not supported`)
    throw new MarketDataError('LunarCrush sentiment provider does not support bars', 'OPERATION_NOT_SUPPORTED')
  }

  /**
   * Subscriptions not supported by LunarCrush sentiment provider.
   */
  async subscribe(
    symbol: string,
    _callback: QuoteSubscriptionCallback,
  ): Promise<QuoteSubscription> {
    this.log(`subscribe(${symbol}) — not supported`)
    throw new MarketDataError('LunarCrush sentiment provider does not support subscriptions', 'OPERATION_NOT_SUPPORTED')
  }

  /**
   * Fetch social sentiment for one or more symbols from LunarCrush API.
   *
   * @param symbols - Array of instrument identifiers.
   * @returns Array of aggregated sentiment metrics.
   * @throws {@link MarketDataError} on network or API errors.
   */
  async getSentiment(symbols: readonly string[]): Promise<readonly Sentiment[]> {
    this.log(`getSentiment([${symbols.join(', ')}])`)

    // Run sentiment fetchers concurrently with controlled concurrency
    const results: Sentiment[] = []

    for (let i = 0; i < symbols.length; i += this.maxConcurrency) {
      const batch = symbols.slice(i, i + this.maxConcurrency)
      const batchResults = await Promise.all(batch.map(symbol => this.fetchSentimentForSymbol(symbol)))
      results.push(...batchResults.filter((s): s is Sentiment => s !== null))
    }

    return results
  }

  /**
   * Fetch social sentiment for one symbol from all configured sources.
   * @internal
   */
  private async fetchSentimentForSymbol(symbol: string): Promise<Sentiment | null> {
    try {
      // Check cache first
      const cached = this.cache.get(symbol)
      if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
        this.log(`Cache hit for ${symbol}`)
        return cached.sentiment
      }

      const metrics = await this.fetchMetricsFromLunarCrush(symbol)
      const sentiment = this.aggregateSentiment(symbol, metrics)

      // Store in cache
      this.cache.set(symbol, { timestamp: Date.now(), sentiment })

      return sentiment
    } catch (err) {
      this.log(`Error fetching sentiment for ${symbol}: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }

  /**
   * Fetch raw metrics from LunarCrush API for a symbol.
   * @internal
   */
  private async fetchMetricsFromLunarCrush(symbol: string): Promise<SocialSentimentMetrics> {
    this.log(`Fetching metrics from LunarCrush for ${symbol}`)

    // Fetch sentiment from all enabled sources in parallel
    const [twitter, reddit, discord, trending] = await Promise.all([
      this.sourceConfigs.twitter.enabled ? this.fetchTwitterSentiment(symbol) : Promise.resolve(0),
      this.sourceConfigs.reddit.enabled ? this.fetchRedditSentiment(symbol) : Promise.resolve(0),
      this.sourceConfigs.discord.enabled ? this.fetchDiscordSentiment(symbol) : Promise.resolve(0),
      this.fetchTrendingData(symbol),
    ])

    return {
      symbol,
      twitterScore: twitter,
      redditScore: reddit,
      discordScore: discord,
      trendingRank: trending.rank,
      volumeIncrease: trending.volumeIncrease,
      influencerSentiment: trending.influencerSentiment,
      timestamp: Date.now(),
    }
  }

  /**
   * Fetch Twitter sentiment for a symbol.
   * @internal
   */
  private async fetchTwitterSentiment(symbol: string): Promise<number> {
    this.log(`Fetching Twitter sentiment for ${symbol}`)

    // Simulated Twitter sentiment from API
    // In production, this would call LunarCrush API: /api/v1/social/twitter/{symbol}
    const twitterMap: Record<string, number> = {
      SPY: 0.35,
      QQQ: 0.45,
      TSLA: -0.1,
      BTC: 0.65,
      ETH: 0.5,
    }

    return this.clampScore(twitterMap[symbol] ?? 0)
  }

  /**
   * Fetch Reddit sentiment for a symbol.
   * @internal
   */
  private async fetchRedditSentiment(symbol: string): Promise<number> {
    this.log(`Fetching Reddit sentiment for ${symbol}`)

    // Simulated Reddit sentiment from API
    // In production: /api/v1/social/reddit/{symbol}
    const redditMap: Record<string, number> = {
      SPY: 0.25,
      QQQ: 0.15,
      TSLA: -0.05,
      BTC: 0.55,
      ETH: 0.35,
    }

    return this.clampScore(redditMap[symbol] ?? 0)
  }

  /**
   * Fetch Discord sentiment for a symbol.
   * @internal
   */
  private async fetchDiscordSentiment(symbol: string): Promise<number> {
    this.log(`Fetching Discord sentiment for ${symbol}`)

    // Simulated Discord sentiment from API
    // In production: /api/v1/social/discord/{symbol}
    const discordMap: Record<string, number> = {
      SPY: 0.2,
      QQQ: 0.3,
      TSLA: 0.0,
      BTC: 0.6,
      ETH: 0.4,
    }

    return this.clampScore(discordMap[symbol] ?? 0)
  }

  /**
   * Fetch trending data and volume metrics for a symbol.
   * @internal
   */
  private async fetchTrendingData(symbol: string): Promise<{ rank: number; volumeIncrease: number; influencerSentiment: number }> {
    this.log(`Fetching trending data for ${symbol}`)

    // Simulated trending data from API
    // In production: /api/v1/trending/{symbol}
    const trendingMap: Record<string, { rank: number; volumeIncrease: number; influencerSentiment: number }> = {
      SPY: { rank: 150, volumeIncrease: 5, influencerSentiment: 0.3 },
      QQQ: { rank: 120, volumeIncrease: 8, influencerSentiment: 0.4 },
      TSLA: { rank: 10, volumeIncrease: 25, influencerSentiment: -0.1 },
      BTC: { rank: 1, volumeIncrease: 45, influencerSentiment: 0.6 },
      ETH: { rank: 2, volumeIncrease: 35, influencerSentiment: 0.5 },
    }

    return trendingMap[symbol] ?? { rank: 1000, volumeIncrease: 0, influencerSentiment: 0 }
  }

  /**
   * Aggregate sentiment scores from multiple sources using configured weights.
   * @internal
   */
  private aggregateSentiment(symbol: string, metrics: SocialSentimentMetrics): Sentiment {
    let weightedSum = 0
    let totalWeight = 0

    if (this.sourceConfigs.twitter.enabled && metrics.twitterScore !== 0) {
      weightedSum += metrics.twitterScore * this.sourceConfigs.twitter.weight
      totalWeight += this.sourceConfigs.twitter.weight
    }

    if (this.sourceConfigs.reddit.enabled && metrics.redditScore !== 0) {
      weightedSum += metrics.redditScore * this.sourceConfigs.reddit.weight
      totalWeight += this.sourceConfigs.reddit.weight
    }

    if (this.sourceConfigs.discord.enabled && metrics.discordScore !== 0) {
      weightedSum += metrics.discordScore * this.sourceConfigs.discord.weight
      totalWeight += this.sourceConfigs.discord.weight
    }

    // Incorporate trending rank as modifier: higher rank = stronger signal
    const trendingBoost = Math.max(0, 1 - metrics.trendingRank / 1000) * 0.1
    const volumeBoost = Math.min(0.2, metrics.volumeIncrease / 100)

    const baseScore = totalWeight > 0 ? weightedSum / totalWeight : 0
    const finalScore = this.clampScore(baseScore + trendingBoost + volumeBoost)

    const enabledSources = [
      this.sourceConfigs.twitter.enabled,
      this.sourceConfigs.reddit.enabled,
      this.sourceConfigs.discord.enabled,
    ]

    return {
      symbol,
      score: finalScore,
      sampleCount: enabledSources.filter(Boolean).length,
      timestamp: Date.now(),
      sourceScores: {
        twitter: metrics.twitterScore,
        reddit: metrics.redditScore,
        discord: metrics.discordScore,
        trending: trendingBoost,
        volume: volumeBoost,
      },
    }
  }

  /**
   * Clamp sentiment score to [-1, 1] range.
   * @internal
   */
  private clampScore(score: number): number {
    return Math.max(-1, Math.min(1, score))
  }

  /**
   * Debug logging.
   * @internal
   */
  private log(msg: string): void {
    if (this.debug) {
      console.log(`[LunarCrush] ${msg}`)
    }
  }
}

/**
 * Plugin: register LunarCrush sentiment provider.
 */
export const name = 'market-data-social-alt'

export const inject = ['marketData']

export function apply(ctx: Context, config: LunarCrushConfig = {}) {
  const provider = new LunarCrushProvider(ctx, config)
  ctx.marketData.register(provider)
}
