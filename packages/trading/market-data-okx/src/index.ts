/**
 * OKX REST API adapter for market data: real-time crypto quotes, order book depth,
 * and historical OHLCV bars for multiple crypto trading pairs.
 *
 * Uses OKX public REST endpoints to fetch quotes, order books, and historical data.
 * Subscriptions are simulated through polling (configurable interval).
 *
 * @module @deepseek-ai/dsh-market-data-okx
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
import { createSubscriptionId, MarketDataError as MDError } from '@deepseek-ai/dsh-market-data'

/**
 * Configuration for OKX market data provider.
 */
export interface OKXMarketDataConfig {
  /** Base URL for OKX API (default: "https://www.okx.com/api/v5"). */
  baseUrl?: string
  /** Polling interval for subscriptions, milliseconds (default: 1000). */
  subscriptionPollingIntervalMs?: number
  /** Request timeout, milliseconds (default: 10000). */
  timeoutMs?: number
  /** Enable debug logging. */
  debug?: boolean
}

/**
 * OKX provider: implements quotes, order book, bars, and subscriptions via REST API.
 *
 * Maps OKX REST API endpoints to market data types. Requires internet connectivity
 * to reach the OKX public API.
 */
export class OKXMarketDataProvider implements MarketDataProvider {
  readonly name = 'okx'

  private baseUrl: string
  private subscriptionPollingIntervalMs: number
  private timeoutMs: number
  private debug: boolean

  constructor(_ctx: Context, config: OKXMarketDataConfig = {}) {
    this.baseUrl = config.baseUrl ?? 'https://www.okx.com/api/v5'
    this.subscriptionPollingIntervalMs = config.subscriptionPollingIntervalMs ?? 1000
    this.timeoutMs = config.timeoutMs ?? 10000
    this.debug = config.debug ?? false
  }

  /**
   * Fetch a real-time quote for one crypto symbol.
   *
   * Calls OKX `/market/ticker` endpoint to get current price and volume data.
   * Supports crypto pairs like BTC-USDT, ETH-USDT, etc.
   */
  async getQuote(symbol: string): Promise<Quote> {
    this.log(`getQuote(${symbol})`)

    try {
      const instId = this.normalizeSymbol(symbol)
      const url = `${this.baseUrl}/market/ticker?instId=${instId}`

      const response = await this.fetchWithTimeout(url)
      if (!response.code || response.code !== '0') {
        throw new Error(response.msg || 'OKX API error')
      }

      if (!response.data || response.data.length === 0) {
        throw new Error(`No data returned for ${symbol}`)
      }

      const data = response.data[0]
      const quote: Quote = {
        symbol,
        price: parseFloat(data.last),
        bid: parseFloat(data.bidPx),
        ask: parseFloat(data.askPx),
        timestamp: parseInt(data.ts),
        volume: parseFloat(data.vol24h),
        changePercent: parseFloat(data.change24h) * 100, // OKX returns as decimal, convert to percent
      }

      return quote
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new MDError(`Failed to fetch quote for ${symbol}: ${message}`, 'NETWORK_ERROR', 500)
    }
  }

  /**
   * Fetch order book depth for a crypto symbol.
   *
   * Calls OKX `/market/books` endpoint to get current order book state.
   * Returns aggregated bid/ask prices at specified depth level.
   *
   * @internal Used for liquidity analysis and slippage estimation.
   */
  async getOrderBook(
    symbol: string,
    depth: number = 10,
  ): Promise<{ bids: Array<[number, number]>; asks: Array<[number, number]> }> {
    this.log(`getOrderBook(${symbol}, depth=${depth})`)

    try {
      const instId = this.normalizeSymbol(symbol)
      const sz = Math.min(depth, 400) // OKX max is 400
      const url = `${this.baseUrl}/market/books?instId=${instId}&sz=${sz}`

      const response = await this.fetchWithTimeout(url)
      if (!response.code || response.code !== '0') {
        throw new Error(response.msg || 'OKX API error')
      }

      if (!response.data || response.data.length === 0) {
        throw new Error(`No order book data for ${symbol}`)
      }

      const data = response.data[0]
      const bids = (data.bids || []).slice(0, depth).map((bid: string[]) => [parseFloat(bid[0]), parseFloat(bid[1])])
      const asks = (data.asks || []).slice(0, depth).map((ask: string[]) => [parseFloat(ask[0]), parseFloat(ask[1])])

      return { bids, asks }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new MDError(`Failed to fetch order book for ${symbol}: ${message}`, 'NETWORK_ERROR', 500)
    }
  }

  /**
   * Fetch historical OHLCV bars from OKX.
   *
   * Calls OKX `/market/candles` endpoint to get historical price data.
   * Maps BarInterval to OKX bar granularity parameter.
   */
  async getBars(symbol: string, interval: BarInterval, count: number): Promise<readonly Bar[]> {
    this.log(`getBars(${symbol}, ${interval}, ${count})`)

    try {
      const instId = this.normalizeSymbol(symbol)
      const bar = this.intervalToOKXBar(interval)

      // OKX API returns up to 100 candles per request; fetch iteratively if needed
      const limit = Math.min(count, 100)
      const url = `${this.baseUrl}/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`

      const response = await this.fetchWithTimeout(url)
      if (!response.code || response.code !== '0') {
        throw new Error(response.msg || 'OKX API error')
      }

      if (!response.data || response.data.length === 0) {
        throw new Error(`No bar data for ${symbol}`)
      }

      // OKX returns newest first; reverse to chronological order
      const bars = response.data
        .slice(0, count)
        .reverse()
        .map((candle: string[]) => ({
          timestamp: parseInt(candle[0]),
          open: parseFloat(candle[1]),
          high: parseFloat(candle[2]),
          low: parseFloat(candle[3]),
          close: parseFloat(candle[4]),
          volume: parseFloat(candle[5]),
        }))

      return bars
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new MDError(`Failed to fetch bars for ${symbol}: ${message}`, 'NETWORK_ERROR', 500)
    }
  }

  /**
   * Subscribe to real-time quote updates via polling.
   *
   * Returns immediately with a subscription handle. Callback is invoked periodically
   * as new quotes become available.
   */
  async subscribe(
    symbol: string,
    callback: QuoteSubscriptionCallback,
  ): Promise<QuoteSubscription> {
    this.log(`subscribe(${symbol})`)

    const subscriptionId = createSubscriptionId()
    let disposed = false
    let lastPrice: number | null = null

    // Start polling
    const pollInterval = setInterval(async () => {
      if (disposed) return

      try {
        const quote = await this.getQuote(symbol)
        // Only call callback if price changed (or first call)
        if (lastPrice === null || lastPrice !== quote.price) {
          lastPrice = quote.price
          await callback(quote)
        }
      } catch (err) {
        this.log(`Subscription poll error: ${err instanceof Error ? err.message : String(err)}`)
      }
    }, this.subscriptionPollingIntervalMs)

    return {
      id: subscriptionId,
      dispose: () => {
        if (!disposed) {
          disposed = true
          clearInterval(pollInterval)
          this.log(`Subscription ${subscriptionId} disposed`)
        }
      },
    }
  }

  /**
   * Sentiment not supported by OKX provider (returns empty).
   */
  async getSentiment(_symbols: readonly string[]): Promise<readonly Sentiment[]> {
    this.log('getSentiment() — not supported, returning empty')
    return []
  }

  /**
   * Normalize symbol to OKX format (e.g., "BTC-USDT").
   * @internal
   */
  private normalizeSymbol(symbol: string): string {
    // If already in OKX format (contains dash), return as-is
    if (symbol.includes('-')) {
      return symbol
    }
    // Simple assumption: append -USDT if no dash
    // For BTC-USDT, ETH-USDT, etc.
    return `${symbol}-USDT`
  }

  /**
   * Convert BarInterval to OKX bar granularity parameter.
   * @internal
   */
  private intervalToOKXBar(interval: BarInterval): string {
    const map: Record<BarInterval, string> = {
      '1m': '1m',
      '5m': '5m',
      '15m': '15m',
      '1h': '1H',
      '1d': '1D',
    }
    return map[interval]
  }

  /**
   * Fetch with timeout wrapper.
   * @internal
   */
  private async fetchWithTimeout(url: string): Promise<any> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'DeepSeek-Harness/1.0',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Debug logging.
   * @internal
   */
  private log(msg: string): void {
    if (this.debug) {
      console.log(`[OKXMarketData] ${msg}`)
    }
  }
}

/**
 * Plugin: register OKX market data provider.
 *
 * @example
 * ```ts
 * import { name, inject, apply } from '@deepseek-ai/dsh-market-data-okx'
 *
 * export { name, inject, apply }
 * ```
 */
export const name = 'market-data-okx'

export const inject = ['marketData']

export function apply(ctx: Context, config: OKXMarketDataConfig = {}) {
  const provider = new OKXMarketDataProvider(ctx, config)
  ctx.marketData.register(provider)
}
