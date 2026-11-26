/**
 * CoinMarketCap on-chain provider: whale wallet distribution, exchange inflows,
 * and derived sentiment from on-chain activity metrics.
 *
 * Maps on-chain signals to market data types: whale concentration, exchange inflows,
 * and regulatory activity translate to sentiment scores normalized to [-1, 1].
 *
 * @module @deepseek-ai/dsh-market-data-coinmarketcap
 */

import { Context } from '@deepseek-ai/cordis'
import type {
  MarketDataProvider,
  Sentiment,
} from '@deepseek-ai/dsh-market-data'
import { MarketDataError as MDError } from '@deepseek-ai/dsh-market-data'

/**
 * On-chain metrics: whale wallet distribution and exchange inflows.
 */
export interface OnChainMetrics {
  /** Symbol. */
  symbol: string
  /** Whale wallet distribution: percentage of token supply held by top 10 addresses. */
  whaleConcentration: number
  /** Exchange inflow: tokens flowing into exchange wallets (24h), normalized to [-1, 1]. */
  exchangeInflowScore: number
  /** Whale wallet transaction activity (number of large transactions in 24h). */
  whaleActivityCount: number
  /** Timestamp of metrics collection (milliseconds since epoch). */
  timestamp: number
}

/**
 * Configuration for CoinMarketCap on-chain provider.
 */
export interface CoinMarketCapOnChainConfig {
  /** Enable debug logging. */
  debug?: boolean
  /** Cache TTL in milliseconds (default: 60000). */
  cacheTtlMs?: number
  /** Whale concentration threshold: address concentration above this % triggers bearish signal. */
  whaleThresholdPercent?: number
  /** Exchange inflow threshold: when exchange inflow score exceeds this, triggers bearish signal. */
  exchangeInflowThreshold?: number
}

/**
 * CoinMarketCap on-chain provider: implements sentiment via on-chain metrics.
 *
 * Derives sentiment from whale wallet distribution and exchange inflows:
 * - High whale concentration (>50% in top 10): bearish (-1 to -0.3)
 * - High exchange inflow (>0.5): bearish (-1 to -0.3)
 * - Both conditions: strongly bearish (-1)
 * - Neither condition: neutral to bullish (0 to 1)
 */
export class CoinMarketCapOnChainProvider implements MarketDataProvider {
  readonly name = 'coinmarketcap-onchain'

  private debug: boolean
  private cacheTtlMs: number
  private whaleThresholdPercent: number
  private exchangeInflowThreshold: number

  /** In-memory cache: symbol -> { metrics, timestamp } */
  private metricsCache = new Map<string, { metrics: OnChainMetrics; timestamp: number }>()

  constructor(_ctx: Context, config: CoinMarketCapOnChainConfig = {}) {
    this.debug = config.debug ?? false
    this.cacheTtlMs = config.cacheTtlMs ?? 60_000
    this.whaleThresholdPercent = config.whaleThresholdPercent ?? 50
    this.exchangeInflowThreshold = config.exchangeInflowThreshold ?? 0.5
  }

  /**
   * Get on-chain metrics for a symbol: whale wallet distribution and exchange inflows.
   *
   * Returns cached metrics if available and not expired; otherwise fetches fresh data.
   * In production, this would query the CoinMarketCap API or on-chain data provider.
   */
  async getOnChainMetrics(symbol: string): Promise<OnChainMetrics> {
    this.log(`getOnChainMetrics(${symbol})`)

    // Check cache first
    const cached = this.metricsCache.get(symbol)
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      this.log(`Cache hit for ${symbol}`)
      return cached.metrics
    }

    try {
      // In production, fetch from CoinMarketCap API or blockchain data provider
      // For now, generate realistic mock data
      const metrics = this.generateMockMetrics(symbol)

      // Store in cache
      this.metricsCache.set(symbol, { metrics, timestamp: Date.now() })

      return metrics
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new MDError(
        `Failed to fetch on-chain metrics for ${symbol}: ${message}`,
        'NETWORK_ERROR',
        500,
      )
    }
  }

  /**
   * Derive sentiment from on-chain metrics.
   *
   * Sentiment formula:
   * - Start at neutral (0)
   * - Deduct points for whale concentration (bearish signal)
   * - Deduct points for exchange inflow (bearish signal: potential whale dump)
   * - Deduct points for high whale activity (bearish signal: whale movement)
   * - Result normalized to [-1, 1]
   *
   * @param symbols - Array of instrument identifiers.
   * @returns Array of sentiment metrics.
   */
  async getSentiment(symbols: readonly string[]): Promise<readonly Sentiment[]> {
    this.log(`getSentiment([${symbols.join(', ')}])`)

    if (symbols.length === 0) {
      return []
    }

    const sentiments: Sentiment[] = []

    for (const symbol of symbols) {
      try {
        const metrics = await this.getOnChainMetrics(symbol)
        const sentiment = this.deriveSentiment(metrics)
        sentiments.push(sentiment)
      } catch (err) {
        this.log(`Error computing sentiment for ${symbol}: ${err}`)
        // Skip failed symbols; consumer can handle partial results
      }
    }

    return sentiments
  }

  /**
   * Derive sentiment from on-chain metrics.
   * @internal
   */
  private deriveSentiment(metrics: OnChainMetrics): Sentiment {
    let score = 0 // Start neutral

    // Whale concentration: bearish if above threshold
    if (metrics.whaleConcentration > this.whaleThresholdPercent) {
      const concentrationRatio = metrics.whaleConcentration / 100
      score -= 0.5 * concentrationRatio // Up to -0.5
    }

    // Exchange inflow: bearish if above threshold (potential dump)
    if (metrics.exchangeInflowScore > this.exchangeInflowThreshold) {
      score -= 0.3 * metrics.exchangeInflowScore // Up to -0.3
    }

    // Whale activity: bearish if high (potential movement/distribution)
    if (metrics.whaleActivityCount > 10) {
      const activityFactor = Math.min(metrics.whaleActivityCount / 50, 1) // Cap at 1
      score -= 0.2 * activityFactor // Up to -0.2
    }

    // Normalize to [-1, 1]
    score = Math.max(-1, Math.min(1, score))

    return {
      symbol: metrics.symbol,
      score,
      sampleCount: 3, // Whale concentration, exchange inflow, whale activity
      timestamp: metrics.timestamp,
      sourceScores: {
        'whale-concentration': this.scoreWhaleConcentration(metrics.whaleConcentration),
        'exchange-inflow': metrics.exchangeInflowScore,
        'whale-activity': this.scoreWhaleActivity(metrics.whaleActivityCount),
      },
    }
  }

  /**
   * Score whale concentration: 0 to -1, where -1 is highest concentration.
   * @internal
   */
  private scoreWhaleConcentration(concentration: number): number {
    // Scores range: -1 (90%+) to 0 (0%)
    if (concentration < 10) return 0
    if (concentration > 90) return -1
    return -1 * ((concentration - 10) / 80)
  }

  /**
   * Score whale activity: 0 to -1, where -1 is highest activity (50+ txs).
   * @internal
   */
  private scoreWhaleActivity(activityCount: number): number {
    // Scores range: 0 (0 txs) to -1 (50+ txs)
    if (activityCount === 0) return 0
    if (activityCount >= 50) return -1
    return -1 * (activityCount / 50)
  }

  /**
   * Generate mock on-chain metrics for testing and development.
   * @internal
   */
  private generateMockMetrics(symbol: string): OnChainMetrics {
    // Deterministic based on symbol for consistent test results
    const hash = symbol.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
    const seed = hash % 100

    return {
      symbol,
      // Whale concentration: 20-80% (most symbols in reasonable range)
      whaleConcentration: 30 + ((seed * 7) % 50),
      // Exchange inflow: normalized to [-1, 1]
      exchangeInflowScore: ((seed * 5) % 100) / 100 - 0.5,
      // Whale activity: 0-30 large transactions
      whaleActivityCount: (seed * 3) % 30,
      timestamp: Date.now(),
    }
  }

  /**
   * Clear the metrics cache.
   */
  clearCache(): void {
    this.metricsCache.clear()
  }

  /**
   * Log a message if debug mode is enabled.
   * @internal
   */
  private log(message: string): void {
    if (this.debug) {
      console.log(`[CoinMarketCapOnChainProvider] ${message}`)
    }
  }
}

export { MarketDataError as CoinMarketCapError }
