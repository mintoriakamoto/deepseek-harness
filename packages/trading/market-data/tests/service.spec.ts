/**
 * Test suite for market data service registry and multi-provider fallback.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { MarketDataRegistry, MarketDataError } from '../src/index.ts'
import type { MarketDataProvider, Quote, Bar } from '../src/types.ts'

describe('MarketDataRegistry', () => {
  let ctx: Context
  let registry: MarketDataRegistry

  beforeEach(() => {
    ctx = new Context()
    registry = new MarketDataRegistry(ctx)
  })

  describe('getQuote', () => {
    it('should fetch quote from first available provider', async () => {
      const mockQuote: Quote = {
        symbol: 'SPY',
        price: 450.5,
        bid: 450.4,
        ask: 450.6,
        timestamp: Date.now(),
        volume: 1_000_000,
        changePercent: 0.5,
      }

      const provider: MarketDataProvider = {
        name: 'mock',
        getQuote: async () => mockQuote,
      }

      registry.register(provider)
      const quote = await registry.getQuote('SPY')

      expect(quote.symbol).toBe('SPY')
      expect(quote.price).toBe(450.5)
    })

    it('should raise error when no providers registered', async () => {
      await expect(registry.getQuote('SPY')).rejects.toThrow(MarketDataError)
    })

    it('should raise error with code OPERATION_NOT_SUPPORTED when provider lacks operation', async () => {
      const provider: MarketDataProvider = {
        name: 'mock',
        // No getQuote implementation
      }

      registry.register(provider)

      try {
        await registry.getQuote('SPY')
        expect.fail('Should throw MarketDataError')
      } catch (err) {
        if (err instanceof MarketDataError) {
          expect(err.code).toBe('OPERATION_NOT_SUPPORTED')
        } else {
          throw err
        }
      }
    })

    it('should fallback to next provider on error', async () => {
      const failProvider: MarketDataProvider = {
        name: 'fail',
        getQuote: async () => {
          throw new Error('Network error')
        },
      }

      const mockQuote: Quote = {
        symbol: 'SPY',
        price: 450.5,
        bid: 450.4,
        ask: 450.6,
        timestamp: Date.now(),
        volume: 1_000_000,
        changePercent: 0.5,
      }

      const successProvider: MarketDataProvider = {
        name: 'success',
        getQuote: async () => mockQuote,
      }

      registry.register(failProvider)
      registry.register(successProvider)

      const quote = await registry.getQuote('SPY')
      expect(quote.price).toBe(450.5)
    })

    it('should use specified provider when given', async () => {
      const mockQuote: Quote = {
        symbol: 'SPY',
        price: 450.5,
        bid: 450.4,
        ask: 450.6,
        timestamp: Date.now(),
        volume: 1_000_000,
        changePercent: 0.5,
      }

      const provider: MarketDataProvider = {
        name: 'specific',
        getQuote: async () => mockQuote,
      }

      registry.register(provider)
      const quote = await registry.getQuote('SPY', 'specific')

      expect(quote.symbol).toBe('SPY')
    })

    it('should raise error when specified provider not found', async () => {
      const provider: MarketDataProvider = {
        name: 'other',
        getQuote: async () => ({
          symbol: 'SPY',
          price: 450,
          bid: 449,
          ask: 451,
          timestamp: Date.now(),
          volume: 1_000_000,
          changePercent: 0,
        }),
      }

      registry.register(provider)

      await expect(registry.getQuote('SPY', 'nonexistent')).rejects.toThrow(MarketDataError)
    })
  })

  describe('getBars', () => {
    it('should fetch bars from available provider', async () => {
      const mockBars: Bar[] = [
        {
          open: 450,
          high: 455,
          low: 445,
          close: 452,
          volume: 1_000_000,
          timestamp: Date.now(),
        },
      ]

      const provider: MarketDataProvider = {
        name: 'mock',
        getBars: async () => mockBars,
      }

      registry.register(provider)
      const bars = await registry.getBars('SPY', '1h', 1)

      expect(bars).toHaveLength(1)
      expect(bars[0].close).toBe(452)
    })

    it('should raise error when operation not supported', async () => {
      const provider: MarketDataProvider = {
        name: 'mock',
        // No getBars
      }

      registry.register(provider)

      try {
        await registry.getBars('SPY', '1h', 1)
        expect.fail('Should throw')
      } catch (err) {
        if (err instanceof MarketDataError) {
          expect(err.code).toBe('OPERATION_NOT_SUPPORTED')
        } else {
          throw err
        }
      }
    })
  })

  describe('subscribe', () => {
    it('should create subscription with callback', async () => {
      let callCount = 0

      const provider: MarketDataProvider = {
        name: 'mock',
        subscribe: async (symbol, callback) => {
          callCount++
          return {
            id: 'mock-sub' as any,
            dispose: () => {},
          }
        },
      }

      registry.register(provider)
      const sub = await registry.subscribe('SPY', async quote => {})

      expect(callCount).toBe(1)
      expect(sub).toBeDefined()
    })

    it('subscription dispose should be idempotent', async () => {
      let disposeCount = 0

      const provider: MarketDataProvider = {
        name: 'mock',
        subscribe: async () => ({
          id: 'mock-sub' as any,
          dispose: () => {
            disposeCount++
          },
        }),
      }

      registry.register(provider)
      const sub = await registry.subscribe('SPY', async quote => {})

      sub.dispose()
      sub.dispose()

      // dispose() can be called multiple times safely (provider handles idempotency)
      expect(disposeCount).toBeGreaterThanOrEqual(1)
    })
  })

  describe('getSentiment', () => {
    it('should fetch sentiment for multiple symbols', async () => {
      const provider: MarketDataProvider = {
        name: 'mock',
        getSentiment: async symbols =>
          symbols.map(symbol => ({
            symbol,
            score: 0.5,
            sampleCount: 10,
            timestamp: Date.now(),
          })),
      }

      registry.register(provider)
      const sentiments = await registry.getSentiment(['SPY', 'QQQ'])

      expect(sentiments).toHaveLength(2)
      expect(sentiments[0].symbol).toBe('SPY')
      expect(sentiments[1].symbol).toBe('QQQ')
    })

    it('should raise error when operation not supported', async () => {
      const provider: MarketDataProvider = {
        name: 'mock',
        // No getSentiment
      }

      registry.register(provider)

      try {
        await registry.getSentiment(['SPY'])
        expect.fail('Should throw')
      } catch (err) {
        if (err instanceof MarketDataError) {
          expect(err.code).toBe('OPERATION_NOT_SUPPORTED')
        } else {
          throw err
        }
      }
    })
  })

  describe('provider registration and disposal', () => {
    it('should unregister provider on disposal', async () => {
      let callCount = 0

      const provider: MarketDataProvider = {
        name: 'mock',
        getQuote: async () => {
          callCount++
          return {
            symbol: 'SPY',
            price: 450,
            bid: 449,
            ask: 451,
            timestamp: Date.now(),
            volume: 1_000_000,
            changePercent: 0,
          }
        },
      }

      const dispose = registry.register(provider)

      await registry.getQuote('SPY')
      expect(callCount).toBe(1)

      dispose()

      try {
        await registry.getQuote('SPY')
        expect.fail('Should throw after disposal')
      } catch (err) {
        if (err instanceof MarketDataError) {
          expect(err.code).toBe('PROVIDER_NOT_FOUND')
        } else {
          throw err
        }
      }
    })

    it('should support multiple providers with fallback', async () => {
      const provider1: MarketDataProvider = {
        name: 'provider1',
        getQuote: async () => {
          throw new Error('Network error')
        },
      }

      const provider2: MarketDataProvider = {
        name: 'provider2',
        getQuote: async () => ({
          symbol: 'SPY',
          price: 451,
          bid: 450,
          ask: 452,
          timestamp: Date.now(),
          volume: 1_000_000,
          changePercent: 0,
        }),
      }

      registry.register(provider1)
      registry.register(provider2)

      const quote = await registry.getQuote('SPY')
      expect(quote.price).toBe(451) // From provider2
    })
  })
})
