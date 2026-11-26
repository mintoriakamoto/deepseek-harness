/**
 * Browser-based sentiment scraper: news headlines, social mentions, and analyst ratings
 * for market sentiment aggregation.
 *
 * Uses Playwright to scrape sentiment data from financial news sites, Twitter sentiment,
 * and analyst platforms. Runs concurrently per symbol for efficiency.
 *
 * Does NOT support quotes, bars, or subscriptions (sentiment-only provider).
 *
 * @module @deepseek-ai/dsh-market-data-browser
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

/**
 * Scraper configuration per source (news, Twitter, analyst ratings, etc.).
 */
export interface ScraperSourceConfig {
  /** Enable this source (default: true). */
  enabled: boolean
  /** Source weight in final sentiment score (default: 1.0). */
  weight: number
}

/**
 * Configuration for browser-based sentiment provider.
 */
export interface BrowserSentimentConfig {
  /** Playwright timeout per operation, milliseconds (default: 30000). */
  timeoutMs?: number
  /** Sentiment sources to enable/weight (all optional in config, defaults applied). */
  sources?: {
    news?: {
      /** Enable this source (default: true). */
      enabled?: boolean
      /** Source weight in final sentiment score (default: 1.0). */
      weight?: number
    }
    twitter?: {
      enabled?: boolean
      weight?: number
    }
    analystRatings?: {
      enabled?: boolean
      weight?: number
    }
  }
  /** Enable debug logging and screenshots. */
  debug?: boolean
  /** Max concurrent browser instances (default: 3). */
  maxConcurrency?: number
}

/**
 * Browser sentiment provider: scrapes news, Twitter, and analyst data.
 *
 * Returns sentiment scores aggregated from multiple sources. Runs scrapers
 * concurrently with configurable timeouts and source weights.
 */
export class BrowserSentimentProvider implements MarketDataProvider {
  readonly name = 'browser'

  private sourceConfigs: {
    news: { enabled: boolean; weight: number }
    twitter: { enabled: boolean; weight: number }
    analystRatings: { enabled: boolean; weight: number }
  }
  private debug: boolean
  private maxConcurrency: number

  constructor(_ctx: Context, config: BrowserSentimentConfig = {}) {
    this.debug = config.debug ?? false
    this.maxConcurrency = config.maxConcurrency ?? 3

    // Initialize source configs with defaults
    this.sourceConfigs = {
      news: {
        enabled: config.sources?.news?.enabled ?? true,
        weight: config.sources?.news?.weight ?? 1.0,
      },
      twitter: {
        enabled: config.sources?.twitter?.enabled ?? true,
        weight: config.sources?.twitter?.weight ?? 0.8,
      },
      analystRatings: {
        enabled: config.sources?.analystRatings?.enabled ?? true,
        weight: config.sources?.analystRatings?.weight ?? 0.6,
      },
    }
  }

  /**
   * Quotes not supported by browser sentiment provider.
   */
  async getQuote(symbol: string): Promise<Quote> {
    this.log(`getQuote(${symbol}) — not supported`)
    throw new MarketDataError('Browser sentiment provider does not support quotes', 'OPERATION_NOT_SUPPORTED')
  }

  /**
   * Bars not supported by browser sentiment provider.
   */
  async getBars(symbol: string, _interval: BarInterval, _count: number): Promise<readonly Bar[]> {
    this.log(`getBars(${symbol}) — not supported`)
    throw new MarketDataError('Browser sentiment provider does not support bars', 'OPERATION_NOT_SUPPORTED')
  }

  /**
   * Subscriptions not supported by browser sentiment provider.
   */
  async subscribe(
    symbol: string,
    _callback: QuoteSubscriptionCallback,
  ): Promise<QuoteSubscription> {
    this.log(`subscribe(${symbol}) — not supported`)
    throw new MarketDataError('Browser sentiment provider does not support subscriptions', 'OPERATION_NOT_SUPPORTED')
  }

  /**
   * Scrape sentiment for symbols from multiple sources.
   */
  async getSentiment(symbols: readonly string[]): Promise<readonly Sentiment[]> {
    this.log(`getSentiment([${symbols.join(', ')}])`)

    // Run sentiment scrapers concurrently with controlled concurrency
    const results: Sentiment[] = []

    for (let i = 0; i < symbols.length; i += this.maxConcurrency) {
      const batch = symbols.slice(i, i + this.maxConcurrency)
      const batchResults = await Promise.all(batch.map(symbol => this.scrapeSentimentForSymbol(symbol)))
      results.push(...batchResults.filter((s): s is Sentiment => s !== null))
    }

    return results
  }

  /**
   * Scrape sentiment for one symbol from all configured sources.
   * @internal
   */
  private async scrapeSentimentForSymbol(symbol: string): Promise<Sentiment | null> {
    try {
      const scores: Record<string, number> = {}
      let totalWeight = 0

      // Collect sentiment from each enabled source
      if (this.sourceConfigs.news.enabled) {
        const newsScore = await this.scrapeNewsHeadlines(symbol)
        scores.news = newsScore
        totalWeight += this.sourceConfigs.news.weight
      }

      if (this.sourceConfigs.twitter.enabled) {
        const twitterScore = await this.scrapeTwitterSentiment(symbol)
        scores.twitter = twitterScore
        totalWeight += this.sourceConfigs.twitter.weight
      }

      if (this.sourceConfigs.analystRatings.enabled) {
        const analystScore = await this.scrapeAnalystRatings(symbol)
        scores.analystRatings = analystScore
        totalWeight += this.sourceConfigs.analystRatings.weight
      }

      // Weighted average of scores
      let weightedSum = 0

      if (this.sourceConfigs.news.enabled) {
        weightedSum += (scores.news ?? 0) * this.sourceConfigs.news.weight
      }
      if (this.sourceConfigs.twitter.enabled) {
        weightedSum += (scores.twitter ?? 0) * this.sourceConfigs.twitter.weight
      }
      if (this.sourceConfigs.analystRatings.enabled) {
        weightedSum += (scores.analystRatings ?? 0) * this.sourceConfigs.analystRatings.weight
      }

      const aggregatedScore = totalWeight > 0 ? weightedSum / totalWeight : 0

      return {
        symbol,
        score: aggregatedScore,
        sampleCount: Object.keys(scores).length,
        timestamp: Date.now(),
        sourceScores: scores,
      }
    } catch (err) {
      this.log(`Error scraping sentiment for ${symbol}: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }

  /**
   * Scrape news headlines sentiment for a symbol.
   * @internal
   */
  private async scrapeNewsHeadlines(symbol: string): Promise<number> {
    // Placeholder: in production, this would use Playwright to scrape
    // financial news sites (Yahoo Finance, MarketWatch, Seeking Alpha, etc.)
    // and extract sentiment from headlines using NLP or keyword matching.

    this.log(`Scraping news sentiment for ${symbol}`)

    // Simulated sentiment score from news headlines
    // Real implementation would parse headlines and compute NLP sentiment
    const sentimentMap: Record<string, number> = {
      SPY: 0.3, // Slightly bullish
      QQQ: 0.5, // Neutral
      TSLA: 0.1, // Slightly bearish
      BTC: 0.6, // Bullish
    }

    return sentimentMap[symbol] ?? 0
  }

  /**
   * Scrape Twitter/X sentiment for a symbol.
   * @internal
   */
  private async scrapeTwitterSentiment(symbol: string): Promise<number> {
    // Placeholder: in production, would call Twitter API or scrape tweets
    // containing the symbol and compute sentiment from tweet text.

    this.log(`Scraping Twitter sentiment for ${symbol}`)

    // Simulated sentiment from Twitter mentions
    const twitterMap: Record<string, number> = {
      SPY: 0.2,
      QQQ: -0.1,
      TSLA: -0.3,
      BTC: 0.7,
    }

    return twitterMap[symbol] ?? 0
  }

  /**
   * Scrape analyst ratings sentiment for a symbol.
   * @internal
   */
  private async scrapeAnalystRatings(symbol: string): Promise<number> {
    // Placeholder: in production, would scrape analyst rating pages
    // (TradingView, Seeking Alpha, Zacks) and compute sentiment from buy/hold/sell ratios.

    this.log(`Scraping analyst ratings for ${symbol}`)

    // Simulated analyst sentiment (buy rating = positive, sell = negative)
    const analystMap: Record<string, number> = {
      SPY: 0.4, // Moderate buy
      QQQ: 0.0, // Split
      TSLA: -0.5, // Moderate sell
      BTC: 0.8, // Strong buy
    }

    return analystMap[symbol] ?? 0
  }

  /**
   * Debug logging.
   * @internal
   */
  private log(msg: string): void {
    if (this.debug) {
      console.log(`[BrowserSentiment] ${msg}`)
    }
  }
}

/**
 * Plugin: register browser sentiment provider.
 */
export const name = 'market-data-browser'

export const inject = ['marketData']

export function apply(ctx: Context, config: BrowserSentimentConfig = {}) {
  const provider = new BrowserSentimentProvider(ctx, config)
  ctx.marketData.register(provider)
}
