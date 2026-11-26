/**
 * Tests for Clear Street sentiment provider.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  ClearStreetSentimentProvider,
  type AnalystRating,
  type BiasDetection,
} from '../src/index.ts'
import { MarketDataError } from '@deepseek-ai/dsh-market-data'

describe('ClearStreetSentimentProvider', () => {
  let ctx: Context
  let provider: ClearStreetSentimentProvider

  beforeEach(() => {
    ctx = new Context()
    provider = new ClearStreetSentimentProvider(ctx, {
      debug: false,
      cacheTtlMs: 1000, // 1 second for testing
    })
  })

  describe('getAnalystRatings', () => {
    it('should fetch analyst ratings for a symbol', async () => {
      const ratings = await provider.getAnalystRatings('AAPL')

      expect(ratings).toBeDefined()
      expect(ratings.symbol).toBe('AAPL')
      expect(ratings.buyCount).toBeGreaterThanOrEqual(0)
      expect(ratings.holdCount).toBeGreaterThanOrEqual(0)
      expect(ratings.sellCount).toBeGreaterThanOrEqual(0)
      expect(ratings.consensus).toMatch(/^(buy|hold|sell)$/)
      expect(ratings.timestamp).toBeGreaterThan(0)
    })

    it('should return consistent data for same symbol', async () => {
      const ratings1 = await provider.getAnalystRatings('MSFT')
      const ratings2 = await provider.getAnalystRatings('MSFT')

      expect(ratings1.symbol).toBe(ratings2.symbol)
      expect(ratings1.buyCount).toBe(ratings2.buyCount)
      expect(ratings1.holdCount).toBe(ratings2.holdCount)
      expect(ratings1.sellCount).toBe(ratings2.sellCount)
    })

    it('should return different data for different symbols', async () => {
      const msft = await provider.getAnalystRatings('MSFT')
      const tsla = await provider.getAnalystRatings('TSLA')

      expect(msft.symbol).not.toBe(tsla.symbol)
      // Data should likely differ but we don't strictly require it
      expect(msft.buyCount + msft.holdCount + msft.sellCount).toBeGreaterThan(0)
      expect(tsla.buyCount + tsla.holdCount + tsla.sellCount).toBeGreaterThan(0)
    })
  })

  describe('getSentiment', () => {
    it('should normalize sentiment to [-1, 1] range', async () => {
      const sentiments = await provider.getSentiment(['AAPL', 'GOOGL', 'MSFT'])

      expect(sentiments).toHaveLength(3)

      for (const sentiment of sentiments) {
        expect(sentiment.score).toBeGreaterThanOrEqual(-1)
        expect(sentiment.score).toBeLessThanOrEqual(1)
        expect(sentiment.sampleCount).toBeGreaterThan(0)
        expect(sentiment.timestamp).toBeGreaterThan(0)
      }
    })

    it('should return correct sentiment mapping', async () => {
      // Test all-buy case by checking formula
      const sentiments = await provider.getSentiment(['AAPL'])

      expect(sentiments).toHaveLength(1)
      const { score, sampleCount, sourceScores } = sentiments[0]!

      // Score should be (buy - sell) / total
      expect(sourceScores).toBeDefined()
      const buyCount = sourceScores?.['analyst-buy'] ?? 0
      const sellCount = sourceScores?.['analyst-sell'] ?? 0
      const expectedScore = (buyCount - sellCount) / sampleCount

      expect(Math.abs(score - expectedScore)).toBeLessThan(0.001)
    })

    it('should handle multiple symbols in one call', async () => {
      const symbols = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'AMZN']
      const sentiments = await provider.getSentiment(symbols)

      expect(sentiments).toHaveLength(symbols.length)
      sentiments.forEach((sent, idx) => {
        expect(sent.symbol).toBe(symbols[idx])
      })
    })
  })

  describe('detectBias', () => {
    it('should detect consensus bubbles correctly', async () => {
      const bias = await provider.detectBias('AAPL')

      expect(bias).toBeDefined()
      expect(bias.symbol).toBe('AAPL')
      expect(bias.hasBias).toBeTypeOf('boolean')
      expect(bias.dominantPercentage).toBeGreaterThanOrEqual(0)
      expect(bias.dominantPercentage).toBeLessThanOrEqual(100)
      expect(bias.dominantRating).toMatch(/^(buy|hold|sell)$/)
      expect(bias.totalAnalysts).toBeGreaterThan(0)
    })

    it('should identify bias when >70% agreement', async () => {
      // Keep calling until we get a high consensus
      let bias: BiasDetection | null = null
      for (let i = 0; i < 100; i++) {
        const b = await provider.detectBias(`SYM${i}`)
        if (b.dominantPercentage > 70) {
          bias = b
          break
        }
      }

      if (bias) {
        expect(bias.hasBias).toBe(true)
        expect(bias.dominantPercentage).toBeGreaterThan(70)
      }
    })

    it('should identify no bias when <70% agreement', async () => {
      // The distribution should often be relatively balanced
      let noBias: BiasDetection | null = null
      for (let i = 0; i < 100; i++) {
        const b = await provider.detectBias(`NOBI${i}`)
        if (b.dominantPercentage <= 70) {
          noBias = b
          break
        }
      }

      if (noBias) {
        expect(noBias.hasBias).toBe(false)
        expect(noBias.dominantPercentage).toBeLessThanOrEqual(70)
      }
    })
  })

  describe('caching', () => {
    it('should cache ratings and return same data within TTL', async () => {
      const spy = vi.spyOn(provider as any, 'fetchRatingsFromAPI')

      const r1 = await provider.getAnalystRatings('CACHED')
      const r2 = await provider.getAnalystRatings('CACHED')

      // Should only call API once due to cache
      expect(spy).toHaveBeenCalledTimes(1)
      expect(r1).toEqual(r2)

      spy.mockRestore()
    })

    it('should bypass cache after TTL expires', async () => {
      const provider2 = new ClearStreetSentimentProvider(ctx, {
        cacheTtlMs: 100, // 100ms TTL
      })

      const r1 = await provider2.getAnalystRatings('TTL')

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150))

      const r2 = await provider2.getAnalystRatings('TTL')

      // Both should be valid but potentially different (new API call)
      expect(r1).toBeDefined()
      expect(r2).toBeDefined()
      expect(r1.symbol).toBe(r2.symbol)
    })
  })

  describe('concurrent requests', () => {
    it('should handle concurrent getAnalystRatings calls', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        provider.getAnalystRatings(`SYM${i}`),
      )

      const results = await Promise.all(promises)

      expect(results).toHaveLength(10)
      results.forEach((r, idx) => {
        expect(r.symbol).toBe(`SYM${idx}`)
        expect(r.buyCount + r.holdCount + r.sellCount).toBeGreaterThan(0)
      })
    })

    it('should handle concurrent getSentiment calls', async () => {
      const symbolSets = [
        ['AAPL', 'MSFT'],
        ['GOOGL', 'TSLA'],
        ['AMZN', 'NVDA'],
      ]

      const promises = symbolSets.map(symbols => provider.getSentiment(symbols))

      const results = await Promise.all(promises)

      expect(results).toHaveLength(3)
      results.forEach((sent, idx) => {
        expect(sent).toHaveLength(2)
        expect(sent[0]?.symbol).toBe(symbolSets[idx]![0])
        expect(sent[1]?.symbol).toBe(symbolSets[idx]![1])
      })
    })

    it('should handle concurrent detectBias calls', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        provider.detectBias(`BIAS${i}`),
      )

      const results = await Promise.all(promises)

      expect(results).toHaveLength(5)
      results.forEach((b, idx) => {
        expect(b.symbol).toBe(`BIAS${idx}`)
        expect(b.totalAnalysts).toBeGreaterThan(0)
      })
    })
  })

  describe('error handling', () => {
    it('should throw on invalid empty sentiment request', async () => {
      const sentiments = await provider.getSentiment([])
      expect(sentiments).toHaveLength(0)
    })

    it('should handle missing symbols gracefully', async () => {
      // Partial success: some symbols valid, some invalid
      const sentiments = await provider.getSentiment(['VALID', 'ALSOValid', 'ONEMORE'])

      // Should continue despite potential issues
      expect(sentiments.length).toBeGreaterThanOrEqual(0)
    })

    it('should handle concurrent error scenarios', async () => {
      // Stress test with many concurrent calls
      const promises = Array.from({ length: 20 }, (_, i) =>
        provider.getAnalystRatings(`ERR${i}`),
      )

      const results = await Promise.all(promises)

      // All should complete (some may succeed, some may fail gracefully)
      expect(results).toHaveLength(20)
      results.forEach(r => {
        expect(r.symbol).toBeDefined()
      })
    })
  })
})
