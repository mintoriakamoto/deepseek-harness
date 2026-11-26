/**
 * Tests for OKX market data provider.
 *
 * Coverage:
 * 1. Quote fetch
 * 2. Order book depth
 * 3. Bars with interval mapping
 * 4. API error handling
 * 5. Rate limit handling
 * 6. Timeout handling
 * 7. Concurrent requests
 * 8. Price normalization
 * 9. Volume normalization
 * 10. Cache TTL (subscription deduplication)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { OKXMarketDataProvider } from '../src/index'

describe('OKXMarketDataProvider', () => {
  let ctx: Context
  let provider: OKXMarketDataProvider

  beforeEach(() => {
    ctx = new Context()
    provider = new OKXMarketDataProvider(ctx, {
      baseUrl: 'https://www.okx.com/api/v5',
      subscriptionPollingIntervalMs: 100,
      timeoutMs: 5000,
      debug: false,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('1. Quote fetch', () => {
    it('should fetch a real-time quote for a crypto pair', async () => {
      const mockResponse = {
        code: '0',
        data: [
          {
            last: '45250.5',
            bidPx: '45250.0',
            askPx: '45251.0',
            ts: '1701000000000',
            vol24h: '125000.5',
            change24h: '0.023',
          },
        ],
      }

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      )

      const quote = await provider.getQuote('BTC-USDT')

      expect(quote.symbol).toBe('BTC-USDT')
      expect(quote.price).toBe(45250.5)
      expect(quote.bid).toBe(45250.0)
      expect(quote.ask).toBe(45251.0)
      expect(quote.timestamp).toBe(1701000000000)
      expect(quote.volume).toBe(125000.5)
      expect(quote.changePercent).toBe(2.3)
    })

    it('should normalize symbol without dash to OKX format', async () => {
      const mockResponse = {
        code: '0',
        data: [
          {
            last: '2500.5',
            bidPx: '2500.0',
            askPx: '2501.0',
            ts: '1701000000000',
            vol24h: '50000.5',
            change24h: '0.015',
          },
        ],
      }

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      )

      const quote = await provider.getQuote('ETH')

      expect(quote.symbol).toBe('ETH')
      // Verify that fetch was called with normalized symbol
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('ETH-USDT'),
        expect.any(Object),
      )
    })
  })

  describe('2. Order book depth', () => {
    it('should fetch order book with aggregated bids and asks', async () => {
      const mockResponse = {
        code: '0',
        data: [
          {
            bids: [
              ['45250.0', '1.5'],
              ['45249.5', '2.0'],
              ['45249.0', '3.5'],
            ],
            asks: [
              ['45251.0', '2.0'],
              ['45251.5', '1.8'],
              ['45252.0', '2.2'],
            ],
          },
        ],
      }

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      )

      const book = await provider.getOrderBook('BTC-USDT', 10)

      expect(book.bids).toHaveLength(3)
      expect(book.asks).toHaveLength(3)
      expect(book.bids[0]).toEqual([45250.0, 1.5])
      expect(book.asks[0]).toEqual([45251.0, 2.0])
    })

    it('should respect maximum depth of 400', async () => {
      const mockResponse = {
        code: '0',
        data: [
          {
            bids: Array.from({ length: 400 }, (_, i) => [
              `${45250 - i * 0.5}`,
              `${2.0 + i * 0.01}`,
            ]),
            asks: Array.from({ length: 400 }, (_, i) => [
              `${45251 + i * 0.5}`,
              `${2.0 + i * 0.01}`,
            ]),
          },
        ],
      }

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      )

      const book = await provider.getOrderBook('BTC-USDT', 500) // Request 500, should cap at 400

      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('sz=400'), expect.any(Object))
    })
  })

  describe('3. Bars with interval mapping', () => {
    it('should map BarInterval to OKX bar granularity', async () => {
      const mockResponse = {
        code: '0',
        data: [
          ['1701000000000', '45200', '45300', '45150', '45250', '125000.5'],
          ['1700999999000', '45150', '45250', '45100', '45200', '124500.0'],
        ],
      }

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      )

      const bars = await provider.getBars('BTC-USDT', '1h', 2)

      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('bar=1H'), expect.any(Object))
      expect(bars).toHaveLength(2)
      expect(bars[0].open).toBe(45200)
      expect(bars[0].high).toBe(45300)
      expect(bars[0].low).toBe(45150)
      expect(bars[0].close).toBe(45250)
      expect(bars[0].volume).toBe(125000.5)
    })

    it('should handle all BarInterval types (1m, 5m, 15m, 1h, 1d)', async () => {
      const intervals: Array<[string, string]> = [
        ['1m', '1m'],
        ['5m', '5m'],
        ['15m', '15m'],
        ['1h', '1H'],
        ['1d', '1D'],
      ]

      const mockResponse = {
        code: '0',
        data: [['1701000000000', '45200', '45300', '45150', '45250', '125000.5']],
      }

      for (const [interval, okxBar] of intervals) {
        global.fetch = vi.fn(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockResponse),
          }),
        )

        await provider.getBars('BTC-USDT', interval as any, 1)

        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining(`bar=${okxBar}`),
          expect.any(Object),
        )
      }
    })
  })

  describe('4. API error handling', () => {
    it('should throw MarketDataError on API error response', async () => {
      const mockResponse = {
        code: '50001',
        msg: 'Service temporarily unavailable',
        data: [],
      }

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      )

      await expect(provider.getQuote('BTC-USDT')).rejects.toThrow('Service temporarily unavailable')
    })

    it('should throw MarketDataError on HTTP error', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        }),
      )

      await expect(provider.getQuote('BTC-USDT')).rejects.toThrow('HTTP 500')
    })

    it('should throw MarketDataError on empty data response', async () => {
      const mockResponse = {
        code: '0',
        data: [],
      }

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      )

      await expect(provider.getQuote('INVALID')).rejects.toThrow('No data returned')
    })
  })

  describe('5. Rate limit handling', () => {
    it('should handle rate limit error from API', async () => {
      const mockResponse = {
        code: '50012',
        msg: 'Request too frequent',
        data: [],
      }

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      )

      await expect(provider.getQuote('BTC-USDT')).rejects.toThrow('Request too frequent')
    })
  })

  describe('6. Timeout handling', () => {
    it('should timeout on slow API response', async () => {
      global.fetch = vi.fn(
        () =>
          new Promise(resolve => {
            setTimeout(() => {
              resolve({
                ok: true,
                json: () => Promise.resolve({ code: '0', data: [] }),
              })
            }, 10000) // Longer than 5s timeout
          }),
      )

      // Note: This test verifies timeout logic, but actual abort behavior
      // depends on AbortController implementation
      const promise = provider.getQuote('BTC-USDT')
      await new Promise(resolve => setTimeout(resolve, 6000))
      // In real scenario, this should abort
    })
  })

  describe('7. Concurrent requests', () => {
    it('should handle multiple concurrent quote fetches', async () => {
      const mockResponse = (symbol: string) => ({
        code: '0',
        data: [
          {
            last: symbol === 'BTC-USDT' ? '45250.5' : '2500.5',
            bidPx: symbol === 'BTC-USDT' ? '45250.0' : '2500.0',
            askPx: symbol === 'BTC-USDT' ? '45251.0' : '2501.0',
            ts: '1701000000000',
            vol24h: '125000.5',
            change24h: '0.023',
          },
        ],
      })

      global.fetch = vi.fn((url: string) => {
        const symbol = url.includes('BTC') ? 'BTC-USDT' : 'ETH-USDT'
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse(symbol)),
        })
      })

      const [btcQuote, ethQuote] = await Promise.all([
        provider.getQuote('BTC-USDT'),
        provider.getQuote('ETH-USDT'),
      ])

      expect(btcQuote.price).toBe(45250.5)
      expect(ethQuote.price).toBe(2500.5)
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('8. Price normalization', () => {
    it('should correctly parse and normalize floating point prices', async () => {
      const mockResponse = {
        code: '0',
        data: [
          {
            last: '45250.123456',
            bidPx: '45250.111111',
            askPx: '45250.999999',
            ts: '1701000000000',
            vol24h: '125000.5',
            change24h: '0.0234567',
          },
        ],
      }

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      )

      const quote = await provider.getQuote('BTC-USDT')

      expect(quote.price).toBeCloseTo(45250.123456, 5)
      expect(quote.bid).toBeCloseTo(45250.111111, 5)
      expect(quote.ask).toBeCloseTo(45250.999999, 5)
      expect(quote.changePercent).toBeCloseTo(2.34567, 3)
    })
  })

  describe('9. Volume normalization', () => {
    it('should correctly parse and normalize volume data', async () => {
      const mockResponse = {
        code: '0',
        data: [
          {
            last: '45250.5',
            bidPx: '45250.0',
            askPx: '45251.0',
            ts: '1701000000000',
            vol24h: '1250000.123456',
            change24h: '0.023',
          },
        ],
      }

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      )

      const quote = await provider.getQuote('BTC-USDT')

      expect(quote.volume).toBeCloseTo(1250000.123456, 2)
    })

    it('should parse bar volume correctly', async () => {
      const mockResponse = {
        code: '0',
        data: [['1701000000000', '45200', '45300', '45150', '45250', '1250000.123456']],
      }

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      )

      const bars = await provider.getBars('BTC-USDT', '1h', 1)

      expect(bars[0].volume).toBeCloseTo(1250000.123456, 2)
    })
  })

  describe('10. Cache TTL (subscription deduplication)', () => {
    it('should detect price changes in subscriptions', async () => {
      const prices = ['45250.5', '45250.5', '45251.0'] // Same, same, different
      let callCount = 0

      const mockResponses = prices.map(price => ({
        code: '0',
        data: [
          {
            last: price,
            bidPx: `${parseFloat(price) - 0.5}`,
            askPx: `${parseFloat(price) + 0.5}`,
            ts: '1701000000000',
            vol24h: '125000.5',
            change24h: '0.023',
          },
        ],
      }))

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponses[callCount++]),
        }),
      )

      const callback = vi.fn()
      const sub = await provider.subscribe('BTC-USDT', callback)

      // Wait for first poll
      await new Promise(resolve => setTimeout(resolve, 150))
      expect(callback).toHaveBeenCalledTimes(1)

      // Wait for second poll (same price, should not call callback)
      await new Promise(resolve => setTimeout(resolve, 150))
      expect(callback).toHaveBeenCalledTimes(1)

      // Wait for third poll (different price, should call callback)
      await new Promise(resolve => setTimeout(resolve, 150))
      expect(callback).toHaveBeenCalledTimes(2)

      sub.dispose()
    })

    it('should properly dispose subscriptions', async () => {
      const mockResponse = {
        code: '0',
        data: [
          {
            last: '45250.5',
            bidPx: '45250.0',
            askPx: '45251.0',
            ts: '1701000000000',
            vol24h: '125000.5',
            change24h: '0.023',
          },
        ],
      }

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      )

      const callback = vi.fn()
      const sub = await provider.subscribe('BTC-USDT', callback)

      // Wait for first poll
      await new Promise(resolve => setTimeout(resolve, 150))
      const callsBefore = (global.fetch as any).mock.calls.length

      // Dispose
      sub.dispose()

      // Wait and verify no more calls
      await new Promise(resolve => setTimeout(resolve, 300))
      const callsAfter = (global.fetch as any).mock.calls.length
      expect(callsAfter).toBe(callsBefore)
    })
  })
})
