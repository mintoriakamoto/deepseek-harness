/**
 * Alpha Vantage market data provider: fallback source for quotes and historical bars.
 *
 * Implements {@link MarketDataProvider} using the Alpha Vantage HTTP API.
 * Supports real-time quotes and historical OHLCV bars with caching and timeout protection.
 *
 * @internal
 */

import type {
  Bar,
  BarInterval,
  MarketDataProvider,
  Quote,
  Sentiment,
} from '@deepseek-ai/dsh-market-data'
import { MarketDataError as MDError } from '@deepseek-ai/dsh-market-data'
import type { AlphaVantageConfig } from './types.ts'

/**
 * Cached quote with expiration timestamp.
 */
interface CachedQuote {
  quote: Quote
  timestamp: number
}

/**
 * Alpha Vantage market data provider: fallback for quotes and bars.
 *
 * Maps Alpha Vantage HTTP API (GLOBAL_QUOTE, TIME_SERIES functions) to market data types.
 * Implements multi-level error handling, caching, and graceful degradation.
 */
export class AlphaVantageProvider implements MarketDataProvider {
  readonly name = 'alpha-vantage'

  private cache = new Map<string, CachedQuote>()
  private quoteCacheTtlMs: number
  private requestTimeoutMs: number
  private debug: boolean
  private apiKey: string

  constructor(config: AlphaVantageConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.ALPHA_VANTAGE_API_KEY ?? ''
    this.quoteCacheTtlMs = config.quoteCacheTtlMs ?? 5 * 60 * 1000
    this.requestTimeoutMs = config.requestTimeoutMs ?? 10_000
    this.debug = config.debug ?? false

    if (!this.apiKey) {
      this.log('Warning: ALPHA_VANTAGE_API_KEY not set; requests will likely fail')
    }
  }

  /**
   * Fetch a real-time quote for one symbol.
   *
   * Checks cache first (5min TTL by default). Calls Alpha Vantage GLOBAL_QUOTE endpoint.
   * Handles rate limiting, timeouts, and API errors gracefully.
   */
  async getQuote(symbol: string): Promise<Quote> {
    this.log(`getQuote(${symbol})`)

    // Check cache.
    const cached = this.cache.get(symbol)
    if (cached && Date.now() - cached.timestamp < this.quoteCacheTtlMs) {
      this.log(`getQuote(${symbol}) cache hit`)
      return cached.quote
    }

    try {
      const quote = await this.fetchQuoteFromAPI(symbol)
      this.cache.set(symbol, { quote, timestamp: Date.now() })
      return quote
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.log(`getQuote(${symbol}) error: ${message}`)
      throw new MDError(`Failed to fetch quote for ${symbol}: ${message}`, 'NETWORK_ERROR', 500)
    }
  }

  /**
   * Fetch historical OHLCV bars for one symbol.
   *
   * Maps BarInterval to Alpha Vantage TIME_SERIES function (INTRADAY, DAILY, WEEKLY, MONTHLY).
   * Returns bars in ascending time order (oldest first).
   */
  async getBars(symbol: string, interval: BarInterval, count: number): Promise<readonly Bar[]> {
    this.log(`getBars(${symbol}, ${interval}, ${count})`)

    try {
      const bars = await this.fetchBarsFromAPI(symbol, interval, count)
      return bars
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.log(`getBars(${symbol}, ${interval}) error: ${message}`)
      throw new MDError(
        `Failed to fetch bars for ${symbol}: ${message}`,
        'NETWORK_ERROR',
        500,
      )
    }
  }

  /**
   * Sentiment not supported by Alpha Vantage.
   */
  async getSentiment(_symbols: readonly string[]): Promise<readonly Sentiment[]> {
    throw new MDError(
      'Alpha Vantage does not support sentiment data',
      'OPERATION_NOT_SUPPORTED',
    )
  }

  /**
   * Fetch quote from Alpha Vantage API.
   * @internal
   */
  private async fetchQuoteFromAPI(symbol: string): Promise<Quote> {
    const url = this.buildQuoteUrl(symbol)
    const response = await this.fetchWithTimeout(url, this.requestTimeoutMs)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = (await response.json()) as unknown
    return this.parseQuoteResponse(symbol, data)
  }

  /**
   * Fetch bars from Alpha Vantage API.
   * @internal
   */
  private async fetchBarsFromAPI(
    symbol: string,
    interval: BarInterval,
    count: number,
  ): Promise<Bar[]> {
    const func = this.mapIntervalToFunction(interval)
    const url = this.buildBarsUrl(symbol, func, interval)
    const response = await this.fetchWithTimeout(url, this.requestTimeoutMs)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = (await response.json()) as unknown
    return this.parseBarsResponse(data, count)
  }

  /**
   * Map BarInterval to Alpha Vantage TIME_SERIES function name.
   * @internal
   */
  private mapIntervalToFunction(interval: BarInterval): string {
    const mapping: Record<BarInterval, string> = {
      '1m': 'TIME_SERIES_INTRADAY',
      '5m': 'TIME_SERIES_INTRADAY',
      '15m': 'TIME_SERIES_INTRADAY',
      '1h': 'TIME_SERIES_INTRADAY',
      '1d': 'TIME_SERIES_DAILY',
      '1w': 'TIME_SERIES_WEEKLY',
      '1mo': 'TIME_SERIES_MONTHLY',
    }
    return mapping[interval] ?? 'TIME_SERIES_DAILY'
  }

  /**
   * Build Alpha Vantage GLOBAL_QUOTE URL.
   * @internal
   */
  private buildQuoteUrl(symbol: string): string {
    const params = new URLSearchParams({
      function: 'GLOBAL_QUOTE',
      symbol,
      apikey: this.apiKey,
    })
    return `https://www.alphavantage.co/query?${params.toString()}`
  }

  /**
   * Build Alpha Vantage TIME_SERIES URL.
   * @internal
   */
  private buildBarsUrl(symbol: string, func: string, interval: BarInterval): string {
    const params = new URLSearchParams({
      function: func,
      symbol,
      apikey: this.apiKey,
    })

    if (func === 'TIME_SERIES_INTRADAY') {
      params.set('interval', interval)
    }

    return `https://www.alphavantage.co/query?${params.toString()}`
  }

  /**
   * Fetch with timeout protection.
   * @internal
   */
  private async fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      return await fetch(url, { signal: controller.signal })
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Parse Alpha Vantage GLOBAL_QUOTE response.
   * @internal
   */
  private parseQuoteResponse(symbol: string, data: unknown): Quote {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Invalid API response')
    }

    const obj = data as Record<string, unknown>

    // Check for API errors.
    if ('Error Message' in obj) {
      throw new Error(String(obj['Error Message']))
    }

    if ('Note' in obj) {
      throw new Error('API rate limited: ' + String(obj['Note']))
    }

    if (!('Global Quote' in obj)) {
      throw new Error('No Global Quote in response')
    }

    const quote = obj['Global Quote'] as Record<string, unknown>
    const price = parseFloat(String(quote['05. price'] ?? 0))
    const volume = parseInt(String(quote['06. volume'] ?? 0), 10)
    const changePercent = parseFloat(String(quote['10. change percent'] ?? 0))

    if (isNaN(price) || price === 0) {
      throw new Error('Invalid or missing price data')
    }

    // Compute bid/ask spread as 0.05%.
    const bid = price * 0.9995
    const ask = price * 1.0005

    return {
      symbol,
      price,
      bid,
      ask,
      timestamp: Date.now(),
      volume,
      changePercent,
    }
  }

  /**
   * Parse Alpha Vantage TIME_SERIES response.
   * @internal
   */
  private parseBarsResponse(data: unknown, count: number): Bar[] {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Invalid API response')
    }

    const obj = data as Record<string, unknown>

    // Check for API errors.
    if ('Error Message' in obj) {
      throw new Error(String(obj['Error Message']))
    }

    if ('Note' in obj) {
      throw new Error('API rate limited: ' + String(obj['Note']))
    }

    // Find the time series key.
    const timeSeriesKey = Object.keys(obj).find(k => k.startsWith('Time Series'))

    if (!timeSeriesKey) {
      throw new Error('No time series in response')
    }

    const timeSeries = obj[timeSeriesKey] as Record<string, unknown>
    if (typeof timeSeries !== 'object' || timeSeries === null) {
      throw new Error('Invalid time series data')
    }

    // Parse bars in ascending time order.
    const entries = Object.entries(timeSeries).sort(([a], [b]) => a.localeCompare(b))

    const bars: Bar[] = []

    for (const [timeStr, barData] of entries) {
      if (bars.length >= count) break

      const bar = barData as Record<string, unknown>
      const timestamp = new Date(timeStr).getTime()

      if (isNaN(timestamp)) continue

      const barOpen = parseFloat(String(bar['1. open'] ?? 0))
      const barHigh = parseFloat(String(bar['2. high'] ?? 0))
      const barLow = parseFloat(String(bar['3. low'] ?? 0))
      const close = parseFloat(String(bar['4. close'] ?? 0))
      const volume = parseInt(String(bar['5. volume'] ?? 0), 10)

      if (isNaN(barOpen) || isNaN(barHigh) || isNaN(barLow) || isNaN(close)) {
        continue
      }

      bars.push({
        open: barOpen,
        high: barHigh,
        low: barLow,
        close,
        volume,
        timestamp,
      })
    }

    return bars
  }

  /**
   * Log debug message.
   * @internal
   */
  private log(message: string): void {
    if (this.debug) {
      console.log(`[alpha-vantage] ${message}`)
    }
  }
}
