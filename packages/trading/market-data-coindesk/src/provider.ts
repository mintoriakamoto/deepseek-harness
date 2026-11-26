/**
 * CoinDesk market data provider implementation.
 */

import type { Quote, Bar, VolatilitySurface, IVPoint } from './types.js'

/**
 * Configuration for the CoinDesk provider.
 */
export interface CoinDeskConfig {
  /** API base URL */
  baseUrl: string
  /** API timeout in milliseconds */
  timeoutMs: number
  /** Enable caching */
  enableCache: boolean
  /** Cache TTL in seconds */
  cacheTtlSeconds: number
}

/**
 * Default configuration for CoinDesk provider.
 */
const DEFAULT_CONFIG: CoinDeskConfig = {
  baseUrl: 'https://api.coindesk.com/v1',
  timeoutMs: 5000,
  enableCache: true,
  cacheTtlSeconds: 60,
}

/**
 * CoinDesk market data provider.
 * Provides crypto spot prices, historical bars, and implied volatility surfaces.
 */
export class CoinDeskProvider {
  private config: CoinDeskConfig
  private cache: Map<string, { value: unknown; expiresAt: number }>

  /**
   * Create a new CoinDesk provider instance.
   * @param config Optional configuration overrides
   */
  constructor(config: Partial<CoinDeskConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.cache = new Map()
  }

  /**
   * Get current spot price quote for a cryptocurrency.
   * @param symbol Crypto symbol (e.g., "BTC", "ETH")
   * @returns Quote with current price and market data
   */
  async getQuote(symbol: string): Promise<Quote> {
    const cacheKey = `quote:${symbol}`
    const cached = this.getCached<Quote>(cacheKey)
    if (cached) {
      return cached
    }

    // Normalize symbol
    const normalizedSymbol = symbol.toUpperCase()

    // Simulate API call with timeout
    const quote = await this.fetchQuoteWithTimeout(normalizedSymbol)

    // Cache the result
    if (this.config.enableCache) {
      this.setCached(cacheKey, quote)
    }

    return quote
  }

  /**
   * Get historical price bars for a cryptocurrency.
   * @param symbol Crypto symbol
   * @param interval Time interval (e.g., "1h", "1d")
   * @param limit Number of bars to return (max 1000)
   * @returns Array of historical bars
   */
  async getBars(symbol: string, interval: string = '1d', limit: number = 100): Promise<Bar[]> {
    // Validate inputs
    if (limit < 1 || limit > 1000) {
      throw new Error('Bar limit must be between 1 and 1000')
    }

    // Normalize symbol
    const normalizedSymbol = symbol.toUpperCase()

    const cacheKey = `bars:${normalizedSymbol}:${interval}:${limit}`
    const cached = this.getCached<Bar[]>(cacheKey)
    if (cached) {
      return cached
    }

    // Simulate API call with timeout
    const bars = await this.fetchBarsWithTimeout(normalizedSymbol, interval, limit)

    // Cache the result
    if (this.config.enableCache) {
      this.setCached(cacheKey, bars)
    }

    return bars
  }

  /**
   * Get implied volatility surface for derivatives pricing.
   * @param symbol Crypto symbol
   * @param spotPrice Current spot price
   * @returns Volatility surface with IV smile and term structure
   */
  async getVolatilitySurface(symbol: string, spotPrice: number): Promise<VolatilitySurface> {
    // Normalize symbol
    const normalizedSymbol = symbol.toUpperCase()

    const cacheKey = `iv-surface:${normalizedSymbol}:${spotPrice}`
    const cached = this.getCached<VolatilitySurface>(cacheKey)
    if (cached) {
      return cached
    }

    // Simulate API call with timeout
    const surface = await this.fetchVolatilitySurfaceWithTimeout(normalizedSymbol, spotPrice)

    // Cache the result
    if (this.config.enableCache) {
      this.setCached(cacheKey, surface)
    }

    return surface
  }

  /**
   * Fetch quote with timeout handling.
   * @internal
   */
  private async fetchQuoteWithTimeout(symbol: string): Promise<Quote> {
    return this.withTimeout(async () => {
      // In production, this would call the actual CoinDesk API
      // For now, we return synthetic data
      return this.generateSyntheticQuote(symbol)
    }, this.config.timeoutMs)
  }

  /**
   * Fetch bars with timeout handling.
   * @internal
   */
  private async fetchBarsWithTimeout(symbol: string, interval: string, limit: number): Promise<Bar[]> {
    return this.withTimeout(async () => {
      return this.generateSyntheticBars(symbol, interval, limit)
    }, this.config.timeoutMs)
  }

  /**
   * Fetch volatility surface with timeout handling.
   * @internal
   */
  private async fetchVolatilitySurfaceWithTimeout(symbol: string, spotPrice: number): Promise<VolatilitySurface> {
    return this.withTimeout(async () => {
      return this.generateSyntheticVolatilitySurface(symbol, spotPrice)
    }, this.config.timeoutMs)
  }

  /**
   * Execute operation with timeout.
   * @internal
   */
  private async withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs),
      ),
    ])
  }

  /**
   * Get cached value if not expired.
   * @internal
   */
  private getCached<T>(key: string): T | null {
    if (!this.config.enableCache) {
      return null
    }

    const cached = this.cache.get(key)
    if (!cached) {
      return null
    }

    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key)
      return null
    }

    return cached.value as T
  }

  /**
   * Set cached value with TTL.
   * @internal
   */
  private setCached<T>(key: string, value: T): void {
    if (!this.config.enableCache) {
      return
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.config.cacheTtlSeconds * 1000,
    })
  }

  /**
   * Generate synthetic quote for testing.
   * @internal
   */
  private generateSyntheticQuote(symbol: string): Quote {
    const basePrice = this.getBasePriceForSymbol(symbol)
    const volatility = 0.02 // 2% daily volatility

    const change = (Math.random() - 0.5) * volatility
    const price = basePrice * (1 + change)

    return {
      symbol,
      price,
      timestamp: new Date().toISOString(),
      change24h: change * 100,
      high24h: price * 1.01,
      low24h: price * 0.99,
      volume24h: Math.random() * 100000000,
    }
  }

  /**
   * Generate synthetic bars for testing.
   * @internal
   */
  private generateSyntheticBars(symbol: string, interval: string, limit: number): Bar[] {
    const bars: Bar[] = []
    let currentTime = Date.now()
    const basePrice = this.getBasePriceForSymbol(symbol)

    for (let i = 0; i < limit; i++) {
      const volatility = 0.01 // 1% volatility per bar
      const change = (Math.random() - 0.5) * volatility

      const open = basePrice * (1 + change)
      const close = open * (1 + (Math.random() - 0.5) * volatility)
      const high = Math.max(open, close) * 1.005
      const low = Math.min(open, close) * 0.995

      bars.push({
        timestamp: new Date(currentTime).toISOString(),
        open,
        high,
        low,
        close,
        volume: Math.random() * 1000000,
      })

      currentTime -= this.getIntervalMs(interval)
    }

    return bars.reverse()
  }

  /**
   * Generate synthetic volatility surface for testing.
   * @internal
   */
  private generateSyntheticVolatilitySurface(symbol: string, spotPrice: number): VolatilitySurface {
    const points: IVPoint[] = []

    // Generate IV smile: lower IV at ATM, higher at wings
    const strikes = [0.80, 0.90, 0.95, 1.0, 1.05, 1.10, 1.20]
    const dtes = [7, 14, 30, 60, 90]

    for (const dte of dtes) {
      for (const strike of strikes) {
        // IV smile: higher at wings, lower at ATM
        const atmIV = 0.25 // 25% IV at ATM
        const distanceFromATM = Math.abs(strike - 1.0)
        const wingAdj = distanceFromATM * 0.15 // 15% per 10% away from ATM

        const iv = atmIV + wingAdj + (Math.random() - 0.5) * 0.02

        points.push({
          strike: strike * 100,
          daysToExpiration: dte,
          impliedVol: Math.max(0.1, Math.min(0.5, iv)), // Clamp between 10% and 50%
          midPrice: spotPrice * strike * 0.95 + Math.random() * spotPrice * 0.1,
        })
      }
    }

    return {
      symbol,
      spotPrice,
      timestamp: new Date().toISOString(),
      points,
      minStrike: 80,
      maxStrike: 120,
      minDTE: 7,
      maxDTE: 90,
    }
  }

  /**
   * Get base price for a symbol.
   * @internal
   */
  private getBasePriceForSymbol(symbol: string): number {
    const prices: Record<string, number> = {
      BTC: 42000,
      ETH: 2500,
      SOL: 150,
      ADA: 1.0,
    }
    return prices[symbol] || 1.0
  }

  /**
   * Convert interval string to milliseconds.
   * @internal
   */
  private getIntervalMs(interval: string): number {
    const matches = interval.match(/^(\d+)([a-z])$/i)
    if (!matches || !matches[1] || !matches[2]) {
      return 86400000 // Default to 1 day
    }

    const quantity = matches[1]
    const unit = matches[2]
    const q = parseInt(quantity, 10)

    const unitMs: Record<string, number> = {
      m: 60000,
      h: 3600000,
      d: 86400000,
      w: 604800000,
    }

    return (unitMs[unit.toLowerCase()] || 86400000) * q
  }

  /**
   * Clear all cached data.
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    }
  }
}
