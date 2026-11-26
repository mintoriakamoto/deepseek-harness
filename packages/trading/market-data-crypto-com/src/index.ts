/**
 * Crypto.com authless provider for market data: real-time crypto quotes, order book depth,
 * and candlestick bars.
 *
 * Uses public Crypto.com REST API endpoints (no authentication required) to fetch:
 * - Live quotes: get_tickers endpoint for price, bid/ask, volume
 * - Order book: order book depth data
 * - Historical bars: candlestick data at various intervals
 *
 * No subscription support (REST-only, not websocket-based).
 *
 * @module @deepseek-ai/dsh-market-data-crypto-com
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
import { z } from 'zod'

/**
 * Configuration for Crypto.com market data provider.
 */
export interface CryptocomMarketDataConfig {
  /** Crypto.com API base URL (default: https://api.crypto.com/exchange/v1). */
  baseUrl?: string
  /** Request timeout in milliseconds (default: 10000). */
  timeoutMs?: number
  /** Enable debug logging. */
  debug?: boolean
  /** Cache TTL in milliseconds (default: 1000 for quotes, 5000 for bars). */
  cacheTtlMs?: number
}

/**
 * Response from Crypto.com get_tickers endpoint.
 * @internal
 */
const CryptocomTickerSchema = z.object({
  i: z.string(), // instrument name
  b: z.number(), // best bid
  k: z.number(), // best ask
  a: z.number(), // last price
  t: z.number(), // timestamp
  v: z.number(), // volume
})

/**
 * Response from Crypto.com get_tickers (array of tickers).
 * @internal
 */
const CryptocomTickersResponseSchema = z.object({
  result: z.object({
    data: z.array(CryptocomTickerSchema),
  }),
})

/**
 * Response from Crypto.com get_book endpoint.
 * @internal
 */
const CryptocomOrderBookSchema = z.object({
  result: z.object({
    data: z.array(
      z.object({
        asks: z.array(z.tuple([z.number(), z.number()])),
        bids: z.array(z.tuple([z.number(), z.number()])),
        t: z.number(),
      }),
    ),
  }),
})

/**
 * Response from Crypto.com candlesticks endpoint.
 * @internal
 */
const CryptocomCandleSchema = z.object({
  o: z.number(), // open
  h: z.number(), // high
  l: z.number(), // low
  c: z.number(), // close
  v: z.number(), // volume
  t: z.number(), // timestamp
})

/**
 * Response from Crypto.com candlesticks (array of candles).
 * @internal
 */
const CryptocomCandlesResponseSchema = z.object({
  result: z.object({
    data: z.array(CryptocomCandleSchema),
  }),
})

/**
 * Cached quote with timestamp.
 * @internal
 */
interface CachedQuote {
  quote: Quote
  timestamp: number
}

/**
 * Crypto.com provider: implements quotes, bars, and order book via public REST API.
 *
 * Maps Crypto.com public API endpoints to market data types. No authentication required.
 * Does NOT support subscriptions or sentiment (REST-only).
 */
export class CryptocomMarketDataProvider implements MarketDataProvider {
  readonly name = 'crypto-com'

  private baseUrl: string
  private timeoutMs: number
  private debug: boolean
  private cacheTtlMs: number
  private quoteCache: Map<string, CachedQuote> = new Map()

  constructor(_ctx: Context, config: CryptocomMarketDataConfig = {}) {
    this.baseUrl = config.baseUrl ?? 'https://api.crypto.com/exchange/v1'
    this.timeoutMs = config.timeoutMs ?? 10_000
    this.debug = config.debug ?? false
    this.cacheTtlMs = config.cacheTtlMs ?? 1000
  }

  /**
   * Fetch a real-time quote for one symbol (e.g., BTC_USD, ETH_USDT).
   *
   * Calls Crypto.com get_tickers endpoint. Returns cached result if TTL not expired.
   */
  async getQuote(symbol: string): Promise<Quote> {
    this.log(`getQuote(${symbol})`)

    // Check cache first
    const cached = this.quoteCache.get(symbol)
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      this.log(`getQuote(${symbol}) — returning cached quote`)
      return cached.quote
    }

    try {
      const response = await this.fetchTicker(symbol)
      const quote = this.tickerToQuote(response)
      this.quoteCache.set(symbol, { quote, timestamp: Date.now() })
      return quote
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new MDError(
        `Failed to fetch quote for ${symbol} from Crypto.com: ${message}`,
        'NETWORK_ERROR',
        500,
      )
    }
  }

  /**
   * Fetch historical OHLCV bars from Crypto.com.
   *
   * Calls Crypto.com candlesticks endpoint. Interval must be one of: 1m, 5m, 15m, 1h, 1d.
   */
  async getBars(symbol: string, interval: BarInterval, count: number): Promise<readonly Bar[]> {
    this.log(`getBars(${symbol}, ${interval}, ${count})`)

    try {
      const response = await this.fetchCandles(symbol, interval, count)
      return response.map(candle => ({
        open: candle.o,
        high: candle.h,
        low: candle.l,
        close: candle.c,
        volume: candle.v,
        timestamp: candle.t,
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new MDError(
        `Failed to fetch bars for ${symbol} from Crypto.com: ${message}`,
        'NETWORK_ERROR',
        500,
      )
    }
  }

  /**
   * Fetch order book depth for one symbol.
   *
   * Public helper (not part of base MarketDataProvider interface).
   * Calls Crypto.com get_book endpoint.
   */
  async getOrderBook(symbol: string): Promise<OrderBook> {
    this.log(`getOrderBook(${symbol})`)

    try {
      const response = await this.fetchOrderBook(symbol)
      return response
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new MDError(
        `Failed to fetch order book for ${symbol} from Crypto.com: ${message}`,
        'NETWORK_ERROR',
        500,
      )
    }
  }

  /**
   * Subscriptions not supported by Crypto.com provider (REST-only).
   */
  async subscribe(
    _symbol: string,
    _callback: QuoteSubscriptionCallback,
  ): Promise<QuoteSubscription> {
    this.log('subscribe() — not supported for Crypto.com (REST-only)')
    throw new MDError(
      'Crypto.com provider does not support subscriptions. Use `dsh-market-data-robinhood` or deploy websocket provider.',
      'OPERATION_NOT_SUPPORTED',
    )
  }

  /**
   * Sentiment not supported by Crypto.com provider.
   */
  async getSentiment(_symbols: readonly string[]): Promise<readonly Sentiment[]> {
    this.log('getSentiment() — not supported for Crypto.com')
    return []
  }

  /**
   * Fetch ticker data from Crypto.com API.
   * @internal
   */
  private async fetchTicker(symbol: string): Promise<Quote> {
    const url = `${this.baseUrl}/public/get-tickers?instrument_name=${symbol}`
    const response = await this.fetch(url)
    const parsed = CryptocomTickersResponseSchema.parse(response)

    if (!parsed.result.data || parsed.result.data.length === 0) {
      throw new Error(`Symbol not found: ${symbol}`)
    }

    return this.tickerToQuote(parsed.result.data[0])
  }

  /**
   * Fetch order book from Crypto.com API.
   * @internal
   */
  private async fetchOrderBook(symbol: string): Promise<OrderBook> {
    const url = `${this.baseUrl}/public/get-book?instrument_name=${symbol}&depth=10`
    const response = await this.fetch(url)
    const parsed = CryptocomOrderBookSchema.parse(response)

    if (!parsed.result.data || parsed.result.data.length === 0) {
      throw new Error(`Order book not found: ${symbol}`)
    }

    const book = parsed.result.data[0]
    return {
      symbol,
      timestamp: book.t,
      bids: book.bids.map(([price, size]) => ({ price, size })),
      asks: book.asks.map(([price, size]) => ({ price, size })),
    }
  }

  /**
   * Fetch candlesticks from Crypto.com API.
   * @internal
   */
  private async fetchCandles(
    symbol: string,
    interval: BarInterval,
    count: number,
  ): Promise<typeof CryptocomCandleSchema._type[]> {
    // Map BarInterval to Crypto.com period granularity
    const periodMap: Record<BarInterval, string> = {
      '1m': '1m',
      '5m': '5m',
      '15m': '15m',
      '1h': '1h',
      '1d': '1d',
    }

    const url = `${this.baseUrl}/public/get-candlestick?instrument_name=${symbol}&period=${periodMap[interval]}&count=${count}`
    const response = await this.fetch(url)
    const parsed = CryptocomCandlesResponseSchema.parse(response)

    if (!parsed.result.data) {
      return []
    }

    return parsed.result.data
  }

  /**
   * Convert Crypto.com ticker to Quote format.
   * @internal
   */
  private tickerToQuote(ticker: z.infer<typeof CryptocomTickerSchema>): Quote {
    return {
      symbol: ticker.i,
      price: ticker.a,
      bid: ticker.b,
      ask: ticker.k,
      timestamp: ticker.t,
      volume: ticker.v,
      changePercent: 0, // Crypto.com API doesn't provide change percent; computed separately if needed
    }
  }

  /**
   * HTTP fetch with timeout and error handling.
   * @internal
   */
  private async fetch(url: string): Promise<unknown> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': '@deepseek-ai/dsh-market-data-crypto-com',
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
      console.log(`[CryptocomMarketData] ${msg}`)
    }
  }
}

/**
 * Order book structure: bids and asks with price/size tuples.
 */
export interface OrderBook {
  /** Symbol. */
  symbol: string
  /** Bid levels: [{ price, size }, ...] in descending price order. */
  bids: Array<{ price: number; size: number }>
  /** Ask levels: [{ price, size }, ...] in ascending price order. */
  asks: Array<{ price: number; size: number }>
  /** Timestamp when book was captured (milliseconds since epoch). */
  timestamp: number
}

/**
 * Plugin: register Crypto.com market data provider.
 *
 * @example
 * ```ts
 * import { name, inject, apply } from '@deepseek-ai/dsh-market-data-crypto-com'
 *
 * export { name, inject, apply }
 * ```
 */
export const name = 'market-data-crypto-com'

export const inject = ['marketData']

export function apply(ctx: Context, config: CryptocomMarketDataConfig = {}) {
  const provider = new CryptocomMarketDataProvider(ctx, config)
  ctx.marketData.register(provider)
}
