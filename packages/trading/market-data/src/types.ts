/**
 * Market data types: quotes, historical bars, subscriptions, and provider contracts.
 *
 * @module @deepseek-ai/dsh-market-data/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Opaque market data subscription handle, branded to prevent cross-provider confusion. */
export type SubscriptionId = Branded<string, 'market-data:subscription-id'>

/** OHLCV bar interval identifier (1m, 5m, 15m, 1h, 1d). */
export type BarInterval = '1m' | '5m' | '15m' | '1h' | '1d'

/** Provider identifier (e.g., 'robinhood', 'polymarket', 'browser'). */
export type MarketDataProvider = string

/**
 * Complete real-time quote for one symbol: price, bid/ask, volume,
 * and optional derivative Greeks (for options).
 */
export interface Quote {
  /** Symbol or instrument identifier. */
  symbol: string
  /** Last trade price. */
  price: number
  /** Bid price (best buyer). */
  bid: number
  /** Ask price (best seller). */
  ask: number
  /** Last trade timestamp (milliseconds since epoch). */
  timestamp: number
  /** 24-hour volume (base asset). */
  volume: number
  /** Percent change from previous close. */
  changePercent: number
  /** Optional Greeks for options (delta, gamma, vega, theta). */
  greeks?: {
    /** Delta: sensitivity to 1 point move in underlying. */
    delta: number
    /** Gamma: rate of delta change. */
    gamma: number
    /** Vega: sensitivity to 1% IV move. */
    vega: number
    /** Theta: daily time decay. */
    theta: number
  }
  /** Optional IV (implied volatility) for options. */
  impliedVolatility?: number
  /** Optional underlying symbol (for derivatives). */
  underlyingSymbol?: string
  /** Optional expiration date (ISO string, for options). */
  expirationDate?: string
}

/**
 * OHLCV bar: open, high, low, close, volume for a time interval.
 */
export interface Bar {
  /** Open price. */
  open: number
  /** High price. */
  high: number
  /** Low price. */
  low: number
  /** Close price. */
  close: number
  /** Volume (base asset). */
  volume: number
  /** Bar timestamp (milliseconds since epoch). */
  timestamp: number
}

/**
 * Sentiment metric for one symbol: aggregated from browser data,
 * news, and social sources.
 */
export interface Sentiment {
  /** Symbol. */
  symbol: string
  /** Sentiment score, -1 (bearish) to 1 (bullish), 0 (neutral). */
  score: number
  /** Number of data points aggregated. */
  sampleCount: number
  /** Timestamp of aggregation (milliseconds since epoch). */
  timestamp: number
  /** Optional source breakdown: { 'twitter': 0.6, 'news': -0.1, 'sentiment-ai': 0.8 }. */
  sourceScores?: Record<string, number>
}

/**
 * Callback invoked when a subscription receives a new quote update.
 */
export type QuoteSubscriptionCallback = (quote: Quote) => void | Promise<void>

/**
 * Subscription handle returned by {@link MarketDataService.subscribe}.
 * Call `dispose()` to unsubscribe; dispose is idempotent.
 */
export interface QuoteSubscription {
  /** Subscription identity, unique within the service instance. */
  readonly id: SubscriptionId
  /** Dispose the subscription and stop receiving updates. Idempotent. */
  dispose(): void
}

/**
 * Error thrown when a market data operation fails: network, provider unavailable, or invalid parameters.
 */
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

/**
 * Market data service definition: unified interface for quotes, bars, sentiment,
 * and real-time subscriptions. Consumers resolve this service to query market data
 * across multiple underlying providers (Robinhood, Polymarket, browser scraper).
 *
 * @example
 * ```ts
 * // In a consumer plugin:
 * ctx.inject(['marketData'], (ctx, marketData) => {
 *   const quote = await marketData.getQuote('SPY')
 *   const bars = await marketData.getBars('SPY', '1h', 24)
 *   const sub = marketData.subscribe('QQQ', quote => console.log(quote.price))
 * })
 * ```
 */
export interface MarketDataService {
  /**
   * Fetch a real-time quote for one symbol.
   *
   * @param symbol - Instrument identifier (ticker or option contract).
   * @param provider - Optional provider filter; uses first available if omitted.
   * @returns Current quote with price, Greeks (if applicable), and metadata.
   * @throws {@link MarketDataError} on network, auth, or symbol-not-found errors.
   */
  getQuote(symbol: string, provider?: MarketDataProvider): Promise<Quote>

  /**
   * Fetch historical OHLCV bars for one symbol.
   *
   * @param symbol - Instrument identifier.
   * @param interval - Bar granularity: 1m, 5m, 15m, 1h, 1d.
   * @param count - Maximum number of bars to return (most recent first). Common: 20-100.
   * @param provider - Optional provider filter; uses first available if omitted.
   * @returns Array of bars in ascending time order (oldest first).
   * @throws {@link MarketDataError} on network, auth, or symbol-not-found errors.
   */
  getBars(
    symbol: string,
    interval: BarInterval,
    count: number,
    provider?: MarketDataProvider,
  ): Promise<readonly Bar[]>

  /**
   * Subscribe to real-time quote updates for one symbol. Callback is invoked
   * whenever a new quote becomes available (typically 100ms-1s).
   *
   * @param symbol - Instrument identifier.
   * @param callback - Invoked on each quote update; may be async (awaited).
   * @param provider - Optional provider filter; uses first available if omitted.
   * @returns Subscription handle with {@link QuoteSubscription.dispose} to unsubscribe.
   * @throws {@link MarketDataError} on network, auth, or symbol-not-found errors.
   *
   * @example
   * ```ts
   * const sub = marketData.subscribe('BTC/USD', quote => {
   *   console.log(`New quote: $${quote.price}`)
   * })
   * // Later:
   * sub.dispose()
   * ```
   */
  subscribe(
    symbol: string,
    callback: QuoteSubscriptionCallback,
    provider?: MarketDataProvider,
  ): Promise<QuoteSubscription>

  /**
   * Fetch aggregated sentiment for one or more symbols.
   *
   * @param symbols - Array of instrument identifiers.
   * @param provider - Optional provider filter; uses browser scraper if omitted.
   * @returns Array of sentiment metrics.
   * @throws {@link MarketDataError} on network or scraper errors.
   */
  getSentiment(symbols: readonly string[], provider?: MarketDataProvider): Promise<readonly Sentiment[]>
}
