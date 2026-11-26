/**
 * Clear Street sentiment provider: analyst consensus ratings and bias detection.
 *
 * Uses Clear Street analyst data to fetch Buy/Hold/Sell consensus ratings,
 * normalize sentiment to [-1, 1], and detect consensus bubbles/biases.
 *
 * @module @deepseek-ai/dsh-market-data-clear-street
 */

import { Context } from '@deepseek-ai/cordis'

/** Type definitions for market data - duplicated for independence from dsh-market-data for now. */
export interface Sentiment {
  symbol: string
  score: number
  sampleCount: number
  timestamp: number
  sourceScores?: Record<string, number>
}

export interface MarketDataProvider {
  readonly name: string
  getSentiment?: (symbols: readonly string[]) => Promise<readonly Sentiment[]>
}

export class MarketDataError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode?: number,
  ) {
    super(message)
    this.name = 'MarketDataError'
  }
}

/** Create a subscription ID - mock implementation. */
function createSubscriptionId(): string {
  return `sub-${Math.random().toString(36).substring(2, 11)}`
}

const MDError = MarketDataError

/**
 * Analyst rating from Clear Street API.
 */
export interface AnalystRating {
  /** Stock symbol. */
  symbol: string
  /** Count of buy ratings. */
  buyCount: number
  /** Count of hold ratings. */
  holdCount: number
  /** Count of sell ratings. */
  sellCount: number
  /** Consensus rating: 'buy', 'hold', 'sell'. */
  consensus: 'buy' | 'hold' | 'sell'
  /** Average price target. */
  avgTarget: number
  /** Timestamp (milliseconds since epoch). */
  timestamp: number
}

/**
 * Bias detection result.
 */
export interface BiasDetection {
  /** Symbol. */
  symbol: string
  /** Whether consensus shows bias (>70% single rating). */
  hasBias: boolean
  /** Dominant rating percentage (0-100). */
  dominantPercentage: number
  /** Dominant rating type. */
  dominantRating: 'buy' | 'hold' | 'sell'
  /** Total analysts. */
  totalAnalysts: number
}

/**
 * Configuration for Clear Street sentiment provider.
 */
export interface ClearStreetConfig {
  /** API base URL (default: https://api.clearstreet.io/v1). */
  apiBaseUrl?: string
  /** API key for authentication. */
  apiKey?: string
  /** Cache TTL in milliseconds (default: 300000 = 5 minutes). */
  cacheTtlMs?: number
  /** Enable debug logging. */
  debug?: boolean
}

/**
 * Clear Street provider: sentiment analysis via analyst consensus ratings.
 *
 * Implements getSentiment() to return normalized analyst consensus,
 * plus methods to detect analyst bias and fetch raw ratings.
 */
export class ClearStreetSentimentProvider implements MarketDataProvider {
  readonly name = 'clear-street'

  private apiBaseUrl: string
  private apiKey: string
  private cacheTtlMs: number
  private debug: boolean
  private ratingsCache: Map<string, { data: AnalystRating; timestamp: number }> = new Map()

  constructor(_ctx: Context, config: ClearStreetConfig = {}) {
    this.apiBaseUrl = config.apiBaseUrl ?? 'https://api.clearstreet.io/v1'
    this.apiKey = config.apiKey ?? ''
    this.cacheTtlMs = config.cacheTtlMs ?? 300_000
    this.debug = config.debug ?? false
  }

  /**
   * Fetch analyst ratings consensus for one symbol.
   */
  async getAnalystRatings(symbol: string): Promise<AnalystRating> {
    this.log(`getAnalystRatings(${symbol})`)

    // Check cache
    const cached = this.ratingsCache.get(symbol)
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      this.log(`getAnalystRatings(${symbol}) — cache hit`)
      return cached.data
    }

    try {
      // Simulate API call (in production, use real HTTP client)
      const ratings = await this.fetchRatingsFromAPI(symbol)
      this.ratingsCache.set(symbol, { data: ratings, timestamp: Date.now() })
      return ratings
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new MDError(`Failed to fetch ratings for ${symbol}: ${message}`, 'NETWORK_ERROR', 500)
    }
  }

  /**
   * Normalize analyst consensus to sentiment score [-1, 1].
   * -1 = all sell, 0 = neutral/hold, 1 = all buy.
   */
  async getSentiment(symbols: readonly string[]): Promise<readonly Sentiment[]> {
    this.log(`getSentiment([${symbols.join(', ')}])`)

    const results: Sentiment[] = []

    for (const symbol of symbols) {
      try {
        const ratings = await this.getAnalystRatings(symbol)
        const score = this.normalizeSentiment(ratings)

        const sourceScores: Record<string, number> = {
          'analyst-buy': ratings.buyCount,
          'analyst-hold': ratings.holdCount,
          'analyst-sell': ratings.sellCount,
        }

        results.push({
          symbol,
          score,
          sampleCount: ratings.buyCount + ratings.holdCount + ratings.sellCount,
          timestamp: ratings.timestamp,
          sourceScores,
        })
      } catch (err) {
        this.log(`getSentiment(${symbol}) error: ${err instanceof Error ? err.message : String(err)}`)
        // Continue with other symbols on partial failure
      }
    }

    return results
  }

  /**
   * Detect consensus bubbles: when >70% of analysts agree on one rating.
   */
  async detectBias(symbol: string): Promise<BiasDetection> {
    this.log(`detectBias(${symbol})`)

    try {
      const ratings = await this.getAnalystRatings(symbol)
      const total = ratings.buyCount + ratings.holdCount + ratings.sellCount

      if (total === 0) {
        throw new MDError(`No analysts for ${symbol}`, 'NO_DATA', 404)
      }

      const buyPercent = (ratings.buyCount / total) * 100
      const holdPercent = (ratings.holdCount / total) * 100
      const sellPercent = (ratings.sellCount / total) * 100

      const percentages = [
        { pct: buyPercent, type: 'buy' as const },
        { pct: holdPercent, type: 'hold' as const },
        { pct: sellPercent, type: 'sell' as const },
      ]

      const dominant = percentages.reduce((a, b) => (a.pct > b.pct ? a : b))

      return {
        symbol,
        hasBias: dominant.pct > 70,
        dominantPercentage: dominant.pct,
        dominantRating: dominant.type,
        totalAnalysts: total,
      }
    } catch (err) {
      if (err instanceof MDError) throw err
      const message = err instanceof Error ? err.message : String(err)
      throw new MDError(`Failed to detect bias for ${symbol}: ${message}`, 'NETWORK_ERROR', 500)
    }
  }

  /**
   * Normalize Buy/Hold/Sell counts to sentiment score [-1, 1].
   * @internal
   */
  private normalizeSentiment(ratings: AnalystRating): number {
    const total = ratings.buyCount + ratings.holdCount + ratings.sellCount
    if (total === 0) return 0

    // Simple linear normalization: (buy - sell) / total
    const sentiment = (ratings.buyCount - ratings.sellCount) / total
    return Math.max(-1, Math.min(1, sentiment))
  }

  /**
   * Simulate fetching analyst ratings from API.
   * @internal
   */
  private async fetchRatingsFromAPI(symbol: string): Promise<AnalystRating> {
    // In production, this would call:
    // const response = await fetch(`${this.apiBaseUrl}/analysts/ratings?symbol=${symbol}`, {
    //   headers: { 'Authorization': `Bearer ${this.apiKey}` }
    // })
    // const data = await response.json()
    // return this.parseRatings(data)

    // For now, return mock data based on symbol hash
    const hash = symbol.split('').reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0)
    const rng = Math.abs(hash) % 100

    const buyCount = 5 + Math.floor((rng * 20) / 100)
    const holdCount = 3 + Math.floor(((rng + 30) % 100) * 20 / 100)
    const sellCount = 2 + Math.floor(((rng + 60) % 100) * 20 / 100)

    return {
      symbol,
      buyCount,
      holdCount,
      sellCount,
      consensus: this.getConsensus(buyCount, holdCount, sellCount),
      avgTarget: 100 + (rng * 100) / 100,
      timestamp: Date.now(),
    }
  }

  /**
   * Determine consensus rating from counts.
   * @internal
   */
  private getConsensus(buy: number, hold: number, sell: number): 'buy' | 'hold' | 'sell' {
    const ratings = [
      { count: buy, type: 'buy' as const },
      { count: hold, type: 'hold' as const },
      { count: sell, type: 'sell' as const },
    ]
    return ratings.reduce((a, b) => (a.count > b.count ? a : b)).type
  }

  /**
   * Debug logging.
   * @internal
   */
  private log(msg: string): void {
    if (this.debug) {
      console.log(`[ClearStreet] ${msg}`)
    }
  }
}

/**
 * Plugin: register Clear Street sentiment provider.
 *
 * @example
 * ```ts
 * import { name, inject, apply } from '@deepseek-ai/dsh-market-data-clear-street'
 *
 * export { name, inject, apply }
 * ```
 */
export const name = 'market-data-clear-street'

export const inject = []

export function apply(ctx: Context, config: ClearStreetConfig = {}) {
  const provider = new ClearStreetSentimentProvider(ctx, config)
  // Note: To fully integrate with market-data registry, call:
  // ctx.get('marketData')?.register(provider)
}
