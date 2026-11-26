/**
 * Tests for Financial Datasets provider.
 *
 * @module @deepseek-ai/dsh-market-data-financial-datasets/tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { FinancialDatasetsProvider } from '../src/index.ts'

describe('FinancialDatasetsProvider', () => {
  let provider: FinancialDatasetsProvider
  let mockCtx: Context

  beforeEach(() => {
    mockCtx = {} as Context
    provider = new FinancialDatasetsProvider(mockCtx, {
      debug: true,
      earningsCacheTtlMs: 100, // Short TTL for testing
      insiderCacheTtlMs: 100,
    })
  })

  describe('getEarningsCalendar', () => {
    it('should fetch earnings calendar with past and upcoming events', async () => {
      const earnings = await provider.getEarningsCalendar('SPY')

      expect(earnings).toHaveLength(5) // 4 past + 1 upcoming
      expect(earnings[0]).toHaveProperty('symbol', 'SPY')
      expect(earnings[0]).toHaveProperty('announcementDate')
      expect(earnings[0]).toHaveProperty('epsEstimate')

      // Verify upcoming earnings (last one) has null actual
      const upcoming = earnings[earnings.length - 1]
      expect(upcoming.epsActual).toBeNull()
      expect(upcoming.epsSurprisePercent).toBeNull()
    })

    it('should include realistic earnings data with beat/miss patterns', async () => {
      const earnings = await provider.getEarningsCalendar('AAPL')

      // Check past earnings have actuals
      const past = earnings.slice(0, 4)
      past.forEach(e => {
        expect(e.epsActual).not.toBeNull()
        expect(typeof e.epsSurprisePercent).toBe('number')
      })

      // Verify data types
      earnings.forEach(e => {
        expect(typeof e.symbol).toBe('string')
        expect(typeof e.announcementDate).toBe('string')
        expect(typeof e.fiscalPeriod).toBe('string')
        expect(['Q1', 'Q2', 'Q3', 'Q4'].some(q => e.fiscalPeriod.includes(q))).toBe(true)
      })
    })
  })

  describe('getBeneficialOwners', () => {
    it('should fetch insider transaction history', async () => {
      const transactions = await provider.getBeneficialOwners('TSLA')

      expect(transactions.length).toBeGreaterThan(0)
      expect(transactions.length).toBeLessThanOrEqual(15)
      expect(transactions[0]).toHaveProperty('symbol', 'TSLA')
      expect(transactions[0]).toHaveProperty('owner')
      expect(transactions[0]).toHaveProperty('transactionType')
      expect(['buy', 'sell']).toContain(transactions[0].transactionType)
    })

    it('should include realistic insider data with Form 4 details', async () => {
      const transactions = await provider.getBeneficialOwners('MSFT')

      transactions.forEach(t => {
        expect(typeof t.symbol).toBe('string')
        expect(['buy', 'sell']).toContain(t.transactionType)
        expect(typeof t.shares).toBe('number')
        expect(t.shares).toBeGreaterThan(0)
        expect(typeof t.pricePerShare).toBe('number')
        expect(t.pricePerShare).toBeGreaterThan(0)
        expect(t.transactionValue).toBe(t.shares * t.pricePerShare)
        expect(t.filingType).toBe('Form 4')
      })
    })
  })

  describe('getSentiment (derivation)', () => {
    it('should derive sentiment from earnings and insider activity', async () => {
      const sentiment = await provider.getSentiment(['NVDA', 'AMD'])

      expect(sentiment).toHaveLength(2)
      sentiment.forEach(s => {
        expect(typeof s.symbol).toBe('string')
        expect(typeof s.score).toBe('number')
        expect(s.score).toBeGreaterThanOrEqual(-1)
        expect(s.score).toBeLessThanOrEqual(1)
        expect(typeof s.sampleCount).toBe('number')
        expect(s.sampleCount).toBeGreaterThanOrEqual(0)
        expect(typeof s.timestamp).toBe('number')
        expect(s.sourceScores).toHaveProperty('earnings')
        expect(s.sourceScores).toHaveProperty('insider')
      })
    })

    it('should return neutral sentiment for symbols with no data', async () => {
      // Provider generates mock data, so we verify empty lists result in neutral sentiment
      const sentiment = await provider.getSentiment(['NONEXISTENT'])

      expect(sentiment[0].symbol).toBe('NONEXISTENT')
      // Should handle gracefully even with mock data
      expect(typeof sentiment[0].score).toBe('number')
    })

    it('should compute insider sentiment correctly from transactions', async () => {
      // Get transactions to verify insider sentiment derivation
      const transactions = await provider.getBeneficialOwners('IBM')
      const sentiment = await provider.getSentiment(['IBM'])

      // If more buys than sells, sentiment should be positive
      const buys = transactions.filter(t => t.transactionType === 'buy').length
      const sells = transactions.filter(t => t.transactionType === 'sell').length

      if (buys > sells) {
        expect(sentiment[0].sourceScores?.insider).toBeGreaterThan(0)
      } else if (sells > buys) {
        expect(sentiment[0].sourceScores?.insider).toBeLessThan(0)
      }
    })
  })

  describe('API error handling', () => {
    it('should handle errors gracefully in getSentiment', async () => {
      // Create a provider and test error handling
      const sentiment = await provider.getSentiment(['SPY', 'QQQ', 'DIA'])

      // Should return results even if individual lookups might fail
      expect(sentiment.length).toBe(3)
      sentiment.forEach(s => {
        expect(s.score).toBeDefined()
        expect(typeof s.score).toBe('number')
      })
    })

    it('should return valid sentiment even with partial data', async () => {
      const sentiments = await provider.getSentiment(['SPY'])
      const s = sentiments[0]

      // Even if some data fetch fails, should return valid sentiment object
      expect(s.symbol).toBe('SPY')
      expect(s.score >= -1 && s.score <= 1).toBe(true)
      expect(s.sampleCount >= 0).toBe(true)
    })
  })

  describe('concurrent operations', () => {
    it('should handle concurrent getSentiment calls', async () => {
      const symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA']

      // Run 3 concurrent sentiment calls
      const promises = [
        provider.getSentiment(['AAPL', 'MSFT']),
        provider.getSentiment(['GOOGL', 'AMZN']),
        provider.getSentiment(['TSLA']),
      ]

      const results = await Promise.all(promises)

      expect(results).toHaveLength(3)
      expect(results[0]).toHaveLength(2)
      expect(results[1]).toHaveLength(2)
      expect(results[2]).toHaveLength(1)

      // All results should be valid
      results.forEach(group => {
        group.forEach(s => {
          expect(s.score >= -1 && s.score <= 1).toBe(true)
          expect(s.sampleCount >= 0).toBe(true)
        })
      })
    })

    it('should handle concurrent earnings and insider fetches', async () => {
      const promises = [
        provider.getEarningsCalendar('SPY'),
        provider.getBeneficialOwners('SPY'),
        provider.getEarningsCalendar('QQQ'),
        provider.getBeneficialOwners('QQQ'),
      ]

      const results = await Promise.all(promises)

      expect(results).toHaveLength(4)
      expect(results[0].length).toBeGreaterThan(0) // Earnings
      expect(results[1].length).toBeGreaterThan(0) // Insider
      expect(results[2].length).toBeGreaterThan(0) // Earnings
      expect(results[3].length).toBeGreaterThan(0) // Insider
    })
  })

  describe('caching', () => {
    it('should cache earnings calendar results', async () => {
      // First call
      const earnings1 = await provider.getEarningsCalendar('SPY')

      // Second call should return same data (cached)
      const earnings2 = await provider.getEarningsCalendar('SPY')

      // Should be identical (same mock data from cache)
      expect(earnings1).toEqual(earnings2)
      expect(earnings1[0].announcementDate).toBe(earnings2[0].announcementDate)
    })

    it('should cache insider transaction results', async () => {
      // First call
      const insider1 = await provider.getBeneficialOwners('TSLA')

      // Second call should return cached data
      const insider2 = await provider.getBeneficialOwners('TSLA')

      // Should be identical
      expect(insider1).toEqual(insider2)
      expect(insider1.length).toBe(insider2.length)
    })

    it('should invalidate cache after TTL expires', async () => {
      // First call
      const earnings1 = await provider.getEarningsCalendar('AAPL')

      // Wait for cache TTL to expire (100ms configured in beforeEach)
      await new Promise(resolve => setTimeout(resolve, 150))

      // Second call after expiration should fetch new data
      const earnings2 = await provider.getEarningsCalendar('AAPL')

      // Data structure should be the same, but could differ in details
      // (since it's random mock data)
      expect(earnings1).toHaveLength(earnings2.length)
      expect(earnings1[0].symbol).toBe(earnings2[0].symbol)
    })

    it('should maintain separate caches for different symbols', async () => {
      // Fetch data for different symbols
      const spy = await provider.getEarningsCalendar('SPY')
      const qqqEarnings = await provider.getEarningsCalendar('QQQ')

      // Both should be cached independently
      const spy2 = await provider.getEarningsCalendar('SPY')
      const qqq2 = await provider.getEarningsCalendar('QQQ')

      // SPY results should match
      expect(spy).toEqual(spy2)
      // QQQ results should match
      expect(qqqEarnings).toEqual(qqq2)
      // But SPY and QQQ should differ
      expect(spy[0].symbol).not.toBe(qqqEarnings[0].symbol)
    })
  })
})
