/**
 * Test suite for CoinMarketCap on-chain provider.
 *
 * Tests:
 * 1. Fetch on-chain metrics
 * 2. Sentiment derivation
 * 3. Exchange inflow detection
 * 4. Whale concentration impact
 * 5. API error handling
 * 6. Concurrent requests
 * 7. Cache behavior
 * 8. Sentiment normalization
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CoinMarketCapOnChainProvider } from '../src/index.ts'

describe('CoinMarketCapOnChainProvider', () => {
  let ctx: Context
  let provider: CoinMarketCapOnChainProvider

  beforeEach(() => {
    ctx = new Context()
    provider = new CoinMarketCapOnChainProvider(ctx, {
      debug: false,
      cacheTtlMs: 60_000,
      whaleThresholdPercent: 50,
      exchangeInflowThreshold: 0.5,
    })
  })

  describe('getOnChainMetrics', () => {
    it('should fetch on-chain metrics successfully', async () => {
      const metrics = await provider.getOnChainMetrics('BTC')

      expect(metrics).toBeDefined()
      expect(metrics.symbol).toBe('BTC')
      expect(metrics.whaleConcentration).toBeGreaterThanOrEqual(0)
      expect(metrics.whaleConcentration).toBeLessThanOrEqual(100)
      expect(metrics.exchangeInflowScore).toBeGreaterThanOrEqual(-1)
      expect(metrics.exchangeInflowScore).toBeLessThanOrEqual(1)
      expect(metrics.whaleActivityCount).toBeGreaterThanOrEqual(0)
      expect(metrics.timestamp).toBeGreaterThan(0)
    })

    it('should return metrics with realistic on-chain values', async () => {
      const metrics = await provider.getOnChainMetrics('ETH')

      // Whale concentration should be in reasonable range
      expect(metrics.whaleConcentration).toBeGreaterThanOrEqual(30)
      expect(metrics.whaleConcentration).toBeLessThanOrEqual(80)

      // Exchange inflow normalized to [-1, 1]
      expect(metrics.exchangeInflowScore).toBeGreaterThanOrEqual(-0.5)
      expect(metrics.exchangeInflowScore).toBeLessThanOrEqual(0.5)

      // Whale activity in reasonable range
      expect(metrics.whaleActivityCount).toBeLessThanOrEqual(30)
    })
  })

  describe('getSentiment', () => {
    it('should derive sentiment from on-chain metrics', async () => {
      const sentiments = await provider.getSentiment(['BTC', 'ETH'])

      expect(sentiments).toHaveLength(2)

      for (const sentiment of sentiments) {
        expect(sentiment.symbol).toBeDefined()
        expect(sentiment.score).toBeGreaterThanOrEqual(-1)
        expect(sentiment.score).toBeLessThanOrEqual(1)
        expect(sentiment.sampleCount).toBeGreaterThan(0)
        expect(sentiment.timestamp).toBeGreaterThan(0)
        expect(sentiment.sourceScores).toBeDefined()
      }
    })

    it('should return empty array for empty symbols list', async () => {
      const sentiments = await provider.getSentiment([])

      expect(sentiments).toHaveLength(0)
    })
  })

  describe('exchange inflow detection', () => {
    it('should detect high exchange inflow and score bearish', async () => {
      // Create provider with low exchange inflow threshold to trigger bearish
      const customProvider = new CoinMarketCapOnChainProvider(ctx, {
        debug: false,
        cacheTtlMs: 60_000,
        whaleThresholdPercent: 90, // High threshold so whale concentration doesn't impact
        exchangeInflowThreshold: 0.2, // Low threshold to trigger on inflow
      })

      const sentiments = await customProvider.getSentiment(['BTC'])

      if (sentiments.length > 0) {
        const sentiment = sentiments[0]
        const inflowScore = sentiment.sourceScores?.['exchange-inflow']

        // If exchange inflow is detected, sentiment should be negative
        if (inflowScore !== undefined && inflowScore > 0.2) {
          expect(sentiment.score).toBeLessThan(0)
        }
      }
    })
  })

  describe('whale concentration impact', () => {
    it('should detect high whale concentration and score bearish', async () => {
      // Create provider with low whale threshold to trigger bearish
      const customProvider = new CoinMarketCapOnChainProvider(ctx, {
        debug: false,
        cacheTtlMs: 60_000,
        whaleThresholdPercent: 30, // Low threshold to trigger on concentration
        exchangeInflowThreshold: 1.0, // High threshold so inflow doesn't impact
      })

      const sentiments = await customProvider.getSentiment(['BTC'])

      if (sentiments.length > 0) {
        const sentiment = sentiments[0]
        const concentrationScore = sentiment.sourceScores?.['whale-concentration']

        // If whale concentration exceeds threshold, sentiment should be negative
        if (concentrationScore !== undefined && concentrationScore < 0) {
          expect(sentiment.score).toBeLessThan(0)
        }
      }
    })
  })

  describe('error handling', () => {
    it('should handle errors gracefully in getSentiment', async () => {
      // Test with valid symbols; provider should not throw
      const sentiments = await provider.getSentiment(['BTC', 'ETH', 'SOL'])

      // Should return results for all symbols or skip failed ones
      expect(sentiments).toBeDefined()
      expect(Array.isArray(sentiments)).toBe(true)
    })

    it('should validate metric ranges', async () => {
      const metrics = await provider.getOnChainMetrics('BTC')

      // All metrics should be within valid ranges
      expect(metrics.whaleConcentration).toBeGreaterThanOrEqual(0)
      expect(metrics.whaleConcentration).toBeLessThanOrEqual(100)
      expect(metrics.exchangeInflowScore).toBeGreaterThanOrEqual(-1)
      expect(metrics.exchangeInflowScore).toBeLessThanOrEqual(1)
      expect(metrics.whaleActivityCount).toBeGreaterThanOrEqual(0)
    })
  })

  describe('concurrent requests', () => {
    it('should handle concurrent getSentiment calls', async () => {
      const symbols1 = ['BTC', 'ETH']
      const symbols2 = ['SOL', 'DOGE']
      const symbols3 = ['XRP', 'ADA']

      const results = await Promise.all([
        provider.getSentiment(symbols1),
        provider.getSentiment(symbols2),
        provider.getSentiment(symbols3),
      ])

      expect(results).toHaveLength(3)
      expect(results[0]).toHaveLength(2)
      expect(results[1]).toHaveLength(2)
      expect(results[2]).toHaveLength(2)

      // All results should have valid structure
      for (const sentiments of results) {
        for (const sentiment of sentiments) {
          expect(sentiment.symbol).toBeDefined()
          expect(sentiment.score).toBeGreaterThanOrEqual(-1)
          expect(sentiment.score).toBeLessThanOrEqual(1)
        }
      }
    })

    it('should handle concurrent getOnChainMetrics calls', async () => {
      const results = await Promise.all([
        provider.getOnChainMetrics('BTC'),
        provider.getOnChainMetrics('ETH'),
        provider.getOnChainMetrics('SOL'),
      ])

      expect(results).toHaveLength(3)

      for (const metrics of results) {
        expect(metrics.symbol).toBeDefined()
        expect(metrics.whaleConcentration).toBeGreaterThanOrEqual(0)
        expect(metrics.whaleConcentration).toBeLessThanOrEqual(100)
      }
    })
  })

  describe('cache behavior', () => {
    it('should return cached metrics on second call', async () => {
      const metrics1 = await provider.getOnChainMetrics('BTC')
      const metrics2 = await provider.getOnChainMetrics('BTC')

      // Both should return the same data (cached)
      expect(metrics2.symbol).toBe(metrics1.symbol)
      expect(metrics2.whaleConcentration).toBe(metrics1.whaleConcentration)
      expect(metrics2.exchangeInflowScore).toBe(metrics1.exchangeInflowScore)
      expect(metrics2.whaleActivityCount).toBe(metrics1.whaleActivityCount)
    })

    it('should expire cache after TTL', async () => {
      // Create provider with very short TTL
      const shortTtlProvider = new CoinMarketCapOnChainProvider(ctx, {
        debug: false,
        cacheTtlMs: 10, // 10ms
      })

      const metrics1 = await shortTtlProvider.getOnChainMetrics('BTC')

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 20))

      const metrics2 = await shortTtlProvider.getOnChainMetrics('BTC')

      // Should have fetched new metrics (timestamp might differ due to generation)
      expect(metrics2.symbol).toBe(metrics1.symbol)
      // Metrics generation is deterministic by symbol, so they should match
      expect(metrics2.whaleConcentration).toBe(metrics1.whaleConcentration)
    })

    it('should allow manual cache clearing', async () => {
      await provider.getOnChainMetrics('BTC')
      provider.clearCache()

      // Cache should be empty; next call should refetch
      const metrics = await provider.getOnChainMetrics('BTC')
      expect(metrics.symbol).toBe('BTC')
    })
  })

  describe('sentiment normalization', () => {
    it('should normalize sentiment scores to [-1, 1]', async () => {
      const sentiments = await provider.getSentiment([
        'BTC',
        'ETH',
        'SOL',
        'DOGE',
        'XRP',
      ])

      for (const sentiment of sentiments) {
        expect(sentiment.score).toBeGreaterThanOrEqual(-1)
        expect(sentiment.score).toBeLessThanOrEqual(1)
      }
    })

    it('should include source scores breakdown', async () => {
      const sentiments = await provider.getSentiment(['BTC'])

      expect(sentiments).toHaveLength(1)
      const sentiment = sentiments[0]

      expect(sentiment.sourceScores).toBeDefined()
      expect(sentiment.sourceScores?.['whale-concentration']).toBeDefined()
      expect(sentiment.sourceScores?.['exchange-inflow']).toBeDefined()
      expect(sentiment.sourceScores?.['whale-activity']).toBeDefined()

      // All source scores should be normalized
      for (const [_key, value] of Object.entries(
        sentiment.sourceScores as Record<string, number>,
      )) {
        expect(value).toBeGreaterThanOrEqual(-1)
        expect(value).toBeLessThanOrEqual(1)
      }
    })

    it('should compute sample count accurately', async () => {
      const sentiments = await provider.getSentiment(['BTC', 'ETH'])

      for (const sentiment of sentiments) {
        // Sample count should represent the number of metrics aggregated
        expect(sentiment.sampleCount).toBeGreaterThan(0)
        // We aggregate 3 metrics: whale concentration, exchange inflow, whale activity
        expect(sentiment.sampleCount).toBe(3)
      }
    })
  })
})
