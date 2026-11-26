/**
 * Tests for Crypto.com market data provider.
 *
 * Coverage:
 * 1. Quote fetch: real-time ticker data
 * 2. Order book: bid/ask depth
 * 3. Bars: historical candlestick data
 * 4. API errors: network and validation errors
 * 5. Concurrent: multiple parallel requests
 * 6. Cache: TTL-based quote caching
 * 7. Normalization: response format conversion
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { MarketDataService } from '@deepseek-ai/dsh-market-data'
import {
  CryptocomMarketDataProvider,
  type CryptocomMarketDataConfig,
  type OrderBook,
} from '../src/index.ts'

describe('CryptocomMarketDataProvider', () => {
  let ctx: Context
  let provider: CryptocomMarketDataProvider

  beforeEach(() => {
    ctx = new Context()
    provider = new CryptocomMarketDataProvider(ctx, {
      baseUrl: 'https://api.crypto.com/exchange/v1',
      timeoutMs: 10_000,
      cacheTtlMs: 1000,
      debug: false,
    })

    // Mock fetch globally
    global.fetch = vi.fn()
  })

  /**
   * Test 1: Quote fetch from Crypto.com get_tickers endpoint.
   */
  it('fetches quote for BTC_USD', async () => {
    // Mock ticker response
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          data: [
            {
              i: 'BTC_USD', // instrument
              b: 42_000, // bid
              k: 42_100, // ask
              a: 42_050, // last price
              t: 1_700_000_000_000, // timestamp
              v: 1_500_000, // volume
            },
          ],
        },
      }),
    })

    const quote = await provider.getQuote('BTC_USD')

    expect(quote.symbol).toBe('BTC_USD')
    expect(quote.price).toBe(42_050)
    expect(quote.bid).toBe(42_000)
    expect(quote.ask).toBe(42_100)
    expect(quote.volume).toBe(1_500_000)
    expect(quote.timestamp).toBe(1_700_000_000_000)
  })

  /**
   * Test 2: Order book fetch with bid/ask levels.
   */
  it('fetches order book with bid/ask depth', async () => {
    // Mock order book response
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          data: [
            {
              bids: [
                [42_000, 1],
                [41_950, 2],
                [41_900, 3],
              ],
              asks: [
                [42_100, 1],
                [42_150, 2],
                [42_200, 3],
              ],
              t: 1_700_000_000_000,
            },
          ],
        },
      }),
    })

    const book = await provider.getOrderBook('BTC_USD')

    expect(book.symbol).toBe('BTC_USD')
    expect(book.bids).toHaveLength(3)
    expect(book.asks).toHaveLength(3)
    expect(book.bids[0]).toEqual({ price: 42_000, size: 1 })
    expect(book.asks[0]).toEqual({ price: 42_100, size: 1 })
    expect(book.timestamp).toBe(1_700_000_000_000)
  })

  /**
   * Test 3: Historical bars (candlesticks).
   */
  it('fetches candlestick bars for 1h interval', async () => {
    // Mock candlesticks response
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          data: [
            { o: 42_000, h: 42_500, l: 41_800, c: 42_200, v: 500_000, t: 1_700_000_000_000 },
            { o: 42_200, h: 42_300, l: 42_000, c: 42_100, v: 480_000, t: 1_700_003_600_000 },
            { o: 42_100, h: 42_400, l: 42_050, c: 42_350, v: 520_000, t: 1_700_007_200_000 },
          ],
        },
      }),
    })

    const bars = await provider.getBars('BTC_USD', '1h', 3)

    expect(bars).toHaveLength(3)
    expect(bars[0]).toEqual({
      open: 42_000,
      high: 42_500,
      low: 41_800,
      close: 42_200,
      volume: 500_000,
      timestamp: 1_700_000_000_000,
    })
    expect(bars[2].close).toBe(42_350)
  })

  /**
   * Test 4: API errors (network and validation).
   */
  it('throws MarketDataError on network failure', async () => {
    // Mock network error
    ;(global.fetch as any).mockRejectedValueOnce(new Error('Network timeout'))

    await expect(provider.getQuote('BTC_USD')).rejects.toThrow('NETWORK_ERROR')
  })

  it('throws MarketDataError on HTTP error', async () => {
    // Mock 404 response
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    })

    await expect(provider.getQuote('INVALID')).rejects.toThrow('NETWORK_ERROR')
  })

  it('throws MarketDataError on symbol not found', async () => {
    // Mock empty response (no data)
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          data: [],
        },
      }),
    })

    await expect(provider.getQuote('NONEXISTENT')).rejects.toThrow('NETWORK_ERROR')
  })

  /**
   * Test 5: Concurrent requests.
   */
  it('handles concurrent quote requests', async () => {
    // Mock responses for multiple symbols
    ;(global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            data: [{ i: 'BTC_USD', b: 42_000, k: 42_100, a: 42_050, t: Date.now(), v: 1_500_000 }],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            data: [
              { i: 'ETH_USD', b: 2_200, k: 2_210, a: 2_205, t: Date.now(), v: 500_000 },
            ],
          },
        }),
      })

    const [btcQuote, ethQuote] = await Promise.all([
      provider.getQuote('BTC_USD'),
      provider.getQuote('ETH_USD'),
    ])

    expect(btcQuote.symbol).toBe('BTC_USD')
    expect(ethQuote.symbol).toBe('ETH_USD')
    expect(btcQuote.price).toBe(42_050)
    expect(ethQuote.price).toBe(2_205)
  })

  /**
   * Test 6: Cache TTL-based behavior.
   */
  it('caches quotes within TTL', async () => {
    const config: CryptocomMarketDataConfig = {
      cacheTtlMs: 1000,
    }
    const cachedProvider = new CryptocomMarketDataProvider(ctx, config)

    // Mock single response
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          data: [
            { i: 'BTC_USD', b: 42_000, k: 42_100, a: 42_050, t: Date.now(), v: 1_500_000 },
          ],
        },
      }),
    })

    // First call: fetches from API
    const quote1 = await cachedProvider.getQuote('BTC_USD')
    expect(quote1.price).toBe(42_050)

    // Second call within TTL: returns cached
    const quote2 = await cachedProvider.getQuote('BTC_USD')
    expect(quote2.price).toBe(42_050)

    // Verify fetch was called only once
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('expires cache after TTL', async () => {
    const config: CryptocomMarketDataConfig = {
      cacheTtlMs: 50, // 50ms TTL
    }
    const cachedProvider = new CryptocomMarketDataProvider(ctx, config)

    // Mock responses (will be called twice)
    ;(global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            data: [
              { i: 'BTC_USD', b: 42_000, k: 42_100, a: 42_050, t: Date.now(), v: 1_500_000 },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            data: [
              { i: 'BTC_USD', b: 42_010, k: 42_110, a: 42_060, t: Date.now(), v: 1_600_000 },
            ],
          },
        }),
      })

    // First call
    const quote1 = await cachedProvider.getQuote('BTC_USD')
    expect(quote1.price).toBe(42_050)

    // Wait for cache to expire
    await new Promise(resolve => setTimeout(resolve, 100))

    // Second call after TTL
    const quote2 = await cachedProvider.getQuote('BTC_USD')
    expect(quote2.price).toBe(42_060)

    // Verify fetch was called twice
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  /**
   * Test 7: Response normalization (format conversion).
   */
  it('normalizes Crypto.com ticker format to Quote', async () => {
    // Mock raw Crypto.com response
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          data: [
            {
              i: 'ETH_USD',
              b: 2_200,
              k: 2_210,
              a: 2_205,
              t: 1_700_050_000_000,
              v: 500_000,
            },
          ],
        },
      }),
    })

    const quote = await provider.getQuote('ETH_USD')

    // Verify normalized fields
    expect(quote).toMatchObject({
      symbol: 'ETH_USD', // from i
      bid: 2_200, // from b
      ask: 2_210, // from k
      price: 2_205, // from a
      volume: 500_000, // from v
      timestamp: 1_700_050_000_000, // from t
      changePercent: 0, // computed field
    })
  })

  it('normalizes Crypto.com candlesticks to Bars', async () => {
    // Mock raw candlestick response
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          data: [
            {
              o: 42_000, // open
              h: 42_500, // high
              l: 41_800, // low
              c: 42_200, // close
              v: 500_000, // volume
              t: 1_700_000_000_000, // timestamp
            },
          ],
        },
      }),
    })

    const bars = await provider.getBars('BTC_USD', '1h', 1)

    // Verify normalized fields
    expect(bars[0]).toMatchObject({
      open: 42_000, // from o
      high: 42_500, // from h
      low: 41_800, // from l
      close: 42_200, // from c
      volume: 500_000, // from v
      timestamp: 1_700_000_000_000, // from t
    })
  })

  /**
   * Test: Subscribe not supported.
   */
  it('throws OPERATION_NOT_SUPPORTED on subscribe attempt', async () => {
    await expect(provider.subscribe('BTC_USD', async () => {})).rejects.toThrow(
      'OPERATION_NOT_SUPPORTED',
    )
  })

  /**
   * Test: getSentiment returns empty.
   */
  it('returns empty sentiment array', async () => {
    const sentiment = await provider.getSentiment(['BTC_USD', 'ETH_USD'])

    expect(sentiment).toEqual([])
  })

  /**
   * Test 8: Multiple bar intervals.
   */
  it('fetches bars with different intervals', async () => {
    // Mock responses for different intervals
    ;(global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            data: [
              { o: 42_000, h: 42_500, l: 41_800, c: 42_200, v: 500_000, t: Date.now() },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            data: [
              { o: 42_200, h: 42_600, l: 41_900, c: 42_300, v: 600_000, t: Date.now() },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            data: [
              { o: 42_100, h: 42_400, l: 41_800, c: 42_250, v: 550_000, t: Date.now() },
            ],
          },
        }),
      })

    const bars1m = await provider.getBars('BTC_USD', '1m', 1)
    const bars5m = await provider.getBars('BTC_USD', '5m', 1)
    const bars1h = await provider.getBars('BTC_USD', '1h', 1)

    expect(bars1m[0].close).toBe(42_200)
    expect(bars5m[0].close).toBe(42_300)
    expect(bars1h[0].close).toBe(42_250)

    // Verify fetch was called 3 times
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })
})
