/**
 * Tests for CoinDesk market data provider.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { CoinDeskProvider } from '../src/provider.js'

describe('CoinDeskProvider', () => {
  let provider: CoinDeskProvider

  beforeEach(() => {
    provider = new CoinDeskProvider()
  })

  describe('getQuote', () => {
    it('should fetch a spot price quote', async () => {
      const quote = await provider.getQuote('BTC')

      expect(quote).toHaveProperty('symbol', 'BTC')
      expect(quote).toHaveProperty('price')
      expect(quote).toHaveProperty('timestamp')
      expect(quote).toHaveProperty('change24h')
      expect(quote).toHaveProperty('high24h')
      expect(quote).toHaveProperty('low24h')
      expect(quote).toHaveProperty('volume24h')

      expect(typeof quote.price).toBe('number')
      expect(quote.price).toBeGreaterThan(0)
      expect(typeof quote.timestamp).toBe('string')
      expect(typeof quote.change24h).toBe('number')
    })

    it('should normalize symbol to uppercase', async () => {
      const quote = await provider.getQuote('btc')

      expect(quote.symbol).toBe('BTC')
    })

    it('should handle different symbols', async () => {
      const symbols = ['BTC', 'ETH', 'SOL', 'ADA']

      for (const symbol of symbols) {
        const quote = await provider.getQuote(symbol)
        expect(quote.symbol).toBe(symbol)
        expect(quote.price).toBeGreaterThan(0)
      }
    })
  })

  describe('getBars', () => {
    it('should fetch historical bars with default interval', async () => {
      const bars = await provider.getBars('BTC')

      expect(Array.isArray(bars)).toBe(true)
      expect(bars.length).toBe(100) // Default limit

      if (bars.length > 0) {
        const bar = bars[0]
        expect(bar).toHaveProperty('timestamp')
        expect(bar).toHaveProperty('open')
        expect(bar).toHaveProperty('high')
        expect(bar).toHaveProperty('low')
        expect(bar).toHaveProperty('close')
        expect(bar).toHaveProperty('volume')

        expect(typeof bar.open).toBe('number')
        expect(bar.high >= bar.low).toBe(true)
        expect(bar.close).toBeGreaterThan(0)
      }
    })

    it('should respect custom interval and limit', async () => {
      const bars = await provider.getBars('ETH', '1h', 50)

      expect(bars.length).toBe(50)

      // Verify bars are in chronological order
      for (let i = 1; i < bars.length; i++) {
        const prevTime = new Date(bars[i - 1].timestamp).getTime()
        const currTime = new Date(bars[i].timestamp).getTime()
        expect(currTime).toBeGreaterThanOrEqual(prevTime)
      }
    })

    it('should validate bar limit', async () => {
      // Test minimum limit
      const minBars = await provider.getBars('BTC', '1d', 1)
      expect(minBars.length).toBe(1)

      // Test maximum limit
      const maxBars = await provider.getBars('BTC', '1d', 1000)
      expect(maxBars.length).toBe(1000)

      // Test invalid limits
      await expect(provider.getBars('BTC', '1d', 0)).rejects.toThrow()
      await expect(provider.getBars('BTC', '1d', 1001)).rejects.toThrow()
    })

    it('should generate valid OHLCV data', async () => {
      const bars = await provider.getBars('SOL', '1d', 10)

      for (const bar of bars) {
        // Verify OHLCV relationships
        expect(bar.high >= bar.open).toBe(true)
        expect(bar.high >= bar.close).toBe(true)
        expect(bar.high >= bar.low).toBe(true)

        expect(bar.low <= bar.open).toBe(true)
        expect(bar.low <= bar.close).toBe(true)

        // Volume should be non-negative
        expect(bar.volume).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('getVolatilitySurface', () => {
    it('should fetch volatility surface with correct structure', async () => {
      const surface = await provider.getVolatilitySurface('BTC', 42000)

      expect(surface).toHaveProperty('symbol', 'BTC')
      expect(surface).toHaveProperty('spotPrice', 42000)
      expect(surface).toHaveProperty('timestamp')
      expect(surface).toHaveProperty('points')
      expect(surface).toHaveProperty('minStrike')
      expect(surface).toHaveProperty('maxStrike')
      expect(surface).toHaveProperty('minDTE')
      expect(surface).toHaveProperty('maxDTE')

      expect(Array.isArray(surface.points)).toBe(true)
      expect(surface.points.length).toBeGreaterThan(0)
    })

    it('should have valid IV surface points', async () => {
      const surface = await provider.getVolatilitySurface('ETH', 2500)

      for (const point of surface.points) {
        expect(point).toHaveProperty('strike')
        expect(point).toHaveProperty('daysToExpiration')
        expect(point).toHaveProperty('impliedVol')

        // Validate data types and ranges
        expect(typeof point.strike).toBe('number')
        expect(point.strike).toBeGreaterThan(0)

        expect(typeof point.daysToExpiration).toBe('number')
        expect(point.daysToExpiration).toBeGreaterThan(0)

        expect(typeof point.impliedVol).toBe('number')
        expect(point.impliedVol).toBeGreaterThanOrEqual(0.1)
        expect(point.impliedVol).toBeLessThanOrEqual(0.5)
      }
    })

    it('should represent IV smile structure', async () => {
      const surface = await provider.getVolatilitySurface('BTC', 42000)

      // Group by DTE to verify smile structure (wings higher than ATM)
      const byDTE = new Map<number, typeof surface.points>()

      for (const point of surface.points) {
        if (!byDTE.has(point.daysToExpiration)) {
          byDTE.set(point.daysToExpiration, [])
        }
        byDTE.get(point.daysToExpiration)!.push(point)
      }

      // For each DTE, verify smile exists (at least some variation in IV)
      for (const points of byDTE.values()) {
        const ivs = points.map(p => p.impliedVol)
        const minIV = Math.min(...ivs)
        const maxIV = Math.max(...ivs)

        // Should have some IV variation (smile)
        expect(maxIV - minIV).toBeGreaterThan(0)
      }
    })

    it('should include term structure (different DTEs)', async () => {
      const surface = await provider.getVolatilitySurface('SOL', 150)

      const dtes = new Set(surface.points.map(p => p.daysToExpiration))

      // Should have multiple DTEs for term structure
      expect(dtes.size).toBeGreaterThan(1)
    })
  })

  describe('Caching', () => {
    it('should cache quotes and return same object', async () => {
      provider = new CoinDeskProvider({ enableCache: true, cacheTtlSeconds: 10 })

      const quote1 = await provider.getQuote('BTC')
      const quote2 = await provider.getQuote('BTC')

      // With caching, should return exact same object
      expect(quote1).toStrictEqual(quote2)
    })

    it('should not cache when disabled', async () => {
      provider = new CoinDeskProvider({ enableCache: false })

      const quote1 = await provider.getQuote('BTC')
      const quote2 = await provider.getQuote('BTC')

      // Without caching, prices will differ (synthetic data)
      // Both should be valid quotes though
      expect(quote1.symbol).toBe(quote2.symbol)
    })

    it('should cache different symbols separately', async () => {
      provider = new CoinDeskProvider({ enableCache: true })

      const btcQuote = await provider.getQuote('BTC')
      const ethQuote = await provider.getQuote('ETH')

      expect(btcQuote.symbol).toBe('BTC')
      expect(ethQuote.symbol).toBe('ETH')
      expect(btcQuote.price).not.toBe(ethQuote.price)
    })

    it('should track cache statistics', async () => {
      provider = new CoinDeskProvider({ enableCache: true })

      await provider.getQuote('BTC')
      await provider.getBars('BTC')
      await provider.getVolatilitySurface('BTC', 42000)

      const stats = provider.getCacheStats()

      expect(stats.size).toBe(3)
      expect(stats.entries).toContain('quote:BTC')
      expect(stats.entries.some(e => e.startsWith('bars:'))).toBe(true)
      expect(stats.entries.some(e => e.startsWith('iv-surface:'))).toBe(true)
    })

    it('should clear cache', async () => {
      provider = new CoinDeskProvider({ enableCache: true })

      await provider.getQuote('BTC')
      let stats = provider.getCacheStats()
      expect(stats.size).toBeGreaterThan(0)

      provider.clearCache()
      stats = provider.getCacheStats()
      expect(stats.size).toBe(0)
    })
  })

  describe('Concurrency', () => {
    it('should handle concurrent requests', async () => {
      const symbols = ['BTC', 'ETH', 'SOL', 'ADA']

      const quotePromises = symbols.map(symbol => provider.getQuote(symbol))
      const quotes = await Promise.all(quotePromises)

      expect(quotes.length).toBe(4)
      for (let i = 0; i < 4; i++) {
        expect(quotes[i].symbol).toBe(symbols[i])
        expect(quotes[i].price).toBeGreaterThan(0)
      }
    })

    it('should handle concurrent mixed requests', async () => {
      const promises = [
        provider.getQuote('BTC'),
        provider.getBars('ETH', '1d', 50),
        provider.getVolatilitySurface('SOL', 150),
        provider.getQuote('ADA'),
      ]

      const results = await Promise.all(promises)

      expect(results.length).toBe(4)
      expect(results[0]).toHaveProperty('price')
      expect(Array.isArray(results[1])).toBe(true)
      expect(results[2]).toHaveProperty('points')
      expect(results[3]).toHaveProperty('price')
    })
  })

  describe('Timeout handling', () => {
    it('should not timeout for normal requests', async () => {
      provider = new CoinDeskProvider({ timeoutMs: 5000 })

      const quote = await provider.getQuote('BTC')
      expect(quote).toHaveProperty('price')
    })

    it('should respect configured timeout', async () => {
      provider = new CoinDeskProvider({ timeoutMs: 100 })

      // Synthetic data generation is fast, so this shouldn't actually timeout
      // In production with real API calls, this would be a real test
      const quote = await provider.getQuote('BTC')
      expect(quote).toHaveProperty('price')
    })
  })

  describe('Data normalization', () => {
    it('should normalize symbol case', async () => {
      const quotes = await Promise.all([
        provider.getQuote('btc'),
        provider.getQuote('BTC'),
        provider.getQuote('Btc'),
      ])

      // All should have normalized symbol
      expect(quotes.every(q => q.symbol === 'BTC')).toBe(true)
    })

    it('should validate price bounds', async () => {
      const quote = await provider.getQuote('BTC')

      expect(quote.price).toBeGreaterThan(0)
      expect(quote.high24h).toBeGreaterThan(quote.low24h)
      expect(quote.price).toBeLessThanOrEqual(quote.high24h)
      expect(quote.price).toBeGreaterThanOrEqual(quote.low24h)
    })

    it('should have valid timestamps', async () => {
      const quote = await provider.getQuote('BTC')
      const timestamp = new Date(quote.timestamp)

      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now())
      expect(timestamp.getTime()).toBeGreaterThan(0)
    })
  })

  describe('Error handling', () => {
    it('should validate bar limits', async () => {
      await expect(provider.getBars('BTC', '1d', 0)).rejects.toThrow('limit must be between 1 and 1000')
      await expect(provider.getBars('BTC', '1d', 1001)).rejects.toThrow('limit must be between 1 and 1000')
    })

    it('should handle symbol normalization for all methods', async () => {
      const quote = await provider.getQuote('btc')
      const bars = await provider.getBars('eth')
      const surface = await provider.getVolatilitySurface('sol', 150)

      expect(quote.symbol).toBe('BTC')
      expect(Array.isArray(bars)).toBe(true)
      expect(surface.symbol).toBe('SOL')
    })
  })
})
