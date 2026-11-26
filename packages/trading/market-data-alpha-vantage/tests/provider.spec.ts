/**
 * Tests for Alpha Vantage provider.
 *
 * Coverage: quote fetch, bars fetch, caching, error handling, rate limiting, concurrency.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AlphaVantageProvider } from '../src/provider.ts'
import { MarketDataError } from '@deepseek-ai/dsh-market-data'

describe('AlphaVantageProvider', () => {
  let provider: AlphaVantageProvider
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    provider = new AlphaVantageProvider({
      apiKey: 'test-key',
      quoteCacheTtlMs: 100, // Short TTL for testing.
      requestTimeoutMs: 5000,
      debug: false,
    })

    // Spy on fetch.
    fetchSpy = vi.spyOn(global, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should fetch a real-time quote successfully', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          'Global Quote': {
            '01. symbol': 'AAPL',
            '05. price': '150.25',
            '02. open': '149.50',
            '03. high': '151.00',
            '04. low': '149.00',
            '06. volume': '50000000',
            '10. change percent': '0.50%',
          },
        }),
        { status: 200 },
      ),
    )

    const quote = await provider.getQuote('AAPL')

    expect(quote.symbol).toBe('AAPL')
    expect(quote.price).toBe(150.25)
    expect(quote.bid).toBeCloseTo(150.25 * 0.9995, 2)
    expect(quote.ask).toBeCloseTo(150.25 * 1.0005, 2)
    expect(quote.volume).toBe(50000000)
    expect(quote.changePercent).toBe(0.5)
    expect(quote.timestamp).toBeGreaterThan(0)
  })

  it('should fetch bars with correct interval mapping', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          'Time Series (Daily)': {
            '2024-11-20': {
              '1. open': '150.00',
              '2. high': '151.50',
              '3. low': '149.75',
              '4. close': '150.50',
              '5. volume': '50000000',
            },
            '2024-11-21': {
              '1. open': '150.50',
              '2. high': '152.00',
              '3. low': '150.00',
              '4. close': '151.75',
              '5. volume': '55000000',
            },
          },
        }),
        { status: 200 },
      ),
    )

    const bars = await provider.getBars('AAPL', '1d', 10)

    expect(bars.length).toBe(2)
    expect(bars[0].open).toBe(150.0)
    expect(bars[0].close).toBe(150.5)
    expect(bars[1].open).toBe(150.5)
    expect(bars[1].close).toBe(151.75)
  })

  it('should handle API timeout', async () => {
    // Simulate abort (timeout).
    fetchSpy.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'))

    await expect(provider.getQuote('AAPL')).rejects.toThrow(MarketDataError)
    await expect(provider.getQuote('AAPL')).rejects.toThrow('NETWORK_ERROR')
  })

  it('should handle rate limit (429) gracefully', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          Note: 'Thank you for using Alpha Vantage! Our standard API call frequency is 5 calls per minute',
        }),
        { status: 200 },
      ),
    )

    await expect(provider.getQuote('AAPL')).rejects.toThrow(MarketDataError)
    await expect(provider.getQuote('AAPL')).rejects.toThrow('NETWORK_ERROR')
  })

  it('should handle invalid symbol', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          'Error Message': 'Invalid API call. Please check the API key and try again.',
        }),
        { status: 200 },
      ),
    )

    await expect(provider.getQuote('INVALID')).rejects.toThrow(MarketDataError)
    await expect(provider.getQuote('INVALID')).rejects.toThrow('NETWORK_ERROR')
  })

  it('should cache quotes with TTL', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          'Global Quote': {
            '01. symbol': 'AAPL',
            '05. price': '150.25',
            '02. open': '149.50',
            '03. high': '151.00',
            '04. low': '149.00',
            '06. volume': '50000000',
            '10. change percent': '0.50%',
          },
        }),
        { status: 200 },
      ),
    )

    // First call: fetches from API.
    const quote1 = await provider.getQuote('AAPL')
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Second call: should use cache.
    const quote2 = await provider.getQuote('AAPL')
    expect(fetchSpy).toHaveBeenCalledTimes(1) // No additional fetch
    expect(quote2.price).toBe(quote1.price)

    // After TTL expires, should fetch again.
    await new Promise(resolve => setTimeout(resolve, 150))
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          'Global Quote': {
            '01. symbol': 'AAPL',
            '05. price': '150.50',
            '02. open': '149.50',
            '03. high': '151.00',
            '04. low': '149.00',
            '06. volume': '50000000',
            '10. change percent': '0.60%',
          },
        }),
        { status: 200 },
      ),
    )

    const quote3 = await provider.getQuote('AAPL')
    expect(fetchSpy).toHaveBeenCalledTimes(2) // New fetch after TTL
    expect(quote3.price).toBe(150.5)
  })

  it('should handle concurrent requests', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          'Global Quote': {
            '01. symbol': 'AAPL',
            '05. price': '150.25',
            '02. open': '149.50',
            '03. high': '151.00',
            '04. low': '149.00',
            '06. volume': '50000000',
            '10. change percent': '0.50%',
          },
        }),
        { status: 200 },
      ),
    )

    // Request 3 concurrent quotes (each calls API).
    const promises = [
      provider.getQuote('AAPL'),
      provider.getQuote('MSFT'),
      provider.getQuote('GOOGL'),
    ]

    const quotes = await Promise.all(promises)

    expect(quotes).toHaveLength(3)
    expect(quotes[0].symbol).toBe('AAPL')
    expect(quotes[1].symbol).toBe('AAPL') // Mocked to return AAPL for all
    expect(quotes[2].symbol).toBe('AAPL')

    // All should have fetched independently (no cache hit for different symbols).
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('should degrade gracefully when API is down', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network error: ECONNREFUSED'))

    await expect(provider.getQuote('AAPL')).rejects.toThrow(MarketDataError)

    // Verify error is wrapped correctly.
    try {
      await provider.getQuote('AAPL')
    } catch (err) {
      if (err instanceof MarketDataError) {
        expect(err.code).toBe('NETWORK_ERROR')
        expect(err.statusCode).toBe(500)
      } else {
        throw err
      }
    }
  })

  it('should map bar intervals correctly to Alpha Vantage functions', async () => {
    // Test 1h interval maps to INTRADAY.
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          'Time Series (Intraday)': {
            '2024-11-21 10:00:00': {
              '1. open': '150.00',
              '2. high': '150.50',
              '3. low': '149.75',
              '4. close': '150.25',
              '5. volume': '5000000',
            },
          },
        }),
        { status: 200 },
      ),
    )

    const bars = await provider.getBars('AAPL', '1h', 10)
    expect(bars.length).toBe(1)
    expect(bars[0].close).toBe(150.25)

    // Verify URL contains interval parameter for intraday.
    const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][0]
    expect(String(lastCall)).toContain('interval=1h')
  })
})
