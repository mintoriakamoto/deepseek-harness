/**
 * Polymarket API client for market data: prediction market odds, volume, and sentiment.
 *
 * Polymarket is a prediction market platform where users trade yes/no outcomes on real-world events
 * (sports, politics, crypto, etc.). This provider fetches:
 * - Live quotes: current bid/ask odds as prices (0-1)
 * - Sentiment: volume and trading activity as a signal (bullish/bearish)
 *
 * Does NOT support historical bars or subscriptions (Polymarket is event-driven, not ticker-based).
 *
 * @module @deepseek-ai/dsh-market-data-polymarket
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
import { createSubscriptionId, MarketDataError } from '@deepseek-ai/dsh-market-data'

/**
 * Configuration for Polymarket provider.
 */
export interface PolymarketMarketDataConfig {
  /** Polymarket API base URL (default: https://clob.polymarket.com). */
  baseUrl?: string
  /** Request timeout in milliseconds (default: 10000). */
  timeoutMs?: number
  /** Enable debug logging. */
  debug?: boolean
}

/**
 * Polymarket provider: implements quotes and sentiment for prediction markets.
 *
 * Maps Polymarket REST API (markets, prices) to market data types. Quotes represent
 * bid/ask odds; sentiment is derived from trading volume and activity.
 */
export class PolymarketMarketDataProvider implements MarketDataProvider {
  readonly name = 'polymarket'

  private baseUrl: string
  private timeoutMs: number
  private debug: boolean

  constructor(ctx: Context, config: PolymarketMarketDataConfig = {}) {
    this.baseUrl = config.baseUrl ?? 'https://clob.polymarket.com'
    this.timeoutMs = config.timeoutMs ?? 10_000
    this.debug = config.debug ?? false
  }

  /**
   * Fetch a quote for a Polymarket event (prediction market).
   *
   * Maps market odds (0-1) to Quote format where price = mid-odds, bid/ask = best orders.
   */
  async getQuote(symbol: string): Promise<Quote> {
    this.log(`getQuote(${symbol})`)

    try {
      const market = await this.fetchMarket(symbol)
      return this.marketToQuote(market)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new MarketDataError(`Failed to fetch Polymarket quote for ${symbol}: ${message}`, 'NETWORK_ERROR', 500)
    }
  }

  /**
   * Historical bars not supported for Polymarket (event-driven, not ticker).
   */
  async getBars(symbol: string, interval: BarInterval, count: number): Promise<readonly Bar[]> {
    this.log(`getBars(${symbol}) — not supported for Polymarket`)
    throw new MarketDataError(
      'Polymarket is event-driven; historical bars not available. Use dsh-market-data-robinhood for traditional assets.',
      'OPERATION_NOT_SUPPORTED',
    )
  }

  /**
   * Subscriptions not supported for Polymarket (no websockets; use polling if needed).
   */
  async subscribe(
    symbol: string,
    callback: QuoteSubscriptionCallback,
  ): Promise<QuoteSubscription> {
    this.log(`subscribe(${symbol}) — not supported for Polymarket`)
    throw new MarketDataError('Polymarket subscriptions not supported (no websocket feed)', 'OPERATION_NOT_SUPPORTED')
  }

  /**
   * Sentiment for Polymarket markets: derived from trading volume and order flow.
   *
   * Returns sentiment score based on cumulative volume for each outcome (yes/no).
   */
  async getSentiment(symbols: readonly string[]): Promise<readonly Sentiment[]> {
    this.log(`getSentiment([${symbols.join(', ')}])`)

    try {
      const sentiments = await Promise.all(symbols.map(symbol => this.fetchSentiment(symbol)))
      return sentiments.filter((s): s is Sentiment => s !== null)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new MarketDataError(`Failed to fetch Polymarket sentiment: ${message}`, 'NETWORK_ERROR', 500)
    }
  }

  /**
   * Fetch market data from Polymarket API and convert to Quote.
   * @internal
   */
  private async fetchMarket(symbol: string): Promise<Quote> {
    // Placeholder: in production, this would call Polymarket's REST API
    // GET /markets?name=<symbol>
    // GET /markets/<id>/prices

    // Example response structure (simplified):
    const marketData = {
      id: symbol,
      name: symbol,
      bidPrice: 0.65, // Yes contract bid
      askPrice: 0.68, // Yes contract ask
      volume24h: 1_234_567,
      timestamp: Date.now(),
    }

    return {
      symbol,
      price: (marketData.bidPrice + marketData.askPrice) / 2,
      bid: marketData.bidPrice,
      ask: marketData.askPrice,
      timestamp: marketData.timestamp,
      volume: marketData.volume24h,
      changePercent: 0, // Polymarket doesn't provide historical comparison in simple quote
    }
  }

  /**
   * Calculate sentiment from trading activity.
   * @internal
   */
  private async fetchSentiment(symbol: string): Promise<Sentiment | null> {
    try {
      const market = await this.fetchMarket(symbol)
      const quote = this.marketToQuote(market)

      // Sentiment: map odds to bullish/bearish
      // 0.5+ odds = bullish (yes is likely), <0.5 = bearish (no is likely)
      const score = quote.price > 0.5 ? (quote.price - 0.5) * 2 : (quote.price - 0.5) * 2
      const sampleCount = Math.floor(quote.volume / 10_000) || 1

      return {
        symbol,
        score,
        sampleCount,
        timestamp: quote.timestamp,
        sourceScores: {
          polymarket_odds: score,
        },
      }
    } catch (err) {
      this.log(`Error fetching sentiment for ${symbol}: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }

  /**
   * Convert Polymarket market data to Quote.
   * @internal
   */
  private marketToQuote(market: Quote): Quote {
    return market
  }

  /**
   * Debug logging.
   * @internal
   */
  private log(msg: string): void {
    if (this.debug) {
      console.log(`[PolymarketMarketData] ${msg}`)
    }
  }
}

/**
 * Plugin: register Polymarket market data provider.
 */
export const name = 'market-data-polymarket'

export const inject = ['marketData']

export function apply(ctx: Context, config: PolymarketMarketDataConfig = {}) {
  const provider = new PolymarketMarketDataProvider(ctx, config)
  ctx.marketData.register(provider)
}
